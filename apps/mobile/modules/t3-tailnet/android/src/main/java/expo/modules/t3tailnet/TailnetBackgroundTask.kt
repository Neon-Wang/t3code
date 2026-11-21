package expo.modules.t3tailnet

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import java.lang.ref.WeakReference

/** One task preserves RN's background timers only while the explicit service runs. */
object TailnetBackgroundTask {
  private var context = WeakReference<ReactContext>(null)
  private var taskContext: HeadlessJsTaskContext? = null
  private var taskId: Int? = null
  @Volatile private var serviceRunning = false
  fun attach(value: ReactContext) {
    UiThreadUtil.runOnUiThread {
      if (context.get() !== value) finish()
      context = WeakReference(value)
      if (serviceRunning) begin()
    }
  }
  fun detach() { UiThreadUtil.runOnUiThread { finish();context.clear() } }
  fun start() { serviceRunning=true;UiThreadUtil.runOnUiThread { begin() } }
  fun stop() { serviceRunning=false;UiThreadUtil.runOnUiThread { finish() } }
  private fun begin() {
    if (!serviceRunning || taskId!=null) return
    val react = context.get() ?: return
    if (!react.hasActiveReactInstance()) return
    val tasks = HeadlessJsTaskContext.getInstance(react)
    taskContext=tasks
    taskId=tasks.startTask(HeadlessJsTaskConfig("T3BackgroundConnection",Arguments.createMap(),0,true))
  }
  private fun finish() {
    val id=taskId;val tasks=taskContext
    taskId=null;taskContext=null
    if(id!=null && tasks!=null) tasks.finishTask(id)
  }
}
