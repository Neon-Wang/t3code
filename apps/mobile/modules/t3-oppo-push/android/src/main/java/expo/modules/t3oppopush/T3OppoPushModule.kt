package expo.modules.t3oppopush

import android.os.Build
import com.heytap.msp.push.HeytapPushManager
import com.heytap.msp.push.callback.ICallBackResultService
import com.heytap.msp.push.service.CompatibleDataMessageCallbackService
import com.heytap.msp.push.service.DataMessageCallbackService
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OppoMessageService : DataMessageCallbackService()
class OppoCompatibleMessageService : CompatibleDataMessageCallbackService()

class T3OppoPushModule : Module() {
  private var pending: Promise? = null
  private var initialized = false
  private val callback = object : ICallBackResultService {
    override fun onRegister(code: Int, registerId: String?) {
      val promise = pending
      pending = null
      if (code == 0 && !registerId.isNullOrBlank()) {
        sendEvent("token", mapOf("token" to registerId))
        promise?.resolve(registerId)
      } else {
        promise?.reject("OPPO_REGISTER_FAILED", "OPPO registration failed ($code).", null)
      }
    }
    override fun onUnRegister(code: Int) {}
    override fun onSetPushTime(code: Int, message: String?) {}
    override fun onGetPushStatus(code: Int, status: Int) {}
    override fun onGetNotificationStatus(code: Int, status: Int) {}
    override fun onError(code: Int, message: String?) {
      pending?.reject("OPPO_REGISTER_FAILED", "OPPO registration failed ($code).", null)
      pending = null
    }
  }

  override fun definition() = ModuleDefinition {
    Name("T3OppoPush")
    Events("token")
    AsyncFunction("register") { promise: Promise ->
      val context = appContext.reactContext
      if (!Build.MANUFACTURER.equals("OPPO", ignoreCase = true) || context == null ||
          BuildConfig.APP_KEY.isNullOrBlank() || BuildConfig.APP_SECRET.isNullOrBlank()) {
        promise.resolve(null)
      } else {
        if (!initialized) {
          HeytapPushManager.init(context, false)
          initialized = true
        }
        if (!HeytapPushManager.isSupportPush(context)) {
          promise.resolve(null)
        } else if (pending != null) {
          promise.reject("OPPO_REGISTER_PENDING", "OPPO registration is already pending.", null)
        } else {
          pending = promise
          HeytapPushManager.register(context.applicationContext, BuildConfig.APP_KEY, BuildConfig.APP_SECRET, callback)
        }
      }
    }
    OnDestroy {
      pending?.reject("OPPO_REGISTER_CANCELLED", "OPPO module was destroyed.", null)
      pending = null
    }
  }
}
