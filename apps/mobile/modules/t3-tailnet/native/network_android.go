//go:build android

package main

/*
#cgo LDFLAGS: -landroid
#include <android/multinetwork.h>
#include <errno.h>
static int bindNetwork(unsigned long long network, int fd) {
 if (android_setsocknetwork((net_handle_t)network, fd) == 0) return 0;
 return errno;
}
*/
import "C"

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"net/url"
	"sync"
	"sync/atomic"
	"syscall"

	"tailscale.com/net/netns"
	"tailscale.com/net/tshttpproxy"
)

var dnsOffset atomic.Uint64

var underlying struct {
	sync.RWMutex
	handle  uint64
	dns     []string
	changed chan struct{}
	bindErr error
}

func bindUnderlying(handle uint64, fd uintptr) error {
	if handle == 0 {
		return errors.New("no available non-VPN network")
	}
	if errno := C.bindNetwork(C.ulonglong(handle), C.int(fd)); errno != 0 {
		return syscall.Errno(errno)
	}
	return nil
}

func init() {
	underlying.changed = make(chan struct{})
	waitPlatformNetwork = func(ctx context.Context) error {
		for {
			underlying.RLock()
			handle, changed := underlying.handle, underlying.changed
			underlying.RUnlock()
			if err := ctx.Err(); err != nil {
				return err
			}
			if handle != 0 {
				return nil
			}
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-changed:
			}
		}
	}
	platformStartError = func(err error) error {
		if err == nil {
			return nil
		}
		underlying.RLock()
		defer underlying.RUnlock()
		if underlying.bindErr != nil {
			return fmt.Errorf("%w; last Android socket binding error: %v", err, underlying.bindErr)
		}
		return err
	}
	// Android excludes the netns SOCKS environment adapter. Also explicitly disable
	// HTTP proxy discovery for this embedded Go runtime; never bind the RN process.
	proxyErr := tshttpproxy.SetProxyFunc(func(*url.URL) (*url.URL, error) { return nil, nil })
	// The protect hook cannot be disabled by the control-plane capability that
	// skips Android's optional active-network binding. Binding is our routing policy.
	netns.SetAndroidProtectFunc(func(fd int) error {
		underlying.RLock()
		handle := underlying.handle
		underlying.RUnlock()
		err := bindUnderlying(handle, uintptr(fd))
		if err != nil {
			underlying.Lock()
			underlying.bindErr = fmt.Errorf("network handle %d: %w", handle, err)
			underlying.Unlock()
		}
		return err
	})
	configurePlatformNetwork = func(r request) error {
		dns := make([]string, 0, len(r.DNS))
		for _, raw := range r.DNS {
			if ip, err := netip.ParseAddr(raw); err == nil {
				dns = append(dns, ip.String())
			}
		}
		underlying.Lock()
		underlying.handle = r.NetworkHandle
		underlying.dns = dns
		underlying.bindErr = nil
		close(underlying.changed)
		underlying.changed = make(chan struct{})
		underlying.Unlock()
		return proxyErr
	}
	// Resolve control/DERP names through the selected network's DNS servers.
	// A failed bind must fail the request, never fall back to the VPN resolver.
	net.DefaultResolver = &net.Resolver{PreferGo: true, Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
		underlying.RLock()
		handle := underlying.handle
		dns := append([]string(nil), underlying.dns...)
		underlying.RUnlock()
		if handle == 0 || len(dns) == 0 {
			return nil, errors.New("no DNS on non-VPN network")
		}
		dialer := net.Dialer{Control: func(_, _ string, c syscall.RawConn) error {
			var bindErr error
			if err := c.Control(func(fd uintptr) { bindErr = bindUnderlying(handle, fd) }); err != nil {
				return err
			}
			return bindErr
		}}
		var last error
		// Rotate across the OS-provided servers on retries; UDP connect alone
		// does not establish that a resolver can answer a DNS query.
		start := int((dnsOffset.Add(1) - 1) % uint64(len(dns)))
		for i := range dns {
			server := dns[(start+i)%len(dns)]
			c, err := dialer.DialContext(ctx, network, net.JoinHostPort(server, "53"))
			if err == nil {
				return c, nil
			}
			last = err
		}
		return nil, last
	}}
}
