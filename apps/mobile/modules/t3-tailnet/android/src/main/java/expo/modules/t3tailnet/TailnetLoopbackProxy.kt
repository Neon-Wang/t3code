package expo.modules.t3tailnet

import java.io.IOException
import java.net.Proxy
import java.net.ProxySelector
import java.net.SocketAddress
import java.net.URI

/** App-local transports must never be sent to an external HTTP/SOCKS proxy. */
class TailnetLoopbackProxy(private val delegate: ProxySelector?) : ProxySelector() {
  override fun select(uri: URI): List<Proxy> {
    if (uri.host in setOf("127.0.0.1", "localhost", "::1", "[::1]")) return listOf(Proxy.NO_PROXY)
    return delegate?.select(uri) ?: listOf(Proxy.NO_PROXY)
  }
  override fun connectFailed(uri: URI, address: SocketAddress, error: IOException) {
    delegate?.connectFailed(uri,address,error)
  }
  companion object {
    @Synchronized fun install() {
      val current = getDefault()
      if (current !is TailnetLoopbackProxy) setDefault(TailnetLoopbackProxy(current))
    }
  }
}
