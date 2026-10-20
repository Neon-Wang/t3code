package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/netip"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Each upstream gets a separate loopback origin and credential, preserving
// browser same-origin boundaries. HTTP requests cannot register destinations.
type gateway struct {
	mu        sync.Mutex
	listener  net.Listener
	server    *http.Server
	transport *http.Transport
	secret    string
	targets   map[string]*url.URL
	origins   map[string]string
	conns     map[net.Conn]struct{}
	children  map[string]*gateway
	closed    bool
}

func tailnetHost(host string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	if ip, err := netip.ParseAddr(host); err == nil {
		ip = ip.Unmap()
		return netip.MustParsePrefix("100.64.0.0/10").Contains(ip) || netip.MustParsePrefix("fd7a:115c:a1e0::/48").Contains(ip)
	}
	return strings.HasSuffix(host, ".ts.net")
}

func newGateway(dial func(context.Context, string, string) (net.Conn, error)) (*gateway, error) {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	secret := make([]byte, 32)
	if _, err = rand.Read(secret); err != nil {
		listener.Close()
		return nil, err
	}
	g := &gateway{listener: listener, secret: hex.EncodeToString(secret), targets: map[string]*url.URL{}, origins: map[string]string{}}
	g.conns = make(map[net.Conn]struct{})
	g.children = make(map[string]*gateway)
	g.listener = &trackedListener{Listener: listener, gateway: g}
	g.transport = &http.Transport{DialContext: dial, ForceAttemptHTTP2: true, MaxIdleConns: 16, IdleConnTimeout: 60 * time.Second, TLSHandshakeTimeout: 15 * time.Second, ResponseHeaderTimeout: 30 * time.Second}
	g.server = &http.Server{Handler: g, ReadHeaderTimeout: 10 * time.Second, MaxHeaderBytes: 1 << 20}
	go func() { _ = g.server.Serve(g.listener) }()
	return g, nil
}
func (g *gateway) close() {
	g.mu.Lock()
	if g.closed {
		g.mu.Unlock()
		return
	}
	g.closed = true
	children := make([]*gateway, 0, len(g.children))
	for _, child := range g.children {
		children = append(children, child)
	}
	conns := make([]net.Conn, 0, len(g.conns))
	for c := range g.conns {
		conns = append(conns, c)
	}
	g.mu.Unlock()
	_ = g.server.Close()
	for _, child := range children {
		child.close()
	}
	for _, c := range conns {
		_ = c.Close()
	}
	g.transport.CloseIdleConnections()
}

type trackedListener struct {
	net.Listener
	gateway *gateway
}

func (l *trackedListener) Accept() (net.Conn, error) {
	c, err := l.Listener.Accept()
	if err != nil {
		return nil, err
	}
	tracked := &trackedConn{Conn: c, gateway: l.gateway}
	l.gateway.mu.Lock()
	if l.gateway.closed {
		l.gateway.mu.Unlock()
		_ = c.Close()
		return nil, net.ErrClosed
	}
	l.gateway.conns[tracked] = struct{}{}
	l.gateway.mu.Unlock()
	return tracked, nil
}

type trackedConn struct {
	net.Conn
	gateway *gateway
}

func (c *trackedConn) Close() error {
	err := c.Conn.Close()
	c.gateway.mu.Lock()
	delete(c.gateway.conns, c)
	c.gateway.mu.Unlock()
	return err
}

func (g *gateway) route(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if !tailnetHost(u.Hostname()) {
		return raw, nil
	}
	if u.User != nil {
		return "", errors.New("URL credentials are not supported")
	}
	scheme := u.Scheme
	if scheme != "http" && scheme != "https" && scheme != "ws" && scheme != "wss" {
		return raw, nil
	}
	upstreamScheme := scheme
	if scheme == "ws" {
		upstreamScheme = "http"
	}
	if scheme == "wss" {
		upstreamScheme = "https"
	}
	origin := upstreamScheme + "://" + u.Host
	g.mu.Lock()
	if g.closed {
		g.mu.Unlock()
		return "", net.ErrClosed
	}
	id, ok := g.origins[origin]
	if !ok && len(g.origins) > 0 {
		child := g.children[origin]
		if child == nil {
			if len(g.children) >= 127 {
				g.mu.Unlock()
				return "", errors.New("Too many tailnet origins")
			}
			child, err = newGateway(g.transport.DialContext)
			if err != nil {
				g.mu.Unlock()
				return "", err
			}
			g.children[origin] = child
		}
		g.mu.Unlock()
		return child.route(raw)
	}
	if !ok {
		id = "1"
		g.origins[origin] = id
		g.targets[id] = &url.URL{Scheme: upstreamScheme, Host: u.Host}
	}
	g.mu.Unlock()
	path := u.EscapedPath()
	if path == "" {
		path = "/"
	}
	result := "http://" + g.listener.Addr().String() + "/" + g.secret + "/" + id + path
	if scheme == "ws" || scheme == "wss" {
		result = "ws" + strings.TrimPrefix(result, "http")
	}
	if u.RawQuery != "" {
		result += "?" + u.RawQuery
	}
	if u.Fragment != "" {
		result += "#" + u.EscapedFragment()
	}
	return result, nil
}
func (g *gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Host != g.listener.Addr().String() {
		http.Error(w, "Invalid gateway host", http.StatusForbidden)
		return
	}
	prefix := "/" + g.secret + "/"
	if !strings.HasPrefix(r.URL.Path, prefix) {
		http.NotFound(w, r)
		return
	}
	rest := strings.TrimPrefix(r.URL.Path, prefix)
	id, _, found := strings.Cut(rest, "/")
	if !found {
		http.NotFound(w, r)
		return
	}
	g.mu.Lock()
	target := g.targets[id]
	g.mu.Unlock()
	if target == nil {
		http.NotFound(w, r)
		return
	}
	rawPrefix := prefix + id
	// Browser/Device WebViews use an app-owned document with this base origin.
	origin := r.Header.Get("Origin")
	// Pages from another routed environment must not send even a simple request.
	if origin != "" && origin != "https://localhost" && origin != "http://"+g.listener.Addr().String() {
		http.Error(w, "Invalid gateway origin", http.StatusForbidden)
		return
	}
	if origin == "https://localhost" || origin == "http://"+g.listener.Addr().String() {
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", r.Header.Get("Access-Control-Request-Headers"))
			w.WriteHeader(http.StatusNoContent)
			return
		}
	}
	proxy := &httputil.ReverseProxy{
		Transport: g.transport,
		Rewrite: func(p *httputil.ProxyRequest) {
			p.Out.URL.Scheme = target.Scheme
			p.Out.URL.Host = target.Host
			p.Out.URL.Path = strings.TrimPrefix(r.URL.Path, rawPrefix)
			p.Out.URL.RawPath = strings.TrimPrefix(r.URL.EscapedPath(), rawPrefix)
			p.Out.Host = target.Host
			// Keep original authorization/DPoP headers; proof URLs name the upstream.
			p.Out.Header.Del("Accept-Encoding")
			p.Out.Header.Del("Forwarded")
			p.Out.Header.Del("X-Forwarded-For")
			p.Out.Header.Del("X-Forwarded-Host")
		},
		ModifyResponse: func(res *http.Response) error {
			if origin == "https://localhost" || origin == "http://"+g.listener.Addr().String() {
				res.Header.Set("Access-Control-Allow-Origin", origin)
				res.Header.Set("Access-Control-Allow-Credentials", "true")
				res.Header.Add("Vary", "Origin")
			}
			// Each upstream has a distinct browser origin and private cookie path.
			// TLS is still verified on the upstream leg.
			cookies := res.Cookies()
			if len(cookies) > 0 {
				res.Header.Del("Set-Cookie")
				for _, cookie := range cookies {
					cookie.Domain = ""
					cookie.Secure = false
					path := cookie.Path
					if path == "" {
						path = "/"
					}
					cookie.Path = rawPrefix + path
					res.Header.Add("Set-Cookie", cookie.String())
				}
			}

			if location := res.Header.Get("Location"); location != "" {
				u, err := url.Parse(location)
				if err == nil {
					base := *r.URL
					base.Scheme = target.Scheme
					base.Host = target.Host
					base.Path = strings.TrimPrefix(r.URL.Path, rawPrefix)
					base.RawPath = strings.TrimPrefix(r.URL.EscapedPath(), rawPrefix)
					absolute := base.ResolveReference(u)
					if absolute.Scheme == target.Scheme && absolute.Host == target.Host {
						if routed, err := g.route(absolute.String()); err == nil {
							res.Header.Set("Location", routed)
						}
					}
				}
			}
			original := *r.URL
			original.Scheme = target.Scheme
			original.Host = target.Host
			original.Path = strings.TrimPrefix(r.URL.Path, rawPrefix)
			original.RawPath = strings.TrimPrefix(r.URL.EscapedPath(), rawPrefix)
			if r.Method != http.MethodHead {
				g.rewriteHTML(res, &original, rawPrefix)
			}
			return nil
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			if origin == "https://localhost" || origin == "http://"+g.listener.Addr().String() {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
			}
			http.Error(w, "Tailnet connection unavailable", http.StatusBadGateway)
		},
		ErrorLog: nil,
	}
	// No error or access log may contain the private gateway credential or tickets.
	proxy.ErrorLog = discardLogger()
	proxy.ServeHTTP(w, r)
}
func discardLogger() *log.Logger { return log.New(io.Discard, "", 0) }
