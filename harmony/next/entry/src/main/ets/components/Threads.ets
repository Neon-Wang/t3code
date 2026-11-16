import { translate, setThreadFilter, toggleThreadGroup, showMoreThreads, retryThreadPages, threadAction } from '../generated/core.js';
import { ClientState, ThreadRow, MenuAction, WaitingRow, ProjectRow } from '../model/ClientState';

@ComponentV2
struct ThreadCard {
  @Require @Param row: ThreadRow;
  @Event openInbox: (environmentId: string, threadId: string) => void = () => {};
  @Local error: string = '';
  @Local busy: boolean = false;
  @Local renaming: boolean = false;
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
  private async execute(row: ThreadRow, id: string, value: string = ''): Promise<void> {
    this.error = '';
    this.busy = true;
    try {
      await threadAction(row.environmentId, row.id, id, value);
      this.renaming = false;
    } catch (error) { this.error = translate('mobile.connectionTone.connectionFailed'); }
    finally { this.busy = false; }
  }
  private select(row: ThreadRow, id: string): void {
    if (id === 'rename') {
      this.renameRow = row;
      this.renameTitle = row.title;
      this.renaming = true;
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
          MenuItem({ content: action.title }).enabled(!this.busy && !action.disabled)
            .onClick(() => { this.select(row, action.id); })
        }
      }, (action: MenuAction) => action.id)
    }
  }
  @Builder
  submenu(row: ThreadRow, actions: MenuAction[]) {
    Menu() {
      ForEach(actions, (action: MenuAction) => {
        MenuItem({ content: action.title }).enabled(!this.busy && !action.disabled)
          .onClick(() => { this.select(row, action.id); })
      }, (action: MenuAction) => action.id)
    }
  }
  @Builder
  swipeStart(row: ThreadRow) {
    Button(row.primary.title).enabled(!this.busy && !row.primary.disabled)
      .onClick(() => { this.select(row, row.primary.id); })
  }
  @Builder
  swipeEnd(row: ThreadRow) {
    Row({ space: 8 }) {
      if (row.secondary) {
        Button(row.secondary.title).enabled(!this.busy && row.writable)
          .bindMenu(this.submenu(row, row.menu.find((action: MenuAction) => action.id === 'snooze')?.children ?? []))
      }
      Button(translate('mobile.threads.archive')).enabled(!this.busy && !row.menu.find((action: MenuAction) => action.id === 'archive')?.disabled)
        .onClick(() => { this.select(row, 'archive'); })
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
        if (this.error) { Text(this.error).fontColor($r('app.color.danger_foreground')) }
      }
    }.swipeAction({ start: { builder: () => { this.swipeStart(this.row) } }, end: { builder: () => { this.swipeEnd(this.row) } } })
      .bindSheet($$this.renaming, this.renameSheet(), { height: SheetSize.MEDIUM, showClose: true, backgroundColor: $r('app.color.sheet_solid') })
  }
}

@ComponentV2
export struct Threads {
  @Require @Param state: ClientState;
  @Event openInbox: (environmentId: string, threadId: string) => void = () => {};
  @Local search: string = '';
  @Local projectKey: string = '';
  @Local error: string = '';
  private reported: boolean = false;
  build() {
    Column({ space: 8 }) {
      Search({ value: this.search, placeholder: translate('mobile.threads.searchThreads') })
        .onChange((value: string) => { this.search = value; setThreadFilter(value, this.projectKey); })
      Select([{ value: translate('mobile.threads.allProjects') }, ...this.state.projects.map((project: ProjectRow): SelectOption => ({ value: project.label }))])
        .value(this.projectKey ? this.state.projects.find((project: ProjectRow) => project.key === this.projectKey)?.label ?? '' : translate('mobile.threads.allProjects'))
        .onSelect((index: number) => { this.projectKey = index === 0 ? '' : this.state.projects[index - 1].key; setThreadFilter(this.search, this.projectKey); })
      if (this.error) { Text(this.error).fontColor($r('app.color.danger_foreground')) }
      List({ space: 8 }) {
        Repeat<ThreadRow>(this.state.rows).each((item: RepeatItem<ThreadRow>) => {
          if (item.item.kind === 'group') {
            ListItem() {
              Text(`${item.item.expanded ? '⌄' : '›'} ${item.item.title}`).padding(12).width('100%')
                .onClick(() => { toggleThreadGroup(item.item.group).catch(() => { this.error = translate('mobile.connectionTone.connectionFailed'); }); })
            }
          } else {
            ThreadCard({ row: item.item, openInbox: this.openInbox })
              .onVisibleAreaChange([0.0], (visible: boolean) => {
                if (visible && !this.reported) {
                  this.reported = true;
                  console.info(`T3P1 first list visible count=${this.state.rows.length} at=${Date.now()}`);
                }
              })
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
