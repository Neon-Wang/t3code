//go:build android

package main

// Android app UIDs have no resolv.conf; use Tailscale's Android DNS integration.
import _ "tailscale.com/feature/androiddns"
