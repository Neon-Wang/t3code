package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"

	"golang.org/x/net/html"
)

// HTML lives at a capability-prefixed URL. Rewrite parser-created resources
// before WebView sees them, and adapt later fetches/DOM assignments in-page.
func (g *gateway) rewriteHTML(res *http.Response, original *url.URL, prefix string) {
	if res.StatusCode != http.StatusOK || !strings.HasPrefix(strings.ToLower(res.Header.Get("Content-Type")), "text/html") {
		return
	}
	originalJSON, _ := json.Marshal(original.String())
	originJSON, _ := json.Marshal(original.Scheme + "://" + original.Host)
	baseJSON, _ := json.Marshal("http://" + g.listener.Addr().String() + prefix)
	script := `(()=>{const original=` + string(originalJSON) + `,origin=` + string(originJSON) + `,base=` + string(baseJSON) + `;
const route=(value)=>{try{const u=new URL(String(value),original);if(u.origin===origin)return base+u.pathname+u.search+u.hash;const http=u.protocol==='wss:'?'https:':u.protocol==='ws:'?'http:':null;if(http&&http+'//'+u.host===origin)return base.replace(/^http:/,'ws:')+u.pathname+u.search+u.hash;}catch{}return value;};
const f=window.fetch;window.fetch=function(input,init){return f.call(this,input instanceof Request?new Request(route(input.url),input):route(input),init);};
const open=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url,...args){return open.call(this,method,route(url),...args);};
const WS=window.WebSocket;window.WebSocket=class extends WS{constructor(url,...args){super(route(url),...args);}};
const set=Element.prototype.setAttribute;Element.prototype.setAttribute=function(name,value){return set.call(this,name,/^(src|href|action|poster)$/i.test(name)?route(value):value);};
for(const [type,key]of [[HTMLImageElement,'src'],[HTMLScriptElement,'src'],[HTMLLinkElement,'href'],[HTMLIFrameElement,'src'],[HTMLMediaElement,'src'],[HTMLSourceElement,'src'],[HTMLFormElement,'action']]){const d=Object.getOwnPropertyDescriptor(type.prototype,key);if(d&&d.set)Object.defineProperty(type.prototype,key,{...d,set(value){d.set.call(this,route(value));}});}
})();`
	digest := sha256.Sum256([]byte(script))
	hash := "'sha256-" + base64.StdEncoding.EncodeToString(digest[:]) + "'"
	if policy := res.Header.Get("Content-Security-Policy"); policy != "" {
		res.Header.Set("Content-Security-Policy", allowGatewayScript(policy, hash))
	}
	res.Header.Del("Content-Length")
	res.ContentLength = -1
	res.Header.Del("ETag")
	res.Header.Del("Content-MD5")
	res.Header.Set("Referrer-Policy", "no-referrer")
	source := res.Body
	reader, writer := io.Pipe()
	res.Body = reader
	go func() {
		defer source.Close()
		defer writer.Close()
		tokens := html.NewTokenizer(source)
		injected := false
		writeScript := func() error {
			if injected {
				return nil
			}
			injected = true
			_, err := io.WriteString(writer, "<script>"+script+"</script>")
			return err
		}
		for {
			kind := tokens.Next()
			if kind == html.ErrorToken {
				if err := tokens.Err(); err != io.EOF {
					_ = writer.CloseWithError(err)
				}
				return
			}
			if kind == html.StartTagToken || kind == html.SelfClosingTagToken {
				token := tokens.Token()
				if token.Data == "meta" {
					isCSP := false
					for _, a := range token.Attr {
						if a.Key == "http-equiv" && strings.EqualFold(a.Val, "content-security-policy") {
							isCSP = true
						}
					}
					if isCSP {
						for i, a := range token.Attr {
							if a.Key == "content" {
								token.Attr[i].Val = allowGatewayScript(a.Val, hash)
							}
						}
					}
				}
				// Inject before any script or resource in the document; no executable
				// user content has been parsed when the transport adapter is installed.
				if token.Data != "html" && token.Data != "head" {
					if err := writeScript(); err != nil {
						return
					}
				}
				for i, a := range token.Attr {
					if a.Key != "src" && a.Key != "href" && a.Key != "action" && a.Key != "poster" {
						continue
					}
					ref, err := url.Parse(a.Val)
					if err != nil {
						continue
					}
					absolute := original.ResolveReference(ref)
					if absolute.Scheme == original.Scheme && absolute.Host == original.Host {
						if routed, err := g.route(absolute.String()); err == nil {
							token.Attr[i].Val = routed
						}
					}
				}
				if _, err := io.WriteString(writer, token.String()); err != nil {
					return
				}
				if token.Data == "head" {
					if err := writeScript(); err != nil {
						return
					}
				}
			} else {
				if _, err := writer.Write(tokens.Raw()); err != nil {
					return
				}
			}
		}
	}()
}
func allowGatewayScript(policy, hash string) string {
	parts := strings.Split(policy, ";")
	found := false
	defaultSources := ""
	hasDefault := false
	for i, p := range parts {
		fields := strings.Fields(p)
		if len(fields) == 0 {
			continue
		}
		if fields[0] == "default-src" {
			hasDefault = true
			defaultSources = strings.Join(fields[1:], " ")
		}
		if fields[0] == "script-src" || fields[0] == "script-src-elem" {
			if fields[0] == "script-src" {
				found = true
			}
			hasInline, hasNonceOrHash := false, false
			for _, source := range fields[1:] {
				hasInline = hasInline || source == "'unsafe-inline'"
				hasNonceOrHash = hasNonceOrHash || strings.HasPrefix(source, "'nonce-") || strings.HasPrefix(source, "'sha")
			}
			if hasInline && !hasNonceOrHash {
				continue
			}
			sources := []string{fields[0]}
			for _, v := range fields[1:] {
				if v != "'none'" {
					sources = append(sources, v)
				}
			}
			parts[i] = strings.Join(append(sources, hash), " ")
			if fields[0] == "script-src" {
				found = true
			}
		}
	}
	if !found && hasDefault {
		parts = append(parts, "script-src "+strings.ReplaceAll(defaultSources, "'none'", "")+" "+hash)
	}
	return strings.Join(parts, ";")
}
