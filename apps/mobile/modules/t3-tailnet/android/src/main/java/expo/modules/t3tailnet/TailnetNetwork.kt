package expo.modules.t3tailnet

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import org.json.JSONObject
import org.json.JSONArray

/** Observes Android's default route, including a campus VPN, without selecting a network. */
object TailnetNetwork {
  private var manager: ConnectivityManager? = null
  private var callback: ConnectivityManager.NetworkCallback? = null
  private var current: Network? = null
  private var capabilities: NetworkCapabilities? = null
  private var blocked = false
  private var lastConfiguration: String? = null
  private var onChanged: (() -> Unit)? = null
  @Volatile var transport = "unavailable"
    private set

  @Synchronized fun attach(context: Context, changed: () -> Unit) {
    if (callback != null) return
    val cm = context.applicationContext.getSystemService(ConnectivityManager::class.java)
    manager = cm
    onChanged = changed
    val observer = object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) = synchronized(TailnetNetwork) {
        if (callback !== this) return@synchronized
        current = network
        capabilities = null
        blocked = false
      }
      override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) = synchronized(TailnetNetwork) {
        if (callback !== this || network != current) return@synchronized
        capabilities = caps
        refresh()
      }
      override fun onLinkPropertiesChanged(network: Network, properties: LinkProperties) = synchronized(TailnetNetwork) {
        if (callback !== this || network != current) return@synchronized
        refresh()
      }
      override fun onLost(network: Network) = synchronized(TailnetNetwork) {
        if (callback !== this || network != current) return@synchronized
        current = null
        capabilities = null
        refresh()
      }
      override fun onBlockedStatusChanged(network: Network, isBlocked: Boolean) = synchronized(TailnetNetwork) {
        if (callback !== this || network != current) return@synchronized
        blocked = isBlocked
        refresh()
      }
    }
    try {
      callback = observer
      cm.registerDefaultNetworkCallback(observer)
      current = cm.activeNetwork
      capabilities = current?.let(cm::getNetworkCapabilities)
      refresh()
    } catch (_: Exception) {
      callback = null
      runCatching { cm.unregisterNetworkCallback(observer) }
      current = null
      capabilities = null
      refresh()
    }
  }

  @Synchronized fun refresh() {
    try { refreshSelection() } catch (_: Exception) {
      transport = "unavailable"
      lastConfiguration = null
      runCatching { TailnetBridge.request("network",JSONObject().put("networkHandle",0L).put("interfaces",JSONArray())) }
      runCatching { onChanged?.invoke() }
    }
  }

  private fun refreshSelection() {
    val caps = capabilities
    val available = current != null && !blocked && caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    transport = when {
      !available -> "unavailable"
      caps!!.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "vpn"
      caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
      caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
      caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
      else -> "system"
    }
    val request = JSONObject().put("networkHandle",if (available) current!!.networkHandle else 0L)
      .put("interfaces",TailnetBridge.interfaces())
    val configuration = request.toString()
    if (configuration == lastConfiguration) return
    TailnetBridge.request("network",request)
    lastConfiguration = configuration
    runCatching { onChanged?.invoke() }
  }

  @Synchronized fun detach() {
    val observer = callback
    callback = null
    val cm = manager
    manager = null
    onChanged = null
    blocked = false
    current = null
    capabilities = null
    lastConfiguration = null
    runCatching { refresh() }
    observer?.let { runCatching { cm?.unregisterNetworkCallback(it) } }
  }
}
