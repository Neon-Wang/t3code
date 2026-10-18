package expo.modules.t3nativecontrols

import android.content.Intent
import android.webkit.WebView
import android.webkit.WebResourceRequest
import com.reactnativecommunity.webview.RNCWebViewClient
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.bridge.ReactContext
import expo.modules.kotlin.functions.Queues
import android.text.format.DateFormat
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.net.URI

class T3NativeControlsModule : Module() {
  private var filePreviewPromise: Promise? = null

  @Suppress("TooGenericExceptionCaught") // Clear the pending promise before rethrowing.
  override fun definition() = ModuleDefinition {
    Name("T3NativeControls")
    Events("onBrowserDownload")

    // Install before loading a remote page. RN WebView's default Android
    // listener delegates to DownloadManager, which lacks the App's tailnet/auth.
    AsyncFunction("captureBrowserDownloads") { viewTag: Int ->
      val context = requireNotNull(appContext.reactContext) as ReactContext
      val root = requireNotNull(UIManagerHelper.getUIManagerForReactTag(context,viewTag)?.resolveView(viewTag))
      val webView = requireNotNull(BrowserDownloads.webView(root))
      // RN WebView 14 drops isForMainFrame before its JS event. Keep iframe
      // navigations in the child frame instead of promoting them to the top page.
      webView.webViewClient = object : RNCWebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
          if (!request.isForMainFrame) return false
          return super.shouldOverrideUrlLoading(view,request)
        }
      }
      webView.setDownloadListener { url, userAgent, disposition, mimeType, _ ->
        sendEvent("onBrowserDownload",mapOf(
          "viewTag" to viewTag,"url" to url,"userAgent" to userAgent,
          "contentDisposition" to disposition,"mimeType" to mimeType
        ))
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("saveBrowserDownload") { uri: String, name: String, mimeType: String ->
      BrowserDownloads.save(requireNotNull(appContext.reactContext),uri,name,mimeType)
    }


    Function("is24HourFormat") {
      val context = appContext.reactContext ?: error("The app is not active.")
      DateFormat.is24HourFormat(context)
    }

    AsyncFunction("openFile") { uri: String, mimeType: String, promise: Promise ->
      check(filePreviewPromise == null) { "A document viewer is already open." }
      val activity = appContext.currentActivity ?: error("The app is not active.")
      val file = File(URI(uri)).canonicalFile
      require(file.isFile) { "The file is no longer available." }
      val contentUri = FileProvider.getUriForFile(
        activity,
        "${activity.packageName}.FileSystemFileProvider",
        file
      )
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(contentUri, mimeType)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      filePreviewPromise = promise
      try {
        activity.startActivityForResult(intent, 7343)
      } catch (error: Exception) {
        filePreviewPromise = null
        throw error
      }
    }

    OnActivityResult { _, (requestCode) ->
      if (requestCode == 7343) {
        filePreviewPromise?.resolve(null)
        filePreviewPromise = null
      }
    }

    Function("getShowcasePairingUrl") {
      appContext.currentActivity?.intent?.getStringExtra("showcasePairingUrl")
    }

    Function("getShowcaseScene") {
      val storedScene = appContext.reactContext
        ?.filesDir
        ?.resolve("t3-showcase-scene")
        ?.takeIf { it.isFile }
        ?.readText()
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
      storedScene ?: appContext.currentActivity?.intent?.getStringExtra("showcaseScene")
    }

    // The palette is fixed for the whole capture, so it only ever arrives as a
    // launch extra — unlike the scene, which the runner rewrites in place.
    Function("getShowcaseTheme") {
      appContext.currentActivity?.intent?.getStringExtra("showcaseTheme")
    }

    Function("prepareShowcaseCapture") {
      // Android app data is cleared by the host runner before launch.
    }

    Function("markShowcaseReady") { scene: String ->
      appContext.reactContext
        ?.filesDir
        ?.resolve("t3-showcase-ready")
        ?.writeText(scene)
    }
  }
}
