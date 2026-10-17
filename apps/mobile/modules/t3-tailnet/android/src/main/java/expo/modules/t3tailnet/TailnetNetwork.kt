package expo.modules.t3tailnet

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import org.json.JSONArray
import org.json.JSONObject

/** Observes existing physical networks without keeping a cellular radio awake. */
object TailnetNetwork {
  private data class Candidate(var capabilities: NetworkCapabilities?, var properties: LinkProperties?)
  private var manager: ConnectivityManager? = null
  private var callback: ConnectivityManager.NetworkCallback? = null
  private val networks = mutableMapOf<Network, Candidate>()
  private val blocked = mutableSetOf<Network>()
  private var lastConfiguration: String? = null
  private var onChanged: (() -> Unit)? = null
  @Volatile var interfaceName: String? = null
    private set
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
        networks.putIfAbsent(network, Candidate(null,null))
        refresh()
      }
      override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) = synchronized(TailnetNetwork) {
        if (callback !== this) return@synchronized
        networks.getOrPut(network) { Candidate(null,null) }.capabilities = caps
        refresh()
      }
      override fun onLinkPropertiesChanged(network: Network, properties: LinkProperties) = synchronized(TailnetNetwork) {
        if (callback !== this) return@synchronized
        networks.getOrPut(network) { Candidate(null,null) }.properties = properties
        refresh()
      }
      override fun onLost(network: Network) = synchronized(TailnetNetwork) {
        if (callback !== this) return@synchronized
        networks.remove(network)
        blocked.remove(network)
        refresh()
      }
      override fun onBlockedStatusChanged(network: Network, isBlocked: Boolean) = synchronized(TailnetNetwork) {
        if (callback !== this) return@synchronized
        if (isBlocked) blocked.add(network) else blocked.remove(network)
        refresh()
      }
    }
    try {
      callback = observer
      cm.registerNetworkCallback(NetworkRequest.Builder()
        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN).build(),observer)
      // Register before the snapshot so a network lost during setup has a queued
      // onLost. Queued callbacks take this same lock after the snapshot completes.
      cm.allNetworks.forEach { networks[it] = Candidate(cm.getNetworkCapabilities(it),cm.getLinkProperties(it)) }
      refresh()
    } catch (_: Exception) {
      callback = null
      runCatching { cm.unregisterNetworkCallback(observer) }
      networks.clear()
      blocked.clear()
      clearBinding()
    }
  }

  @Synchronized fun refresh() {
    try { refreshSelection() } catch (_: Exception) { clearBinding() }
  }

  private fun clearBinding() {
    interfaceName = null
    transport = "unavailable"
    lastConfiguration = null
    runCatching { TailnetBridge.request("network",JSONObject().put("networkHandle",0L)
      .put("dns",JSONArray()).put("interfaces",JSONArray())) }
    runCatching { onChanged?.invoke() }
  }

  private fun refreshSelection() {
    val candidates = networks.mapNotNull { (network, candidate) ->
      val caps = candidate.capabilities ?: return@mapNotNull null
      val props = candidate.properties ?: return@mapNotNull null
      if (network in blocked || !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN) ||
        !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return@mapNotNull null
      val kind = when {
        caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
        else -> return@mapNotNull null
      }
      val rank = (if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) 0 else 10) +
        when (kind) { "wifi" -> 0; "ethernet" -> 1; else -> 2 }
      Pair(rank, Triple(network,kind,props))
    }
    val selected = candidates.sortedWith(compareBy<Pair<Int,Triple<Network,String,LinkProperties>>> { it.first }
      .thenBy { it.second.first.networkHandle }).firstOrNull()?.second
    interfaceName = selected?.third?.interfaceName
    transport = selected?.second ?: "unavailable"
    val dns = JSONArray()
    selected?.third?.dnsServers?.forEach { it.hostAddress?.let { address -> dns.put(address) } }
    val request = JSONObject().put("networkHandle",selected?.first?.networkHandle ?: 0L)
      .put("dns",dns).put("interfaces",TailnetBridge.interfaces(interfaceName))
    val configuration = request.toString()
    if (configuration == lastConfiguration) return
    TailnetBridge.request("network",request)
    lastConfiguration = configuration
    onChanged?.invoke()
  }

  @Synchronized fun detach() {
    val observer = callback
    callback = null
    val cm = manager
    manager = null
    onChanged = null
    blocked.clear()
    networks.clear()
    clearBinding()
    observer?.let { runCatching { cm?.unregisterNetworkCallback(it) } }
  }
}
