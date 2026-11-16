import { translate, setThreadFilter, toggleThreadGroup, showMoreThreads, retryThreadPages, threadAction, customSnoozeDefaults, customSnoozeValid } from '../generated/core.js';
import { ClientState, ThreadRow, MenuAction, WaitingRow, ProjectRow, ArrangeRow } from '../model/ClientState';

@ComponentV2
struct ThreadCard {
  @Require @Param row: ThreadRow;
  @Require @Param state: ClientState;
  @Event firstVisible: () => void = () => {};
  @Event openInbox: (environmentId: string, threadId: string) => void = () => {};
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
  private color(name: string): Resource {
    switch (name) {
      case 'red': return $r('app.color.thread_color_red');
      case 'orange': return $r('app.color.thread_color_orange');
      case 'yellow': return $r('app.color.thread_color_yellow');
      case 'green': return $r('app.color.thread_color_green');
      case 'teal': return $r('app.color.thread_color_teal');
      case 'blue': return $r('app.color.thread_color_blue');
      case 'purple': return $r('app.color.thread_color_purple');
      case 'gray': return $r('app.color.thread_color_gray');
      default: return $r('app.color.card');
    }
  }
  private icon(provider: string): Resource {
    switch (provider) {
      case 'claudeAgent': return $r('app.media.provider_claudeagent');
      case 'acpRegistry': return $r('app.media.provider_acpregistry');
      case 'fx': return $r('app.media.provider_fx');
      case 'kiro': return $r('app.media.provider_kiro');
      case 'muse': return $r('app.media.provider_muse');
      case 'pi': return $r('app.media.provider_pi');
      case 'cursor': return $r('app.media.provider_cursor');
      case 'grok': return $r('app.media.provider_grok');
      case 'opencode': return $r('app.media.provider_opencode');
      case 'antigravity': return $r('app.media.provider_antigravity');
      default: return $r('app.media.provider_codex');
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
    Menu() {
      ForEach(row.menu, (action: MenuAction) => {
        if (action.children && action.children.length > 0) {
          MenuItem({ content: action.title, builder: () => { this.submenu(row, action.children!) } })
        } else {
          MenuItem({ content: action.title, labelInfo: action.subtitle }).selectIcon(true).selected(action.selected === true).enabled(!this.busy && !action.disabled)
            .onClick(() => { this.select(row, action.id); })
        }
      }, (action: MenuAction) => action.id)
    }
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
  @Builder
  swipeStart() {
    Button(translate('mobile.threads.archive')).enabled(!this.busy && this.row.writable && !this.row.menu.find((action: MenuAction) => action.id === 'archive')?.disabled)
      .onClick(() => { this.select(this.row, 'archive'); })
  }
  @Builder
  swipeEnd() {
    Row({ space: 8 }) {
      Button(this.row.primary.title).enabled(!this.busy && !this.row.primary.disabled)
        .onClick(() => { this.select(this.row, this.row.primary.id); })
      if (this.row.secondary) {
        Button(this.row.secondary.title).enabled(!this.busy && this.row.writable)
          .bindMenu(this.submenu(this.row, this.row.menu.find((action: MenuAction) => action.id === 'snooze')?.children ?? []))
      }
    }
  }
  @Builder
  renameSheet() {
    Column({ space: 16 }) {
      Text(translate('mobile.threads.rename')).fontSize(22)
      TextInput({ text: this.renameTitle }).onChange((value: string) => { this.renameTitle = value; })
      Button(translate('mobile.threads.rename')).enabled(!this.busy && this.renameTitle.trim().length > 0)
        .onClick(() => { if (this.renameRow) { this.execute(this.renameRow, 'rename', this.renameTitle); } })
      if (this.error) { Text(this.error).fontColor($r('app.color.danger_foreground')) }
    }.padding(24)
  }
  private snoozeInput(): string {
    return this.snoozeMode === 'date'
      ? JSON.stringify({ mode: 'date', date: this.snoozeDate, time: this.snoozeTime })
      : JSON.stringify({ mode: 'duration', amount: this.snoozeAmount, unit: this.snoozeUnit });
  }
  @Builder
  snoozeSheet() {
    Column({ space: 12 }) {
      Text(translate('mobile.threads.snoozeUntil')).fontSize(22)
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
      Button(translate('mobile.threads.snooze')).enabled(!this.busy).onClick(() => {
        const value = this.snoozeInput();
        if (!customSnoozeValid(value)) {
          this.error = translate(this.snoozeMode === 'date' ? 'mobile.customSnoozeSheet.chooseFutureDate' : 'v2.surfaces.copy182');
        } else if (this.renameRow) { this.execute(this.renameRow, 'snooze:custom', value); }
      })
      if (this.error) { Text(this.error).fontColor($r('app.color.danger_foreground')) }
    }.padding(24)
  }
  @Builder
  arrangeSheet() {
    Column({ space: 12 }) {
      Text(translate('mobile.threads.arrangeThreads')).fontSize(22)
      List() {
        ForEach(this.state.arrangeRows, (row: ArrangeRow) => {
          ListItem() {
            Row({ space: 8 }) {
              Text(row.title).layoutWeight(1).maxLines(1)
              Button('↑').accessibilityText(translate('mobile.threads.moveUp'))
                .enabled(!this.busy && row.writable && row.canMoveUp)
                .onClick(() => { this.execute(row, 'move-up'); })
              Button('↓').accessibilityText(translate('mobile.threads.moveDown'))
                .enabled(!this.busy && row.writable && row.canMoveDown)
                .onClick(() => { this.execute(row, 'move-down'); })
            }.padding(8)
          }
        }, (row: ArrangeRow) => `${row.environmentId}:${row.id}`)
      }.layoutWeight(1)
      if (this.error) { Text(this.error).fontColor($r('app.color.danger_foreground')) }
    }.padding(24).height('100%')
  }
  @Builder
  actionSheet() {
    if (this.sheetKind === 'rename') { this.renameSheet() }
    else if (this.sheetKind === 'snooze') { this.snoozeSheet() }
    else { this.arrangeSheet() }
  }
  @Builder
  card() {
    Column({ space: 6 }) {
      Row({ space: 6 }) {
        Text(this.row.projectIcon || '▱').fontSize(14)
        Text(this.row.project).fontSize(12).maxLines(1).layoutWeight(1)
        ForEach(this.row.waiting, (wait: WaitingRow) => {
          if (wait.provider) { Image(this.icon(wait.provider)).width(14).height(14).accessibilityText(wait.title) }
          else { Text('◷').fontSize(14).accessibilityText(wait.title) }
        }, (wait: WaitingRow) => wait.key)
        if (this.row.waitingMore > 0) { Text(`+${this.row.waitingMore}`).fontSize(12) }
        Text(this.row.statusLabel).fontSize(12).fontColor(this.row.status === 'failed' ? $r('app.color.danger_foreground') : $r('app.color.foreground_muted'))
      }.width('100%')
      Text(`${this.row.pinned ? '⌖ ' : ''}${this.row.title}`).fontSize(16).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
      Text(this.row.branch).fontSize(12).maxLines(1).fontColor(this.row.status === 'failed' || this.row.status === 'limited' ? $r('app.color.danger_foreground') : $r('app.color.foreground_muted'))
      Row({ space: 6 }) {
        Text(this.row.environment).fontSize(11).maxLines(1).layoutWeight(1)
        Image(this.icon(this.row.provider)).width(16).height(16).accessibilityText(this.row.provider)
        if (this.row.inboxCount > 0) {
          Text(`? ${this.row.inboxCount}`).fontSize(14).fontColor(this.row.urgent ? $r('app.color.danger_foreground') : $r('app.color.foreground'))
            .padding(8).onClick(() => { this.openInbox(this.row.environmentId, this.row.id); })
        }
      }.width('100%')
    }.padding(14).width('100%').alignItems(HorizontalAlign.Start)
      .backgroundColor(this.color(this.row.color)).borderRadius(12)
      // TODO: P2 opens thread details here.
      .onClick(() => {}).bindContextMenu(this.menu(this.row), ResponseType.LongPress)
  }
  build() {
    ListItem() {
      Column() {
        this.card()
        if (this.error && !this.sheetOpened) { Text(this.error).fontColor($r('app.color.danger_foreground')) }
      }
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
  @Local error: string = '';
  private reported: boolean = false;
  build() {
    Column({ space: 8 }) {
      Search({ value: this.state.search, placeholder: translate('mobile.threads.searchThreads') })
        .onChange((value: string) => { this.state.search = value; setThreadFilter(value, this.state.projectKey); })
      Select([{ value: translate('mobile.threads.allProjects') }, ...this.state.projects.map((project: ProjectRow): SelectOption => ({ value: project.label }))])
        .value(this.state.projectKey ? this.state.projects.find((project: ProjectRow) => project.key === this.state.projectKey)?.label ?? '' : translate('mobile.threads.allProjects'))
        .onSelect((index: number) => { this.state.projectKey = index === 0 ? '' : this.state.projects[index - 1].key; setThreadFilter(this.state.search, this.state.projectKey); })
      if (this.error) { Text(this.error).fontColor($r('app.color.danger_foreground')) }
      List({ space: 8 }) {
        Repeat<ThreadRow>(this.state.rows).each((item: RepeatItem<ThreadRow>) => {
          if (item.item.kind === 'group') {
            ListItem() {
              Text(`${item.item.expanded ? '⌄' : '›'} ${item.item.title}`).padding(12).width('100%')
                .onClick(() => { toggleThreadGroup(item.item.group).catch(() => { this.error = translate('mobile.connectionTone.connectionFailed'); }); })
            }
          } else {
            ThreadCard({ row: item.item, state: this.state, openInbox: this.openInbox, firstVisible: () => {
              if (!this.reported) {
                this.reported = true;
                console.info(`T3P1 first list visible count=${this.state.rows.length} at=${Date.now()}`);
              }
            } })

          }
        }).key((row: ThreadRow) => row.key).virtualScroll()
        if (this.state.hiddenSettledCount > 0) {
          ListItem() { Button(translate('sidebar.showMoreLabel')).onClick(() => { showMoreThreads(); }) }
        }
        if (this.state.pageFailed) {
          ListItem() { Button(translate('action.retry')).onClick(() => { retryThreadPages(); }) }
        }
      }.layoutWeight(1)
    }.padding(12).height('100%').width('100%')
  }
}
