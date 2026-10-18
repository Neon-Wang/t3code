package main

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
)

func TestStartupWaitsForNetworkAndCanBeStopped(t *testing.T) {
	original := waitPlatformNetwork
	entered := make(chan struct{})
	waitPlatformNetwork = func(ctx context.Context) error {
		close(entered)
		<-ctx.Done()
		return ctx.Err()
	}
	t.Cleanup(func() { _ = stop(); waitPlatformNetwork = original })
	if err := start(request{Directory: t.TempDir()}); err != nil {
		t.Fatal(err)
	}
	<-entered
	value, err := call(request{Method: "status"})
	if err != nil {
		t.Fatal(err)
	}
	if value.(map[string]any)["state"] != "Starting" {
		t.Fatalf("status = %v", value)
	}
	if err := stop(); err != nil {
		t.Fatal(err)
	}
	value, err = call(request{Method: "status"})
	if err != nil || value.(map[string]any)["state"] != "Stopped" {
		t.Fatalf("status = %v, %v", value, err)
	}
}

func TestStartRebuildsFailedNode(t *testing.T) {
	original := waitPlatformNetwork
	failure := errors.New("network binding failed")
	waitPlatformNetwork = func(context.Context) error { return failure }
	t.Cleanup(func() { _ = stop(); waitPlatformNetwork = original })
	r := request{Directory: t.TempDir()}
	if err := start(r); err != nil {
		t.Fatal(err)
	}
	state.Lock()
	ready, previous := state.ready, state.node
	state.Unlock()
	<-ready
	if _, err := call(request{Method: "status"}); !errors.Is(err, failure) {
		t.Fatalf("error = %v", err)
	}
	waitPlatformNetwork = func(ctx context.Context) error { <-ctx.Done(); return ctx.Err() }
	if err := start(r); err != nil {
		t.Fatal(err)
	}
	state.Lock()
	next := state.node
	state.Unlock()
	if next == previous {
		t.Fatal("retry retained failed tsnet node")
	}
	value, err := call(request{Method: "status"})
	if err != nil || value.(map[string]any)["state"] != "Starting" {
		t.Fatalf("status = %v, %v", value, err)
	}
}

func TestGatewayCannotStartNodeOutsideStartupLifecycle(t *testing.T) {
	original := waitPlatformNetwork
	entered := make(chan struct{})
	var calls atomic.Int32
	waitPlatformNetwork = func(ctx context.Context) error {
		if calls.Add(1) != 1 {
			return errors.New("gateway attempted independent startup")
		}
		close(entered)
		<-ctx.Done()
		return ctx.Err()
	}
	t.Cleanup(func() { _ = stop(); waitPlatformNetwork = original })
	if err := start(request{Directory: t.TempDir()}); err != nil {
		t.Fatal(err)
	}
	<-entered
	state.Lock()
	g := state.gateway
	state.Unlock()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := g.transport.DialContext(ctx, "tcp", "100.64.0.1:13773"); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled dial = %v", err)
	}
	if err := stop(); err != nil {
		t.Fatal(err)
	}
	if _, err := g.transport.DialContext(context.Background(), "tcp", "100.64.0.1:13773"); !errors.Is(err, context.Canceled) {
		t.Fatalf("stopped dial = %v", err)
	}
	if calls.Load() != 1 {
		t.Fatalf("startup attempts = %d", calls.Load())
	}
}

func TestNetworkPublishesInterfacesBeforeWakingStartup(t *testing.T) {
	original := configurePlatformNetwork
	t.Cleanup(func() { configurePlatformNetwork = original; _ = setInterfaces(nil) })
	configurePlatformNetwork = func(request) error {
		interfaces.RLock()
		defer interfaces.RUnlock()
		if len(interfaces.values) != 1 || interfaces.values[0].Name != "test-uplink" {
			t.Fatal("startup woke before interface snapshot was published")
		}
		return nil
	}
	if _, err := call(request{Method: "network", Interfaces: []interfaceInput{{Name: "test-uplink"}}}); err != nil {
		t.Fatal(err)
	}
}
