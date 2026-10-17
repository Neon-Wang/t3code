package main

import (
	"context"
	"github.com/coder/websocket"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestTailnetHost(t *testing.T) {
	for host, want := range map[string]bool{"100.64.0.1": true, "100.127.255.254": true, "100.63.0.1": false, "100.128.0.1": false, "fd7a:115c:a1e0::1": true, "example.ts.net": true, "example.ts.net.evil.com": false, "127.0.0.1": false, "192.168.1.1": false, "example.com": false} {
		if got := tailnetHost(host); got != want {
			t.Errorf("%s: got %v", host, got)
		}
	}
}
func testGateway(t *testing.T, handler http.HandlerFunc) *gateway {
	t.Helper()
	backend := httptest.NewServer(handler)
	t.Cleanup(backend.Close)
	g, err := newGateway(func(ctx context.Context, network, addr string) (net.Conn, error) {
		if addr != "100.100.100.100:13773" {
			t.Errorf("unexpected target %s", addr)
		}
		return (&net.Dialer{}).DialContext(ctx, network, strings.TrimPrefix(backend.URL, "http://"))
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(g.close)
	return g
}
func TestGatewayPreservesAuthorizedRequest(t *testing.T) {
	g := testGateway(t, func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if r.Host != "100.100.100.100:13773" || r.URL.EscapedPath() != "/files/a%20b" || r.URL.RawQuery != "ticket=one%2Btwo" || string(body) != "payload" || r.Header.Get("Authorization") != "Bearer test" || r.Header.Get("DPoP") != "proof" || r.Header.Get("Range") != "bytes=1-3" {
			t.Errorf("request changed: %s %s %s", r.Host, r.URL, string(body))
		}
		w.Header().Set("Content-Range", "bytes 1-3/7")
		w.WriteHeader(206)
		_, _ = w.Write([]byte("ayl"))
	})
	routed, err := g.route("http://100.100.100.100:13773/files/a%20b?ticket=one%2Btwo")
	if err != nil {
		t.Fatal(err)
	}
	req, _ := http.NewRequest("POST", routed, strings.NewReader("payload"))
	req.Header.Set("Authorization", "Bearer test")
	req.Header.Set("DPoP", "proof")
	req.Header.Set("Range", "bytes=1-3")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != 206 || res.Header.Get("Content-Range") != "bytes 1-3/7" {
		t.Fatal("range response changed")
	}
}
func TestGatewayRejectsUnknownRoutesAndHost(t *testing.T) {
	calls := 0
	g := testGateway(t, func(w http.ResponseWriter, r *http.Request) { calls++ })
	valid, _ := g.route("http://100.100.100.100:13773/")
	for _, path := range []string{"/", "/wrong/1/", "/" + g.secret + "/999/"} {
		r, err := http.Get("http://" + g.listener.Addr().String() + path)
		if err != nil {
			t.Fatal(err)
		}
		r.Body.Close()
		if r.StatusCode != 404 {
			t.Errorf("status %d", r.StatusCode)
		}
	}
	req, _ := http.NewRequest("GET", valid, nil)
	req.Host = "attacker.example"
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 403 || calls != 0 {
		t.Fatal("unauthorized target was reached")
	}
}
func TestGatewayRoutesSameOriginRedirect(t *testing.T) {
	g := testGateway(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/start" {
			http.Redirect(w, r, "/done", 302)
		} else {
			_, _ = w.Write([]byte("done"))
		}
	})
	routed, _ := g.route("http://100.100.100.100:13773/start")
	res, err := http.Get(routed)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if string(body) != "done" {
		t.Fatal("redirect escaped gateway")
	}
}
func TestGatewayDoesNotRewriteOrdinaryURLs(t *testing.T) {
	g := testGateway(t, func(w http.ResponseWriter, r *http.Request) { t.Fatal("unexpected request") })
	for _, raw := range []string{"https://example.com/x", "file:///tmp/a", "content://local/x", "data:image/png;base64,abc", "http://192.168.1.3:13773/"} {
		got, err := g.route(raw)
		if err != nil || got != raw {
			t.Fatalf("changed %s", raw)
		}
	}
}
func TestWebSocketURLKeepsQueryAndPath(t *testing.T) {
	g := testGateway(t, func(w http.ResponseWriter, r *http.Request) {})
	raw, err := g.route("wss://100.100.100.100:13773/ws?wsTicket=secret&orchestrationProtocol=2")
	if err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(raw)
	if u.Scheme != "ws" || u.Query().Get("wsTicket") != "secret" || !strings.HasSuffix(u.Path, "/ws") {
		t.Fatal("websocket URL changed")
	}
}

func TestGatewayWebViewCORSHasOneOrigin(t *testing.T) {
	g := testGateway(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.WriteHeader(200)
	})
	routed, _ := g.route("http://100.100.100.100:13773/frame")
	req, _ := http.NewRequest("GET", routed, nil)
	req.Header.Set("Origin", "https://localhost")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if origins := res.Header.Values("Access-Control-Allow-Origin"); len(origins) != 1 || origins[0] != "https://localhost" {
		t.Fatalf("invalid CORS origins %v", origins)
	}
}
func TestGatewayScopesCookiesToTheTarget(t *testing.T) {
	g := testGateway(t, func(w http.ResponseWriter, r *http.Request) {
		http.SetCookie(w, &http.Cookie{Name: "session", Value: "test", Path: "/", Domain: "100.100.100.100", Secure: true, HttpOnly: true})
	})
	routed, _ := g.route("https://100.100.100.100:13773/frame")
	// The TLS transport is tested by the standard library; use HTTP for this local origin.
	routed, _ = g.route("http://100.100.100.100:13773/frame")
	res, err := http.Get(routed)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	cookies := res.Cookies()
	if len(cookies) != 1 {
		t.Fatal("cookie missing")
	}
	cookie := cookies[0]
	u, _ := url.Parse(routed)
	if !strings.HasPrefix(u.Path, cookie.Path) || cookie.Path == "/" || cookie.Domain != "" || cookie.Secure || !cookie.HttpOnly {
		t.Fatalf("unscoped cookie: %v", cookie)
	}
}

func TestGatewayRewritesHTMLResources(t *testing.T) {
	g := testGateway(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'none'")
		_, _ = w.Write([]byte(`<!doctype html><html><head></head><body><img src="/image.png"><script src="/app.js"></script><a href="https://public.example/">Public</a></body></html>`))
	})
	routed, _ := g.route("http://100.100.100.100:13773/report/page.html?ticket=t")
	res, err := http.Get(routed)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	prefix := "http://" + g.listener.Addr().String() + "/" + g.secret + "/1"
	for _, part := range []string{prefix + "/image.png", prefix + "/app.js", `href="https://public.example/"`, `window.fetch=function`} {
		if !strings.Contains(string(body), part) {
			t.Fatalf("missing rewritten resource %s", part)
		}
	}
	if !strings.Contains(res.Header.Get("Content-Security-Policy"), "'sha256-") {
		t.Fatal("adapter blocked by CSP")
	}
}
func TestGatewayPreservesUnrestrictedScriptPolicy(t *testing.T) {
	policy := "img-src 'self'"
	if got := allowGatewayScript(policy, "'sha256-test'"); got != policy {
		t.Fatalf("restricted formerly unrestricted scripts: %s", got)
	}
}

func TestInlineCSPRemainsInline(t *testing.T) {
	policy := "default-src 'self'; script-src 'unsafe-inline' https://example.com"
	if got := allowGatewayScript(policy, "'sha256-adapter'"); strings.Contains(got, "sha256") {
		t.Fatalf("hash disabled existing unsafe-inline: %s", got)
	}
}

func TestWebSocketUpgradeRoundTripAndClose(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
		if err != nil {
			return
		}
		defer c.CloseNow()
		for {
			kind, data, err := c.Read(r.Context())
			if err != nil {
				return
			}
			if err = c.Write(r.Context(), kind, data); err != nil {
				return
			}
		}
	}))
	defer backend.Close()
	g, err := newGateway(func(ctx context.Context, network, addr string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, network, strings.TrimPrefix(backend.URL, "http://"))
	})
	if err != nil {
		t.Fatal(err)
	}
	defer g.close()
	routed, _ := g.route("ws://100.100.100.100:13773/ws?ticket=t")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, routed, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer c.CloseNow()
	if err = c.Write(ctx, websocket.MessageText, []byte("hello")); err != nil {
		t.Fatal(err)
	}
	_, data, err := c.Read(ctx)
	if err != nil || string(data) != "hello" {
		t.Fatalf("echo failed: %s %v", data, err)
	}
	g.close()
	if _, _, err = c.Read(ctx); err == nil {
		t.Fatal("socket survived gateway shutdown")
	}
}

func TestGatewayIsolatesUpstreamOrigins(t *testing.T) {
	var calls atomic.Int32
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); w.Write([]byte(r.Host)) }))
	defer backend.Close()
	g, err := newGateway(func(ctx context.Context, network, addr string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, network, strings.TrimPrefix(backend.URL, "http://"))
	})
	if err != nil {
		t.Fatal(err)
	}
	defer g.close()
	a, _ := g.route("http://100.100.100.100:13773/a")
	b, _ := g.route("http://100.100.100.101:13773/b")
	ua, _ := url.Parse(a)
	ub, _ := url.Parse(b)
	if ua.Host == ub.Host {
		t.Fatal("different upstreams share a browser origin")
	}
	for _, raw := range []string{a, b} {
		res, err := http.Get(raw)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != 200 {
			t.Fatal(res.Status)
		}
	}
	before := calls.Load()
	req, _ := http.NewRequest("POST", b, strings.NewReader("attack"))
	req.Header.Set("Origin", "http://"+ua.Host)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 403 || calls.Load() != before {
		t.Fatal("cross-origin request reached upstream")
	}
	// Knowing the first capability must not grant access through the second port.
	res, err = http.Get("http://" + ub.Host + ua.EscapedPath())
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 404 || calls.Load() != before {
		t.Fatal("capability reused across upstreams")
	}
	g.close()
	if _, err := g.route("http://100.100.100.102:13773/"); err == nil {
		t.Fatal("closed gateway created a listener")
	}
	if res, err := http.Get(b); err == nil {
		res.Body.Close()
		t.Fatal("child listener survived close")
	}
}
