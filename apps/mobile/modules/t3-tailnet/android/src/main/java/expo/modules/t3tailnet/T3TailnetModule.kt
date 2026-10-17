package expo.modules.t3tailnet

import android.content.Context
import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.net.NetworkInterface
import org.json.JSONArray
import org.json.JSONObject

object TailnetBridge {
  @Volatile var foreground = true
  init { System.loadLibrary("t3tailnet") }
  private external fun call(request: String): String
  fun request(method: String, values: JSONObject = JSONObject()): JSONObject {
    values.put("method", method)
    val response = JSONObject(call(values.toString()))
    if (response.has("error")) throw IllegalStateException(response.getString("error"))
    return response
  }
  fun interfaces(interfaceName: String? = TailnetNetwork.interfaceName): JSONArray {
    val result = JSONArray()
    val interfaces = NetworkInterface.getNetworkInterfaces() ?: return result
    while (interfaces.hasMoreElements()) {
      val entry = interfaces.nextElement()
      if (!entry.isLoopback && entry.name != interfaceName) continue
      val addresses = JSONArray()
      for (address in entry.interfaceAddresses) {
        val ip = address.address.hostAddress?.substringBefore('%') ?: continue
        addresses.put("$ip/${address.networkPrefixLength}")
      }
      val flags = (if (entry.isUp) 33 else 0) or (if (entry.isLoopback) 4 else 0) or
        (if (entry.isPointToPoint) 8 else 0) or (if (entry.supportsMulticast()) 16 else 0)
      result.put(JSONObject().put("Name",entry.name).put("Index",entry.index)
        .put("MTU",entry.mtu).put("Flags",flags).put("Addresses",addresses))
    }
    return result
  }
  fun start(context: Context) {
    request("start",JSONObject().put("directory",File(context.noBackupFilesDir,"tailnet").absolutePath)
      .put("interfaces",interfaces()))
  }
  fun preferences(context: Context) = context.getSharedPreferences("t3-tailnet",Context.MODE_PRIVATE)
}

class T3TailnetModule : Module() {
  private fun context() = requireNotNull(appContext.reactContext)
  private fun refreshNetwork() { TailnetNetwork.refresh() }
  override fun definition() = ModuleDefinition {
    Name("T3Tailnet")
    Events("onNetworkChanged")
    OnCreate {
      TailnetLoopbackProxy.install()
      val context = context()
      TailnetBackgroundTask.attach(context as com.facebook.react.bridge.ReactContext)
      TailnetNetwork.attach(context) { sendEvent("onNetworkChanged",emptyMap<String,String>()) }
      if (TailnetBridge.preferences(context).getBoolean("enabled",false)) runCatching { TailnetBridge.start(context) }
    }
    OnDestroy {
      TailnetBackgroundTask.detach()
      TailnetNetwork.detach()
    }
    OnActivityEntersBackground { TailnetBridge.foreground = false }
    OnActivityEntersForeground {
      TailnetLoopbackProxy.install()
      TailnetBridge.foreground = true
      runCatching { refreshNetwork() }
      if (TailnetBridge.preferences(context()).getBoolean("background",false)) {
        TailnetConnectionService.start(context())
      }
    }
    Function("route") { url: String ->
      TailnetBridge.request("route",JSONObject().put("url",url)).getString("value")
    }
    AsyncFunction("setEnabled") { enabled: Boolean ->
      if (enabled) { TailnetNetwork.refresh(); TailnetBridge.start(context()) } else TailnetBridge.request("stop")
      TailnetBridge.preferences(context()).edit().putBoolean("enabled",enabled).apply()
      sendEvent("onNetworkChanged",emptyMap<String,String>())
    }
    AsyncFunction("setInterfaceLanguage") { locale: String, labels: Map<String,String> ->
      require(locale=="en" || locale=="zh-CN")
      val edit=context().getSharedPreferences("t3-interface-language",Context.MODE_PRIVATE).edit().putString("locale",locale)
      for ((key,value) in labels) edit.putString("tailnet.$key",value)
      edit.apply()
      if (TailnetBridge.preferences(context()).getBoolean("background",false)) TailnetConnectionService.start(context())
    }
    AsyncFunction("status") {
      val preferences = TailnetBridge.preferences(context())
      val result = TailnetBridge.request("status").getJSONObject("value")
      result.put("uplink",TailnetNetwork.transport)
      result.put("enabled",preferences.getBoolean("enabled",false))
      result.put("background",preferences.getBoolean("background",false))
      result.toString()
    }
    AsyncFunction("logout") {
      TailnetBridge.request("logout")
      TailnetBridge.preferences(context()).edit().putBoolean("enabled",false).apply()
      sendEvent("onNetworkChanged",emptyMap<String,String>())
    }
    AsyncFunction("notifyCritical") { key: String, title: String, message: String, deepLink: String ->
      TailnetTaskNotifications.show(context(),key,title,message,deepLink)
    }
    AsyncFunction("setBackgroundEnabled") { enabled: Boolean ->
      if (enabled) TailnetConnectionService.start(context())
      else context().stopService(Intent(context(),TailnetConnectionService::class.java))
      TailnetBridge.preferences(context()).edit().putBoolean("background",enabled).apply()
    }
  }
}
