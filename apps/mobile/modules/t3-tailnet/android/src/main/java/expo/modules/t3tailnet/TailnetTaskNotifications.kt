package expo.modules.t3tailnet

import android.Manifest
import androidx.core.app.NotificationCompat
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build

object TailnetTaskNotifications {
  @Synchronized fun show(context: Context,key: String,title: String,message: String,deepLink: String) {
    if (TailnetBridge.foreground || !TailnetBridge.preferences(context).getBoolean("background",false)) return
    if (Build.VERSION.SDK_INT>=33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) return
    val seen=context.getSharedPreferences("t3-task-notifications",Context.MODE_PRIVATE)
    if (seen.contains(key)) return
    val intent=Intent(Intent.ACTION_VIEW,Uri.parse(deepLink)).setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    val pending=PendingIntent.getActivity(context,key.hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val labels=context.getSharedPreferences("t3-interface-language",Context.MODE_PRIVATE)
    fun label(key:String,fallback:String)=labels.getString(key,fallback) ?: fallback
    val manager=context.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel("t3-task-events",label("tasksChannel", "T3 important task alerts"),NotificationManager.IMPORTANCE_DEFAULT).apply {
      description=label("tasksDescription", "Approval, completion and failures; each event alerts once")
      setSound(null,null);enableVibration(false)
    })
    val notification=NotificationCompat.Builder(context,"t3-task-events")
      .setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(title.take(120))
      .setContentText(message).setContentIntent(pending).setAutoCancel(true).setOnlyAlertOnce(true)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setGroup("t3-task-events").build()
    manager.notify(deepLink,7317,notification)
    val edit=seen.edit()
    if (seen.all.size>=256) {
      seen.all.entries.sortedBy { (it.value as? Long) ?: 0L }.take(64).forEach { edit.remove(it.key) }
    }
    edit.putLong(key,System.currentTimeMillis()).apply()
  }
}
