package expo.modules.t3agentnotifications

import android.content.Context

/** App-owned wording only; protocol statuses and user content remain unchanged. */
internal class AgentNotificationLanguage(private val chinese: Boolean = false) {
  fun text(english: String, chineseText: String) = if (chinese) chineseText else english

  fun label(english: String): String = if (!chinese) english else when (english) {
    "Connecting" -> "正在连接"
    "Starting" -> "正在启动"
    "Working" -> "正在运行"
    "Open" -> "打开"
    "Approval" -> "审批"
    "Approval needed" -> "需要审批"
    "Approve" -> "审批"
    "Input" -> "等待输入"
    "Question for you" -> "有问题需要你回答"
    "Answer" -> "回答"
    "Waiting" -> "等待中"
    "Waiting for an update" -> "等待更新"
    "Done" -> "已完成"
    "Finished" -> "已结束"
    "Failed" -> "失败"
    else -> english
  }

  companion object {
    fun from(context: Context) = AgentNotificationLanguage(
      context.getSharedPreferences("t3-interface-language", Context.MODE_PRIVATE)
        .getString("locale", "zh-CN") == "zh-CN"
    )
  }
}
