package expo.modules.t3nativecontrols

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.provider.MediaStore
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import java.io.File
import java.net.URI

internal object BrowserDownloads {
  fun webView(view: View): WebView? {
    if (view is WebView) return view
    if (view is ViewGroup) for (index in 0 until view.childCount) {
      webView(view.getChildAt(index))?.let { return it }
    }
    return null
  }

  fun save(context: Context, uri: String, name: String, mimeType: String): String {
    check(Build.VERSION.SDK_INT >= 29) { "Use the share sheet on this Android version." }
    val file = File(URI(uri)).canonicalFile
    require(file.path.startsWith(context.cacheDir.canonicalPath + File.separator) && file.isFile)
    require(name.isNotBlank() && name != "." && name != ".." && !name.contains('/') && !name.contains('\\'))
    val resolver = context.contentResolver
    val target = requireNotNull(resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME,name)
      put(MediaStore.MediaColumns.MIME_TYPE,mimeType)
      put(MediaStore.MediaColumns.RELATIVE_PATH,"Download/T3 Code")
      put(MediaStore.MediaColumns.IS_PENDING,1)
    }))
    try {
      file.inputStream().use { input ->
        requireNotNull(resolver.openOutputStream(target)).use { output -> input.copyTo(output) }
      }
      resolver.update(target,ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING,0) },null,null)
      return target.toString()
    } catch (error: Exception) {
      resolver.delete(target,null,null)
      throw error
    }
  }
}
