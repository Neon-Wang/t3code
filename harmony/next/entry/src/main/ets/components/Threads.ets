import { translate, setThreadFilter, toggleThreadGroup, showMoreThreads, retryThreadPages, threadAction, customSnoozeDefaults, customSnoozeValid } from '../generated/core.js';
import { Glyph } from './Glyph';
import { providerIcon } from './ProviderIcon';
import { ClientState, ThreadRow, MenuAction, WaitingRow, ProjectRow, ArrangeRow } from '../model/ClientState';

// Row metrics from the Android list: body 16/23 titles, label 13/17 metadata, 1.25x project icons.
const TITLE_LINE = 23;
const META_LINE = 17;
const PROJECT_ICON = 20;
const META_ICON = 13;

class BadgeStyle {
  icon: string = '';
  color: ResourceColor = $r('app.color.foreground_muted');
}

// Mirrors STATUS_LABEL_BY_STATUS and DONE_STATUS_LABEL in thread-list-v2-items.tsx.
function badgeStyle(badge: string): BadgeStyle {
  const style = new BadgeStyle();
  switch (badge) {
    case 'approval': style.icon = 'exclamationmark.shield'; style.color = $r('app.color.warning_foreground'); break;
    case 'input': style.icon = 'questionmark.bubble'; style.color = $r('app.color.status_input'); break;
    case 'request': style.icon = 'person.crop.circle'; style.color = $r('app.color.status_request'); break;
    case 'working': style.icon = 'circle.dashed'; style.color = $r('app.color.status_working'); break;
    case 'waiting': style.icon = 'circle.dashed.inset.filled'; style.color = $r('app.color.foreground_muted'); break;
    case 'failed': style.icon = 'exclamationmark.circle'; style.color = $r('app.color.danger_foreground'); break;
    case 'limited': style.icon = 'exclamationmark.circle'; style.color = $r('app.color.warning_foreground'); break;
    case 'done': style.icon = 'checkmark.circle'; style.color = $r('app.color.status_done'); break;
    case 'woke': style.icon = 'bell.badge'; style.color = $r('app.color.warning_foreground'); break;
    default: break;
  }
  return style;
}

function projectColor(name: string, surface: boolean): Resource {
  switch (name) {
    case 'red': return surface ? $r('app.color.project_icon_red_surface') : $r('app.color.project_icon_red');
    case 'orange': return surface ? $r('app.color.project_icon_orange_surface') : $r('app.color.project_icon_orange');
    case 'amber': return surface ? $r('app.color.project_icon_amber_surface') : $r('app.color.project_icon_amber');
    case 'yellow': return surface ? $r('app.color.project_icon_yellow_surface') : $r('app.color.project_icon_yellow');
    case 'lime': return surface ? $r('app.color.project_icon_lime_surface') : $r('app.color.project_icon_lime');
    case 'green': return surface ? $r('app.color.project_icon_green_surface') : $r('app.color.project_icon_green');
    case 'emerald': return surface ? $r('app.color.project_icon_emerald_surface') : $r('app.color.project_icon_emerald');
    case 'teal': return surface ? $r('app.color.project_icon_teal_surface') : $r('app.color.project_icon_teal');
    case 'cyan': return surface ? $r('app.color.project_icon_cyan_surface') : $r('app.color.project_icon_cyan');
    case 'sky': return surface ? $r('app.color.project_icon_sky_surface') : $r('app.color.project_icon_sky');
    case 'blue': return surface ? $r('app.color.project_icon_blue_surface') : $r('app.color.project_icon_blue');
    case 'indigo': return surface ? $r('app.color.project_icon_indigo_surface') : $r('app.color.project_icon_indigo');
    case 'violet': return surface ? $r('app.color.project_icon_violet_surface') : $r('app.color.project_icon_violet');
    case 'purple': return surface ? $r('app.color.project_icon_purple_surface') : $r('app.color.project_icon_purple');
    case 'fuchsia': return surface ? $r('app.color.project_icon_fuchsia_surface') : $r('app.color.project_icon_fuchsia');
    case 'pink': return surface ? $r('app.color.project_icon_pink_surface') : $r('app.color.project_icon_pink');
    case 'rose': return surface ? $r('app.color.project_icon_rose_surface') : $r('app.color.project_icon_rose');
    default: return surface ? $r('app.color.project_icon_gray_surface') : $r('app.color.project_icon_gray');
  }
}

function swipeIcon(id: string): string {
  switch (id) {
    case 'settle': return 'checkmark';
    case 'unsettle': return 'arrow.uturn.backward';
    case 'unsnooze': return 'clock';
    case 'snooze': return 'clock';
    default: return 'archivebox';
  }
}

// Android draws the context menu with an icon per action, a chevron for submenus, and red
// destructive actions. Submenus expand in place instead of opening a second popup; the
// expansion lives here so toggling it does not rebuild (and dismiss) the card's menu.
@ComponentV2
struct ThreadMenu {
  @Require @Param actions: MenuAction[];
  @Param busy: boolean = false;
  @Event choose: (id: string) => void = () => {};
  @Local expanded: string = '';
  @Builder
  menuRow(action: MenuAction, nested: boolean) {
    Row({ space: 14 }) {
      if (action.image === 'circle.fill' && action.imageColor) {
        Row() { Circle().width(18).height(18).fill(action.imageColor) }.width(22).justifyContent(FlexAlign.Center)
      } else if (action.image) {
        Glyph({ name: action.image, side: 22, tint: action.destructive ? $r('app.color.danger_foreground') : $r('app.color.foreground') })
      } else if (nested) {
        Row().width(22)
      }
      Column({ space: 2 }) {
        Text(action.title).fontSize(16).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
          .fontColor(action.destructive ? $r('app.color.danger_foreground') : $r('app.color.foreground'))
        if (action.subtitle) {
          Text(action.subtitle).fontSize(13).maxLines(1).fontColor($r('app.color.foreground_muted'))
        }
      }.layoutWeight(1).alignItems(HorizontalAlign.Start)
      if (action.children && action.children.length > 0) {
        Glyph({ name: this.expanded === action.id ? 'chevron.down' : 'chevron.right', side: 20, tint: $r('app.color.foreground') })
      } else if (action.selected) {
        Glyph({ name: 'checkmark', side: 20, tint: $r('app.color.primary_text') })
      }
    }.width('100%').constraintSize({ minHeight: 48 }).padding({ left: nested ? 28 : 16, right: 16 })
      .backgroundColor(nested ? $r('app.color.grouped_card') : Color.Transparent)
      .opacity(this.busy || action.disabled ? 0.4 : 1).enabled(!this.busy && !action.disabled)
      .onClick(() => {
        if (action.children && action.children.length > 0) { this.expanded = this.expanded === action.id ? '' : action.id; }
        else { this.choose(action.id); }
      })
  }
  build() {
    Scroll() {
      Column() {
        ForEach(this.actions, (action: MenuAction) => {
          this.menuRow(action, false)
          if (this.expanded === action.id) {
            ForEach(action.children ?? [], (child: MenuAction) => { this.menuRow(child, true) }, (child: MenuAction) => child.id)
          }
        }, (action: MenuAction) => action.id)
      }.padding({ top: 6, bottom: 6 })
    }.width(264).constraintSize({ maxHeight: 560 }).scrollBar(BarState.Off)
      .backgroundColor($r('app.color.card')).borderRadius(4)
  }
}

@ComponentV2
struct ThreadCard {
  @Require @Param row: ThreadRow;
  @Require @Param state: ClientState;
  @Event firstVisible: () => void = () => {};
  @Event openInbox: (environmentId: string, threadId: string) => void = () => {};
  @Event openThread: (environmentId: string, threadId: string) => void = () => {};
  @Event newTask: (environmentId: string, threadId: string) => void = () => {};
  @Local error: string = '';
  @Local busy: boolean = false;
  @Local sheetOpened: boolean = false;
  @Local sheetKind: string = '';
  @Local snoozeMode: string = 'date';
  @Local snoozeDate: string = '';
  @Local snoozeTime: string = '';
  @Local snoozeAmount: string = '2';
  @Local snoozeUnit: string = 'hours';
  @Local renameTitle: string = '';
  @Local renameRow: ThreadRow | null = null;
  @Local menuShown: boolean = false;
  private color(name: string): ResourceColor {
    switch (name) {
      case 'red': return $r('app.color.thread_color_red');
      case 'orange': return $r('app.color.thread_color_orange');
      case 'yellow': return $r('app.color.thread_color_yellow');
      case 'green': return $r('app.color.thread_color_green');
      case 'teal': return $r('app.color.thread_color_teal');
      case 'blue': return $r('app.color.thread_color_blue');
      case 'purple': return $r('app.color.thread_color_purple');
      case 'gray': return $r('app.color.thread_color_gray');
      default: return Color.Transparent;
    }
  }
  private async execute(row: ThreadRow | ArrangeRow, id: string, value: string = ''): Promise<void> {
    this.error = '';
    this.busy = true;
    try {
      await threadAction(row.environmentId, row.id, id, value);
      if (this.sheetKind !== 'arrange') { this.sheetOpened = false; }
    } catch (error) { this.error = translate('mobile.connectionTone.connectionFailed'); }
    finally { this.busy = false; }
  }
  private select(row: ThreadRow, id: string): void {
    if (id === 'new-thread-on-branch') { this.newTask(row.environmentId, row.id); return; }
    if (id === 'snooze:custom') {
      const defaults = customSnoozeDefaults();
      this.renameRow = row;
      this.error = '';
      this.snoozeDate = defaults.date;
      this.snoozeTime = defaults.time;
      this.snoozeMode = 'date';
      this.sheetKind = 'snooze'; this.sheetOpened = true;
    } else if (id === 'arrange') {
      this.sheetKind = 'arrange'; this.sheetOpened = true;
    } else if (id === 'rename') {
      this.renameRow = row;
      this.renameTitle = row.title;
      this.sheetKind = 'rename'; this.sheetOpened = true;
    } else if (id === 'delete' || id === 'archive') {
      this.getUIContext().showAlertDialog({
        title: row.title,
        message: translate(`mobile.threads.${id}`),
        primaryButton: { value: translate('mobile.useThreadListActions.cancel'), action: () => {} },
        secondaryButton: { value: translate(`mobile.threads.${id}`), action: () => { this.execute(row, id); } }
      });
    } else { this.execute(row, id); }
  }
  @Builder
  menu(row: ThreadRow) {
    ThreadMenu({ actions: row.menu, busy: this.busy, choose: (id: string) => {
      this.menuShown = false;
      this.select(row, id);
    } })
  }
  @Builder
  submenu(row: ThreadRow, actions: MenuAction[]) {
    Menu() {
      ForEach(actions, (action: MenuAction) => {
        MenuItem({ content: action.title, labelInfo: action.subtitle }).selectIcon(true).selected(action.selected === true).enabled(!this.busy && !action.disabled)
          .onClick(() => { this.select(row, action.id); })
      }, (action: MenuAction) => action.id)
    }
  }
  // Android swipe actions: a filled circle for the primary action, a bare icon for the secondary.
  @Builder
  swipeButton(icon: string, label: string, primary: boolean, enabled: boolean) {
    Column({ space: 4 }) {
      Row() { Glyph({ name: icon, side: 20, tint: primary ? $r('app.color.primary_foreground') : $r('app.color.foreground') }) }
        .width(40).height(40).borderRadius(20).justifyContent(FlexAlign.Center)
        .backgroundColor(primary ? $r('app.color.primary') : Color.Transparent)
      Text(label).fontSize(11).maxLines(1).fontColor($r('app.color.foreground_muted'))
    }.width(72).height('100%').justifyContent(FlexAlign.Center).opacity(enabled ? 1 : 0.4)
  }
  @Builder
  swipeStart() {
    Row() {
      this.swipeButton('archivebox', translate('mobile.threads.archive'), true, !this.busy && this.row.writable && !this.row.menu.find((action: MenuAction) => action.id === 'archive')?.disabled)
    }.height('100%').enabled(!this.busy && this.row.writable && !this.row.menu.find((action: MenuAction) => action.id === 'archive')?.disabled)
      .onClick(() => { this.select(this.row, 'archive'); })
  }
  @Builder
  swipeEnd() {
    Row() {
      Row() { this.swipeButton(swipeIcon(this.row.primary.id), this.row.primary.title, true, !this.busy && !this.row.primary.disabled) }
        .height('100%').enabled(!this.busy && !this.row.primary.disabled)
        .onClick(() => { this.select(this.row, this.row.primary.id); })
      if (this.row.secondary) {
        Row() { this.swipeButton(swipeIcon(this.row.secondary.id), this.row.secondary.title, false, !this.busy && this.row.writable) }
          .height('100%').enabled(!this.busy && this.row.writable)
          .bindMenu(this.submenu(this.row, this.row.menu.find((action: MenuAction) => action.id === 'snooze')?.children ?? []))
      }
    }.height('100%')
  }
  @Builder
  renameSheet() {
    Column({ space: 16 }) {
      Text(translate('mobile.threads.rename')).fontSize(21).fontWeight(FontWeight.Medium).fontColor($r('app.color.foreground'))
      TextInput({ text: this.renameTitle }).onChange((value: string) => { this.renameTitle = value; })
      Button(translate('mobile.threads.rename')).width('100%').enabled(!this.busy && this.renameTitle.trim().length > 0)
        .onClick(() => { if (this.renameRow) { this.execute(this.renameRow, 'rename', this.renameTitle); } })
      if (this.error) { Text(this.error).fontSize(14).fontColor($r('app.color.danger_foreground')) }
    }.padding(24).alignItems(HorizontalAlign.Start)
  }
  private snoozeInput(): string {
    return this.snoozeMode === 'date'
      ? JSON.stringify({ mode: 'date', date: this.snoozeDate, time: this.snoozeTime })
      : JSON.stringify({ mode: 'duration', amount: this.snoozeAmount, unit: this.snoozeUnit });
  }
  @Builder
  snoozeSheet() {
    Column({ space: 12 }) {
      Text(translate('mobile.threads.snoozeUntil')).fontSize(21).fontWeight(FontWeight.Medium).fontColor($r('app.color.foreground'))
      Select([{ value: translate('mobile.customSnoozeSheet.dateAndTime') }, { value: translate('mobile.customSnoozeSheet.duration') }])
        .selected(this.snoozeMode === 'date' ? 0 : 1)
        .value(translate(this.snoozeMode === 'date' ? 'mobile.customSnoozeSheet.dateAndTime' : 'mobile.customSnoozeSheet.duration'))
        .onSelect((index: number) => { this.snoozeMode = index === 0 ? 'date' : 'duration'; this.error = ''; })
      if (this.snoozeMode === 'date') {
        TextInput({ text: this.snoozeDate, placeholder: 'YYYY-MM-DD' }).onChange((value: string) => { this.snoozeDate = value; })
        TextInput({ text: this.snoozeTime, placeholder: 'HH:mm' }).onChange((value: string) => { this.snoozeTime = value; })
      } else {
        TextInput({ text: this.snoozeAmount }).type(InputType.Number).onChange((value: string) => { this.snoozeAmount = value; })
        Select([{ value: translate('mobile.customSnoozeSheet.minutes') }, { value: translate('mobile.customSnoozeSheet.hours') }, { value: translate('mobile.customSnoozeSheet.days') }])
          .value(translate(`mobile.customSnoozeSheet.${this.snoozeUnit}`))
          .onSelect((index: number) => { this.snoozeUnit = ['minutes', 'hours', 'days'][index]; })
      }
      Button(translate('mobile.threads.snooze')).width('100%').enabled(!this.busy).onClick(() => {
        const value = this.snoozeInput();
        if (!customSnoozeValid(value)) {
          this.error = translate(this.snoozeMode === 'date' ? 'mobile.customSnoozeSheet.chooseFutureDate' : 'v2.surfaces.copy182');
        } else if (this.renameRow) { this.execute(this.renameRow, 'snooze:custom', value); }
      })
      if (this.error) { Text(this.error).fontSize(14).fontColor($r('app.color.danger_foreground')) }
    }.padding(24).alignItems(HorizontalAlign.Start)
  }
  @Builder
  arrangeSheet() {
    Column({ space: 12 }) {
      Text(translate('mobile.threads.arrangeThreads')).fontSize(21).fontWeight(FontWeight.Medium).fontColor($r('app.color.foreground'))
      List() {
        ForEach(this.state.arrangeRows, (row: ArrangeRow) => {
          ListItem() {
            Row({ space: 4 }) {
              Text(row.title).fontSize(16).layoutWeight(1).maxLines(1).fontColor($r('app.color.foreground'))
                .textOverflow({ overflow: TextOverflow.Ellipsis })
              Row() { Glyph({ name: 'arrow.up', side: 20, tint: $r('app.color.foreground') }) }
                .width(44).height(44).justifyContent(FlexAlign.Center)
                .accessibilityText(translate('mobile.threads.moveUp'))
                .opacity(!this.busy && row.writable && row.canMoveUp ? 1 : 0.3)
                .enabled(!this.busy && row.writable && row.canMoveUp)
                .onClick(() => { this.execute(row, 'move-up'); })
              Row() { Glyph({ name: 'arrow.down', side: 20, tint: $r('app.color.foreground') }) }
                .width(44).height(44).justifyContent(FlexAlign.Center)
                .accessibilityText(translate('mobile.threads.moveDown'))
                .opacity(!this.busy && row.writable && row.canMoveDown ? 1 : 0.3)
                .enabled(!this.busy && row.writable && row.canMoveDown)
                .onClick(() => { this.execute(row, 'move-down'); })
            }.padding({ left: 16, right: 4 })
          }
        }, (row: ArrangeRow) => `${row.environmentId}:${row.id}`)
      }.layoutWeight(1).backgroundColor($r('app.color.grouped_card')).borderRadius(20)
        .divider({ strokeWidth: 1, color: $r('app.color.border_subtle'), startMargin: 16 })
      if (this.error) { Text(this.error).fontSize(14).fontColor($r('app.color.danger_foreground')) }
    }.padding(24).height('100%').alignItems(HorizontalAlign.Start)
  }
  @Builder
  actionSheet() {
    if (this.sheetKind === 'rename') { this.renameSheet() }
    else if (this.sheetKind === 'snooze') { this.snoozeSheet() }
    else { this.arrangeSheet() }
  }
  @Builder
  projectIcon(size: number) {
    if (this.row.projectIconKind === 'symbol') {
      Glyph({ name: 'text.bubble', side: size, tint: projectColor(this.row.projectIconColor, false) })
    } else if (this.row.projectIconKind === 'emoji') {
      Text(this.row.projectIcon).fontSize(size * 0.8).width(size).height(size).textAlign(TextAlign.Center)
    } else if (this.row.projectIconKind === 'monogram') {
      Text(this.row.projectIcon).fontSize(size * (this.row.projectIcon.length === 1 ? 0.6 : 0.515625))
        .fontWeight(FontWeight.Bold).fontFamily('monospace').maxLines(1)
        .fontColor(projectColor(this.row.projectIconColor, false)).textAlign(TextAlign.Center)
        .width(size).height(size).borderRadius(size * 0.25)
        .backgroundColor(projectColor(this.row.projectIconColor, true))
    }
  }
  @Builder
  badge() {
    if (this.row.badge === 'woke') {
      Row({ space: 4 }) {
        Glyph({ name: 'bell.badge', side: 13, tint: badgeStyle('woke').color })
        Text(this.row.statusLabel).fontSize(13).fontWeight(FontWeight.Bold).fontColor(badgeStyle('woke').color)
      }
    } else if (this.row.badge) {
      Row({ space: 4 }) {
        if (this.row.badge === 'waiting' && this.row.waiting.length > 0) {
          ForEach(this.row.waiting, (wait: WaitingRow) => {
            if (wait.kind === 'agent' && wait.provider) {
              Image(providerIcon(wait.provider)).width(14).height(14).accessibilityText(wait.title)
            } else {
              Glyph({ name: wait.kind === 'command' ? 'terminal' : wait.kind === 'monitor' ? 'eye' : badgeStyle('waiting').icon, side: 13, tint: badgeStyle('waiting').color })
                .accessibilityText(wait.title)
            }
          }, (wait: WaitingRow) => wait.key)
          if (this.row.waitingMore > 0) { Text(`+${this.row.waitingMore}`).fontSize(13).fontColor(badgeStyle('waiting').color) }
        } else {
          Glyph({ name: badgeStyle(this.row.badge).icon, side: 13, tint: badgeStyle(this.row.badge).color })
        }
        if (this.row.statusLabel) {
          Text(this.row.statusLabel).fontSize(13).fontWeight(FontWeight.Bold).fontColor(badgeStyle(this.row.badge).color)
            .fontFeature('"tnum" on')
        }
      }
    } else {
      Text(this.row.timeLabel).fontSize(13).fontColor($r('app.color.foreground_tertiary')).fontFeature('"tnum" on')
    }
  }
  @Builder
  cardContent() {
    Column() {
      Row({ space: 8 }) {
        this.projectIcon(PROJECT_ICON)
        Text(this.row.project || translate('mobile.threads.noProject')).fontSize(13).maxLines(1).layoutWeight(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis }).fontColor($r('app.color.foreground_muted'))
        Row({ space: 6 }) {
          if (this.row.pinned) { Glyph({ name: 'pin', side: 11, tint: $r('app.color.foreground_muted') }) }
          if (this.row.inboxCount > 0) {
            Row({ space: 4 }) {
              Glyph({ name: 'archivebox', side: 14, tint: this.row.urgent ? $r('app.color.danger_foreground') : $r('app.color.primary_text') })
              if (this.row.inboxCount > 1) {
                Text(`${this.row.inboxCount}`).fontSize(13).fontFeature('"tnum" on')
                  .fontColor(this.row.urgent ? $r('app.color.danger_foreground') : $r('app.color.primary_text'))
              }
            }.padding(10).margin(-10)
              .accessibilityText(translate('inbox.title'))
              .onClick(() => { this.openInbox(this.row.environmentId, this.row.id); })
          }
          this.badge()
        }
      }.width('100%').height(TITLE_LINE)
      Text(this.row.title).fontSize(16).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
        .fontWeight(this.row.recede ? FontWeight.Normal : FontWeight.Medium).fontColor($r('app.color.foreground'))
        .height(TITLE_LINE).margin({ top: 4 }).width('100%')
      Row({ space: 8 }) {
        Row() { Glyph({ name: 'arrow.branch', side: META_ICON, tint: $r('app.color.foreground_tertiary') }) }
          .width(PROJECT_ICON).justifyContent(FlexAlign.Center).opacity(this.row.noBranch ? 0.5 : 1)
        Text(this.row.branch).fontSize(13).maxLines(1).layoutWeight(1).textOverflow({ overflow: TextOverflow.Ellipsis })
          .fontColor(this.row.status === 'failed' ? $r('app.color.danger_foreground') : this.row.status === 'limited' ? $r('app.color.warning_foreground') : $r('app.color.foreground_muted'))
          .opacity(this.row.noBranch && this.row.status !== 'failed' && this.row.status !== 'limited' ? 0.6 : 1)
      }.width('100%').height(META_LINE).margin({ top: 4 })
      Row({ space: 8 }) {
        Row() { Glyph({ name: 'desktopcomputer', side: META_ICON, tint: $r('app.color.foreground_tertiary') }) }
          .width(PROJECT_ICON).justifyContent(FlexAlign.Center)
        Text(this.row.environment).fontSize(13).maxLines(1).layoutWeight(1).textOverflow({ overflow: TextOverflow.Ellipsis })
          .fontColor($r('app.color.foreground_tertiary'))
        if (this.row.todo) {
          Text(`${this.row.todo.done}/${this.row.todo.total}`).fontSize(13).fontFeature('"tnum" on')
            .accessibilityText(`${this.row.todo.done}/${this.row.todo.total} ${this.row.todo.currentText ?? ''}`)
          Progress({ value: this.row.todo.done, total: this.row.todo.total, type: ProgressType.Linear }).width(44)
        }
        Image(providerIcon(this.row.provider)).width(14).height(14).accessibilityText(this.row.provider)
      }.width('100%').height(META_LINE).margin({ top: 4 })
    }.width('100%').opacity(this.row.recede ? 0.55 : 1)
  }
  @Builder
  slimContent() {
    Row({ space: 8 }) {
      Row() { this.projectIcon(PROJECT_ICON) }.opacity(0.4)
      Text(this.row.title).fontSize(16).maxLines(1).layoutWeight(1).textOverflow({ overflow: TextOverflow.Ellipsis })
        .fontColor($r('app.color.foreground_muted'))
      if (this.row.todo) {
        Text(`${this.row.todo.done}/${this.row.todo.total}`).fontSize(13).fontFeature('"tnum" on').fontColor($r('app.color.foreground_muted'))
      }
      Text(this.row.timeLabel).fontSize(14).fontFamily('monospace').fontFeature('"tnum" on')
        .fontColor($r('app.color.foreground_tertiary'))
    }.width('100%').constraintSize({ minHeight: 44 })
  }
  @Builder
  card() {
    Column() {
      if (this.row.variant === 'slim') { this.slimContent() } else { this.cardContent() }
    }.padding({ left: 12, right: 12, top: this.row.variant === 'slim' ? 8 : 10, bottom: this.row.variant === 'slim' ? 8 : 10 })
      .width('100%').backgroundColor(this.state.wide && this.state.selectedEnvironmentId === this.row.environmentId && this.state.selectedThreadId === this.row.id ? $r('app.color.grouped_card') : this.color(this.row.color)).borderRadius(20)
      .stateStyles({ pressed: { .backgroundColor($r('app.color.row_hover')) } })
      .onClick(() => { this.openThread(this.row.environmentId, this.row.id); })
      // A popup rather than bindContextMenu: a context menu closes on any tap inside custom content.
      .gesture(LongPressGesture().onAction(() => { this.menuShown = true; }))
      .bindPopup(this.menuShown, {
        builder: this.menu(this.row), enableArrow: false, placement: Placement.Bottom, radius: 4,
        popupColor: $r('app.color.card'), backgroundBlurStyle: BlurStyle.NONE, autoCancel: true,
        mask: { color: '#00000000' }, shadow: ShadowStyle.OUTER_DEFAULT_MD,
        onStateChange: (event) => { if (!event.isVisible) { this.menuShown = false; } }
      })
  }
  build() {
    ListItem() {
      Column() {
        this.card()
        if (this.error && !this.sheetOpened) {
          Text(this.error).fontSize(13).fontColor($r('app.color.danger_foreground')).padding({ left: 12, top: 4 })
        }
      }.padding({ left: 8, right: 8, top: 2, bottom: 2 })
    // Keep the ListItem as the direct list child; a modifier on ThreadCard wraps it.
    }.onVisibleAreaChange([0.0], (visible: boolean) => { if (visible) { this.firstVisible(); } })
      .swipeAction({ start: { builder: () => { this.swipeStart() } }, end: { builder: () => { this.swipeEnd() } } })
      .bindSheet($$this.sheetOpened, this.actionSheet(), { height: this.sheetKind === 'arrange' ? SheetSize.LARGE : SheetSize.MEDIUM, showClose: true, backgroundColor: $r('app.color.sheet_solid') })
  }
}

@ComponentV2
export struct Threads {
  @Require @Param state: ClientState;
  @Event openInbox: (environmentId: string, threadId: string) => void = () => {};
  @Event openThread: (environmentId: string, threadId: string) => void = () => {};
  @Event newTask: (environmentId: string, threadId: string) => void = () => {};
  @Local error: string = '';
  @Local searching: boolean = false;
  private reported: boolean = false;
  private filter(projectKey: string): void {
    this.state.projectKey = projectKey;
    setThreadFilter(this.state.search, projectKey);
  }
  private closeSearch(): void {
    this.searching = false;
    this.state.search = '';
    setThreadFilter('', this.state.projectKey);
  }
  @Builder
  filterMenu() {
    Menu() {
      MenuItem({ content: translate('mobile.threads.allProjects') }).selectIcon(true).selected(this.state.projectKey === '')
        .onClick(() => { this.filter(''); })
      ForEach(this.state.projects, (project: ProjectRow) => {
        MenuItem({ content: project.label }).selectIcon(true).selected(this.state.projectKey === project.key)
          .onClick(() => { this.filter(project.key); })
      }, (project: ProjectRow) => project.key)
    }
  }
  @Builder
  iconButton(icon: string, label: string) {
    Row() { Glyph({ name: icon, side: 24, tint: $r('app.color.foreground') }) }
      .width(48).height(48).justifyContent(FlexAlign.Center).accessibilityText(label)
  }
  // Mirrors the Android app bar: wordmark with search and filter actions; search expands in place.
  @Builder
  header() {
    Row({ space: 4 }) {
      if (this.searching || this.state.search.length > 0) {
        Row() { Glyph({ name: 'chevron.left', side: 24, tint: $r('app.color.foreground') }) }
          .width(48).height(48).justifyContent(FlexAlign.Center).onClick(() => { this.closeSearch(); })
        Row({ space: 8 }) {
          Glyph({ name: 'magnifyingglass', side: 18, tint: $r('app.color.foreground_muted') })
          TextInput({ text: this.state.search, placeholder: translate('mobile.threads.searchThreads') })
            .id('threadSearch').defaultFocus(true).layoutWeight(1).height(44).padding(0).fontSize(16)
            .backgroundColor(Color.Transparent).placeholderColor($r('app.color.placeholder'))
            .fontColor($r('app.color.foreground')).caretColor($r('app.color.primary'))
            .onChange((value: string) => { this.state.search = value; setThreadFilter(value, this.state.projectKey); })
          if (this.state.search.length > 0) {
            Row() { Glyph({ name: 'xmark', side: 16, tint: $r('app.color.foreground_muted') }) }
              .width(32).height(32).justifyContent(FlexAlign.Center)
              .onClick(() => { this.state.search = ''; setThreadFilter('', this.state.projectKey); })
          }
        }.layoutWeight(1).height(48).padding({ left: 14, right: 6 }).borderRadius(24)
          .backgroundColor($r('app.color.input')).border({ width: 1, color: $r('app.color.input_border') })
      } else {
        Row() {
          Text('T3').fontSize(24).fontWeight(FontWeight.Bold).fontColor($r('app.color.wordmark'))
          Text(' Code').fontSize(24).fontColor($r('app.color.wordmark'))
        }.layoutWeight(1).padding({ left: 8 })
        Row() { this.iconButton('magnifyingglass', translate('mobile.threads.searchThreads')) }
          .onClick(() => { this.searching = true; })
      }
      if (this.state.environments.length > 0) {
        Button('+').accessibilityText(translate('New task')).onClick(() => { this.newTask('', ''); })
        Row() { this.iconButton(this.state.projectKey ? 'line.3.horizontal.decrease.fill' : 'line.3.horizontal.decrease', translate('mobile.home.filterThreads')) }
          .bindMenu(this.filterMenu())
      }
    }.width('100%').height(64).padding({ left: 8, right: 8 })
  }
  build() {
    Column() {
      this.header()
      Column() {
        if (this.error) { Text(this.error).fontSize(13).fontColor($r('app.color.danger_foreground')).padding(12) }
        List() {
          Repeat<ThreadRow>(this.state.rows).each((item: RepeatItem<ThreadRow>) => {
            if (item.item.kind === 'group') {
              ListItem() {
                Row({ space: 10 }) {
                  Text(item.item.title).fontSize(13).fontWeight(FontWeight.Medium)
                    .fontColor(item.item.group === 'snoozed' ? $r('app.color.foreground_secondary') : $r('app.color.foreground_tertiary'))
                  Row().height(1).layoutWeight(1).backgroundColor($r('app.color.border'))
                  Glyph({ name: 'chevron.down', side: 10, tint: $r('app.color.foreground_muted') })
                    .rotate({ angle: item.item.expanded ? 180 : 0 })
                }.padding({ left: 20, right: 20, top: 16, bottom: 6 }).width('100%')
                  .onClick(() => { toggleThreadGroup(item.item.group).catch(() => { this.error = translate('mobile.connectionTone.connectionFailed'); }); })
              }
            } else {
              ThreadCard({ newTask: this.newTask, row: item.item, state: this.state, openInbox: this.openInbox, openThread: this.openThread, firstVisible: () => {
                if (!this.reported) {
                  this.reported = true;
                  console.info(`T3P1 first list visible count=${this.state.rows.length} at=${Date.now()}`);
                }
              } })
            }
          }).key((row: ThreadRow) => row.key).virtualScroll()
          if (this.state.hiddenSettledCount > 0) {
            ListItem() {
              Text(translate('sidebar.showMoreLabel')).fontSize(14).fontColor($r('app.color.foreground_muted'))
                .width('100%').textAlign(TextAlign.Center).padding({ top: 10, bottom: 10 }).borderRadius(8)
                .border({ width: 1, style: BorderStyle.Dashed, color: $r('app.color.border') })
                .onClick(() => { showMoreThreads(); })
            }.padding({ left: 16, right: 16, top: 8 })
          }
          if (this.state.pageFailed) {
            ListItem() {
              Text(translate('action.retry')).fontSize(14).fontColor($r('app.color.primary_text'))
                .width('100%').textAlign(TextAlign.Center).padding(12)
                .onClick(() => { retryThreadPages(); })
            }
          }
        }.layoutWeight(1).padding({ top: 6 }).contentEndOffset(16).scrollBar(BarState.Off)
      }.layoutWeight(1).width('100%').backgroundColor($r('app.color.screen'))
        .borderRadius({ topLeft: 28, topRight: 28 }).clip(true)
    }.height('100%').width('100%')
  }
}
