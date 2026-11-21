package expo.modules.t3agentnotifications

import android.content.Context
import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

internal data class ActivityRow(val status: String, val title: String, val project: String)

internal enum class ActivityPhase(
  val status: String,
  val heading: String,
  val chip: String,
  val action: String,
  val color: Int
) {
  STARTING("Connecting", "Starting", "Working", "Open", R.color.agent_activity_working),
  RUNNING("Working", "Working", "Working", "Open", R.color.agent_activity_working),
  APPROVAL(
    "Approval",
    "Approval needed",
    "Approve",
    "Approve",
    R.color.agent_activity_attention
  ),
  INPUT(
    "Input",
    "Question for you",
    "Answer",
    "Answer",
    R.color.agent_activity_input
  ),
  STALE(
    "Waiting",
    "Waiting for an update",
    "Waiting",
    "Open",
    R.color.agent_activity_waiting
  ),
  COMPLETED(
    "Done",
    "Finished",
    "Done",
    "Open",
    R.color.agent_activity_done
  ),
  FAILED(
    "Failed",
    "Failed",
    "Failed",
    "Open",
    R.color.agent_activity_failed
  );

  val needsUser get() = this == APPROVAL || this == INPUT
  val finished get() = this == COMPLETED || this == FAILED

  companion object {
    fun forStatus(status: String) = entries.firstOrNull { it.status == status }
  }
}

/** The relay orders rows and their deep link together; never reorder them in the client. */
internal fun activityRows(data: Map<String, String>) = (0..4).mapNotNull {
  val parts = data["activity_line_$it"]?.split('\t', limit = 3) ?: return@mapNotNull null
  if (parts.size != 3 || parts[1].isBlank()) {
    null
  } else {
    ActivityRow(parts[0].take(40), parts[1].take(120), parts[2].take(120))
  }
}

internal fun activityPhase(data: Map<String, String>, rows: List<ActivityRow>): ActivityPhase? =
  when (data["activity_phase"]?.takeIf { it.isNotBlank() }) {
    "starting" -> ActivityPhase.STARTING
    "running" -> ActivityPhase.RUNNING
    "waiting_for_approval" -> ActivityPhase.APPROVAL
    "waiting_for_input" -> ActivityPhase.INPUT
    "stale" -> ActivityPhase.STALE
    "completed" -> ActivityPhase.COMPLETED
    "failed" -> ActivityPhase.FAILED
    else -> rows.firstOrNull()?.let { ActivityPhase.forStatus(it.status) }
  }

internal class AgentNotificationLanguage(context: Context) {
  private val labels = context.getSharedPreferences("t3-interface-language", Context.MODE_PRIVATE)
  fun label(source: String): String = labels.getString(source, source) ?: source
  fun count(source: String, value: Any): String = label(source).replace("{count}", value.toString())
}

internal class ActivityPresentation(private val language: AgentNotificationLanguage, data: Map<String, String>, private val active: Boolean) {
  private val rows = activityRows(data)
  private val hero = rows.firstOrNull()
  val phase = activityPhase(data, rows)
  private val activeCount = data["activity_active_count"]?.toIntOrNull()?.coerceAtLeast(0)
    ?: rows.count { ActivityPhase.forStatus(it.status)?.finished != true }
  private val attentionCount = data["activity_attention_count"]?.toIntOrNull()?.coerceAtLeast(0)
    ?: rows.count { ActivityPhase.forStatus(it.status)?.needsUser == true }
  private val failedCount = rows.count { it.status == ActivityPhase.FAILED.status }
  val threadCount =
    activeCount + rows.count { ActivityPhase.forStatus(it.status)?.finished == true }
  private val singleProject = rows.map { it.project }.distinct().size == 1
  private val legacyBody = (0..4).mapNotNull { data["activity_line_$it"]?.take(300) }
    .takeIf { it.isNotEmpty() }?.joinToString("\n")
    ?: data["activity_body"].orEmpty().take(240)

  val summary = when {
    hero == null -> data["activity_title"]?.takeIf { it.isNotBlank() }?.take(120)
      ?: language.label("Agent activity")
    rows.size == 1 -> hero.title
    attentionCount == 1 -> language.label("1 needs you")
    attentionCount > 1 -> language.count("{count} need you", attentionCount)
    activeCount > 0 && failedCount > 0 -> language.count("{count} failed", failedCount)
    activeCount > 0 -> language.count("{count} working", activeCount)
    failedCount > 0 -> language.count("Finished, {count} failed", failedCount)
    else -> language.label("All finished")
  }

  val chip = when {
    !active -> if (phase == ActivityPhase.FAILED) language.label("Failed") else language.label("Done")
    phase == null -> data["activity_chip"]?.takeIf { it.isNotBlank() }?.take(7) ?: language.label("Active")
    phase == ActivityPhase.RUNNING && activeCount > 1 ->
      language.count("{count} live", if (activeCount > 9) "9+" else activeCount)
    else -> language.label(phase.chip)
  }

  val action = if (active) language.label(phase?.action ?: "Open") else null

  fun applyTo(builder: NotificationCompat.Builder, context: Context) {
    val tint = phase?.let { ContextCompat.getColor(context, it.color) }
    if (tint != null) builder.setColor(tint)
    // Tint the summary only when it names an outcome or a request; a plain
    // "3 working" stays neutral so the accent keeps meaning something.
    val tintedSummary = tint != null && rows.size > 1 && phase != ActivityPhase.RUNNING &&
      phase != ActivityPhase.STARTING
    builder.setContentTitle(if (tintedSummary) tinted(summary, tint!!) else summary)
    if (rows.size > 1) {
      builder.setSubText(
        listOfNotNull(
          hero!!.project.takeIf { singleProject && it.isNotBlank() },
          if (activeCount > 0) language.count("{count} active", activeCount) else language.count("{count} threads", threadCount)
        ).joinToString(" · ")
      )
    }
    val body = body(context)
    val lineBreak = body.indexOf('\n')
    val firstLine = if (lineBreak >= 0) body.subSequence(0, lineBreak) else body
    builder.setContentText(firstLine).setStyle(NotificationCompat.BigTextStyle().bigText(body))
    // Thread update timestamps can change while an approval remains pending.
    // Leave the timer hidden until the payload has a stable phase-entry timestamp.
    builder.setShowWhen(false).setUsesChronometer(false)
  }

  private fun body(context: Context): CharSequence = when {
    hero == null -> legacyBody
    rows.size == 1 -> statusLine(context, hero.copy(title = hero.project), "")
    else -> SpannableStringBuilder().apply {
      rows.forEachIndexed { index, row ->
        if (index > 0) append("\n")
        append(statusLine(context, row, row.project.takeUnless { singleProject }.orEmpty()))
      }
    }
  }

  private fun statusLine(context: Context, row: ActivityRow, trailing: String): CharSequence =
    SpannableStringBuilder().apply {
      val status = ActivityPhase.forStatus(row.status)
      val color = ContextCompat.getColor(context, status?.color ?: R.color.agent_activity_waiting)
      append(tinted(language.label(row.status), color, bold = true))
      append(" ").append(row.title)
      // Promoted cards drop text color, so the separator has to do the work of the dimming.
      if (trailing.isNotBlank()) {
        val start = length
        append(" · ").append(trailing)
        setSpan(
          ForegroundColorSpan(ContextCompat.getColor(context, R.color.agent_activity_waiting)),
          start,
          length,
          Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
        )
      }
    }

  private fun tinted(text: String, color: Int, bold: Boolean = false) =
    SpannableStringBuilder(text).apply {
      setSpan(ForegroundColorSpan(color), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
      if (bold) setSpan(StyleSpan(Typeface.BOLD), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }
}
