package expo.modules.t3tailnet

import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/** User-selected background connection. No wake lock, alarm, or periodic wakeup. */
class TailnetConnectionService : Service() {
  companion object {
    @Volatile var running = false
      private set
    private const val CHANNEL = "t3-background-connection"
    private const val STOP = "expo.modules.t3tailnet.STOP_BACKGROUND"
    fun start(context: Context) {
      ContextCompat.startForegroundService(context,Intent(context,TailnetConnectionService::class.java))
    }
  }
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == STOP) {
      running = false
      TailnetBridge.preferences(this).edit().putBoolean("background",false).apply()
      stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return START_NOT_STICKY
    }
    val labels=getSharedPreferences("t3-interface-language",Context.MODE_PRIVATE)
    fun label(key:String, fallback:String)=labels.getString(key,fallback) ?: fallback
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel(CHANNEL,label("connectionChannel", "T3 background connection"),NotificationManager.IMPORTANCE_LOW).apply {
      description = label("connectionDescription", "Keeps your selected remote connection active without alert sounds")
      setSound(null,null);enableVibration(false);setShowBadge(false)
    })
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val content = launch?.let { PendingIntent.getActivity(this,0,it,PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
    val stop = PendingIntent.getService(this,1,Intent(this,TailnetConnectionService::class.java).setAction(STOP),PendingIntent.FLAG_IMMUTABLE)
    val notification = NotificationCompat.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
      .setContentTitle(label("connectionTitle", "T3 background connection is on")).setContentText(label("connectionBody", "Only important task events; deep sleep may delay alerts"))
      .setContentIntent(content).setOngoing(true).setOnlyAlertOnce(true)
      .addAction(0,label("stopBackground", "Stop background connection"),stop).build()
    if (Build.VERSION.SDK_INT >= 34) startForeground(7316,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    else startForeground(7316,notification)
    TailnetBackgroundTask.start()
    running = true
    return START_NOT_STICKY
  }
  override fun onDestroy() {
    running = false
    TailnetBackgroundTask.stop()
    super.onDestroy()
  }
}
