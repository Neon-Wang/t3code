package expo.modules.t3tailnet

import android.app.Notification
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
      context.startForegroundService(Intent(context,TailnetConnectionService::class.java))
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
    fun label(key:String, fallback:String)=labels.getString("tailnet.$key",fallback) ?: fallback
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(CHANNEL,label("connectionChannel","T3 后台连接"),NotificationManager.IMPORTANCE_LOW).apply {
      description = label("connectionDescription","保持用户开启的远程连接，不播放提示音")
      setSound(null,null);enableVibration(false);setShowBadge(false)
    })
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val content = launch?.let { PendingIntent.getActivity(this,0,it,PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
    val stop = PendingIntent.getService(this,1,Intent(this,TailnetConnectionService::class.java).setAction(STOP),PendingIntent.FLAG_IMMUTABLE)
    val notification = Notification.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
      .setContentTitle(label("connectionTitle","T3 后台连接已开启")).setContentText(label("connectionBody","仅提醒需要处理的任务事件；深度休眠时可能延迟"))
      .setContentIntent(content).setOngoing(true).setOnlyAlertOnce(true)
      .addAction(Notification.Action.Builder(null,label("stopBackground","停止后台连接"),stop).build()).build()
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
