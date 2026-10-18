//go:build android

package main

/*
#include <stdlib.h>
typedef char* (*proxy_resolver)(const char*);
static char* resolveSystemProxy(void* resolver, const char* url) {
 return ((proxy_resolver)resolver)(url);
}
*/
import "C"

import (
	"context"
	"errors"
	"net/url"
	"sync"
	"sync/atomic"
	"unsafe"

	"tailscale.com/net/tshttpproxy"
)

var systemProxyResolver atomic.Pointer[byte]

//export T3TailnetSetProxyResolver
func T3TailnetSetProxyResolver(resolver unsafe.Pointer) {
	systemProxyResolver.Store((*byte)(resolver))
}

var systemNetwork struct {
	sync.RWMutex
	available bool
	changed   chan struct{}
}

func init() {
	systemNetwork.changed = make(chan struct{})
	waitPlatformNetwork = func(ctx context.Context) error {
		for {
			systemNetwork.RLock()
			available, changed := systemNetwork.available, systemNetwork.changed
			systemNetwork.RUnlock()
			if err := ctx.Err(); err != nil {
				return err
			}
			if available {
				return nil
			}
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-changed:
			}
		}
	}
	// Resolve HTTP proxies through Android's unchanged system ProxySelector,
	// using its preferred proxy and exclusions. Sockets and DNS use Android's default route;
	// there is deliberately no protect/bind hook or custom DNS resolver.
	proxyErr := tshttpproxy.SetProxyFunc(func(target *url.URL) (*url.URL, error) {
		resolver := systemProxyResolver.Load()
		if resolver == nil {
			return nil, errors.New("Android proxy resolver unavailable")
		}
		input := C.CString(target.String())
		defer C.free(unsafe.Pointer(input))
		output := C.resolveSystemProxy(unsafe.Pointer(resolver), input)
		if output == nil {
			return nil, errors.New("Android system proxy lookup failed")
		}
		defer C.free(unsafe.Pointer(output))
		address := C.GoString(output)
		if address == "" {
			return nil, nil
		}
		return url.Parse(address)
	})
	configurePlatformNetwork = func(r request) error {
		systemNetwork.Lock()
		systemNetwork.available = r.NetworkHandle != 0
		close(systemNetwork.changed)
		systemNetwork.changed = make(chan struct{})
		systemNetwork.Unlock()
		return proxyErr
	}
}
