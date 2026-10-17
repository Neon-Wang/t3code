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

var state struct {
	sync.Mutex
	node     *tsnet.Server
	gateway  *gateway
	startErr error
	ready    chan struct{}
}
var interfaces struct {
	sync.RWMutex
	values []netmon.Interface
}

type request struct {
	Method     string           `json:"method"`
	Directory  string           `json:"directory"`
	URL        string           `json:"url"`
	Interfaces []interfaceInput `json:"interfaces"`
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
	gateway, err := newGateway(node.Dial)
	if err != nil {
		return err
	}
	state.node = node
	state.gateway = gateway
	state.startErr = nil
	state.ready = make(chan struct{})
	ready := state.ready
	go func() {
		err := node.Start()
		state.Lock()
		if state.node == node {
			state.startErr = err
		}
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
	node, gateway, ready := state.node, state.gateway, state.ready
	state.Unlock()
	if node == nil {
		return nil
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
		return map[string]any{"state": status.BackendState, "loginUrl": status.AuthURL, "ips": status.TailscaleIPs}, nil
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
