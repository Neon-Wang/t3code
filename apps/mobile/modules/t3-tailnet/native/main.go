package main

/*
#include <stdlib.h>
*/
import "C"
import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"os"
	"path/filepath"
	"sync"
	"time"
	"unsafe"

	"tailscale.com/net/netmon"
	"tailscale.com/tsnet"
)

var lifecycle sync.Mutex

var configurePlatformNetwork = func(request) error { return nil }
var waitPlatformNetwork = func(context.Context) error { return nil }
var platformStartError = func(err error) error { return err }

var state struct {
	sync.Mutex
	node     *tsnet.Server
	gateway  *gateway
	startErr error
	ready    chan struct{}
	cancel   context.CancelFunc
}
var interfaces struct {
	sync.RWMutex
	values []netmon.Interface
}

type request struct {
	NetworkHandle uint64           `json:"networkHandle"`
	DNS           []string         `json:"dns"`
	Method        string           `json:"method"`
	Directory     string           `json:"directory"`
	URL           string           `json:"url"`
	Interfaces    []interfaceInput `json:"interfaces"`
}
type interfaceInput struct {
	Name       string
	Index, MTU int
	Flags      uint
	Addresses  []string
}

func setInterfaces(input []interfaceInput) error {
	values := make([]netmon.Interface, 0, len(input))
	for _, i := range input {
		v := netmon.Interface{Interface: &net.Interface{Name: i.Name, Index: i.Index, MTU: i.MTU, Flags: net.Flags(i.Flags)}, AltAddrs: []net.Addr{}}
		for _, raw := range i.Addresses {
			ip, prefix, err := net.ParseCIDR(raw)
			if err != nil {
				return err
			}
			prefix.IP = ip
			v.AltAddrs = append(v.AltAddrs, prefix)
		}
		values = append(values, v)
	}
	interfaces.Lock()
	interfaces.values = values
	interfaces.Unlock()
	return nil
}
func init() {
	netmon.RegisterInterfaceGetter(func() ([]netmon.Interface, error) {
		interfaces.RLock()
		defer interfaces.RUnlock()
		return append([]netmon.Interface(nil), interfaces.values...), nil
	})
}
func quiet(string, ...any) {}
func start(r request) error {
	lifecycle.Lock()
	defer lifecycle.Unlock()
	if !filepath.IsAbs(r.Directory) {
		return errors.New("Private state directory required")
	}
	if err := setInterfaces(r.Interfaces); err != nil {
		return err
	}
	state.Lock()
	if state.node != nil && state.startErr != nil {
		state.Unlock()
		if err := stopLocked(); err != nil {
			return err
		}
		state.Lock()
	}
	defer state.Unlock()
	if state.node != nil {
		return nil
	}
	logs := filepath.Join(r.Directory, "logs")
	if err := os.MkdirAll(logs, 0700); err != nil {
		return err
	}
	if err := os.Setenv("TS_LOGS_DIR", logs); err != nil {
		return err
	}
	node := &tsnet.Server{Dir: r.Directory, Hostname: "t3-android", UserLogf: quiet, Logf: quiet}
	ctx, cancel := context.WithCancel(context.Background())
	ready := make(chan struct{})
	var startupErr error
	gateway, err := newGateway(func(requestCtx context.Context, network, address string) (net.Conn, error) {
		// Dial implicitly calls Start. Only enter it after our startup has finished,
		// so shutdown cannot race a second, gateway-triggered initialization.
		select {
		case <-requestCtx.Done():
			return nil, requestCtx.Err()
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-ready:
		}
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if startupErr != nil {
			return nil, startupErr
		}
		return node.Dial(requestCtx, network, address)
	})
	if err != nil {
		cancel()
		return err
	}
	state.node = node
	state.gateway = gateway
	state.startErr = nil
	state.ready = ready
	state.cancel = cancel
	go func() {
		// Android callbacks may arrive after module creation. Keep the gateway
		// alive but do not poison tsnet's one-shot Start before an uplink exists.
		err := waitPlatformNetwork(ctx)
		if err == nil {
			err = platformStartError(node.Start())
		}
		state.Lock()
		if state.node == node {
			state.startErr = err
		}
		startupErr = err
		close(ready)
		state.Unlock()
	}()
	return nil
}
func current() (*tsnet.Server, error) {
	state.Lock()
	node, ready := state.node, state.ready
	state.Unlock()
	if node == nil {
		return nil, nil
	}
	select {
	case <-ready:
	case <-time.After(3 * time.Second):
		return nil, errors.New("Starting tailnet node")
	}
	state.Lock()
	defer state.Unlock()
	if state.node != node {
		return nil, errors.New("Tailnet state changed")
	}
	return node, state.startErr
}
func stop() error {
	lifecycle.Lock()
	defer lifecycle.Unlock()
	return stopLocked()
}
func stopLocked() error {
	state.Lock()
	node, gateway, ready, cancel := state.node, state.gateway, state.ready, state.cancel
	state.Unlock()
	if node == nil {
		return nil
	}
	if cancel != nil {
		cancel()
	}
	if gateway != nil {
		gateway.close()
	}
	<-ready
	err := node.Close()
	state.Lock()
	state.node = nil
	state.gateway = nil
	state.startErr = nil
	state.Unlock()
	return err
}

func call(r request) (any, error) {
	switch r.Method {
	case "start":
		return nil, start(r)
	case "interfaces":
		return nil, setInterfaces(r.Interfaces)
	case "network":
		// Publish interfaces before waking a startup waiting for this network.
		if err := setInterfaces(r.Interfaces); err != nil {
			return nil, err
		}
		if err := configurePlatformNetwork(r); err != nil {
			return nil, err
		}
		state.Lock()
		n, ready := state.node, state.ready
		if n != nil {
			select {
			case <-ready:
				if state.startErr == nil {
					n.Sys().NetMon.Get().InjectEvent()
				}
			default:
			}
		}
		state.Unlock()
		return nil, nil
	case "stop":
		return nil, stop()
	case "route":
		state.Lock()
		g := state.gateway
		state.Unlock()
		if g == nil {
			return r.URL, nil
		}
		return g.route(r.URL)
	case "status":
		state.Lock()
		if state.node != nil {
			select {
			case <-state.ready:
			default:
				state.Unlock()
				return map[string]any{"state": "Starting", "ips": []string{}}, nil
			}
		}
		state.Unlock()
		n, err := current()
		if err != nil {
			return nil, err
		}
		if n == nil {
			return map[string]any{"state": "Stopped", "ips": []string{}}, nil
		}
		client, err := n.LocalClient()
		if err != nil {
			return nil, err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		status, err := client.StatusWithoutPeers(ctx)
		if err != nil {
			return nil, err
		}
		ips := make([]string, 0, len(status.TailscaleIPs))
		for _, ip := range status.TailscaleIPs {
			ips = append(ips, ip.String())
		}
		return map[string]any{"state": status.BackendState, "loginUrl": status.AuthURL, "ips": ips}, nil
	case "logout":
		lifecycle.Lock()
		defer lifecycle.Unlock()
		n, err := current()
		if err != nil {
			return nil, err
		}
		if n == nil {
			return nil, errors.New("Start the node before signing out")
		}
		client, err := n.LocalClient()
		if err != nil {
			return nil, err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := client.Logout(ctx); err != nil {
			return nil, err
		}
		return nil, stopLocked()
	default:
		return nil, errors.New("Unknown tailnet operation")
	}
}

//export T3TailnetCall
func T3TailnetCall(raw *C.char) *C.char {
	var req request
	var result any
	var err error
	if err = json.Unmarshal([]byte(C.GoString(raw)), &req); err == nil {
		result, err = call(req)
	}
	response := map[string]any{"value": result}
	if err != nil {
		response = map[string]any{"error": err.Error()}
	}
	encoded, _ := json.Marshal(response)
	return C.CString(string(encoded))
}

//export T3TailnetFree
func T3TailnetFree(p *C.char) { C.free(unsafe.Pointer(p)) }
func main()                   {}
