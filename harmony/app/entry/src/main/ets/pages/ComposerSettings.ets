import { ProviderIcon } from './ProviderIcon';
import { AppIcon } from './AppIcon';
import { ModelChoice, ModelSelection, ModelOptionDescriptor, ModelOptionChoice } from '../model/Models';
import { modelOptionChoices, modelOptionValue, withModelOption } from '../model/ModelOptions';
import { ThemeRuntime } from '../connection/ThemeRuntime';
import { Typography, resolveTypography, scaledFontSize } from '../model/Typography';

interface PermissionItem { value: string; label: string; detail: string; }

// Both composers expose the same provider-driven controls; the owning page saves changes.
@Component
export struct ComposerSettings {
  @Prop compact: boolean = false;
  @StorageLink('themeKey') themeKey: string = 't3-code-light';
  @StorageLink('textSizes') sizes: Typography = resolveTypography(16, null, null);
  @Prop models: ModelChoice[] = [];
  @Prop selection: ModelSelection | null = null;
  @Prop runtimeMode: string = 'full-access';
  @Prop interactionMode: string = 'default';
  @Prop disabled: boolean = false;
  onModel: (selection: ModelSelection) => void = () => {};
  onOptions: (selection: ModelSelection) => void = () => {};
  onMode: (kind: string, value: string) => void = () => {};
  @State sheetOpen: boolean = false;
  @State picker: string = 'model';
  @State query: string = '';
  private permissions: PermissionItem[] = [
    { value: 'approval-required', label: '需要审批', detail: '执行受限操作前询问' },
    { value: 'auto-accept-edits', label: '自动接受编辑', detail: '编辑自动通过，其他操作仍需审批' },
    { value: 'auto', label: '自动判断', detail: '由支持的提供方判断是否需要审批' },
    { value: 'full-access', label: '完全访问', detail: '允许提供方自主执行，不提示审批' }
  ];
  private color(role: string): string { return ThemeRuntime.color(this.themeKey, role); }
  private font(size: number): number { return scaledFontSize(size, this.sizes.baseFontSize); }
  private model(): ModelChoice | undefined {
    return this.models.find((entry: ModelChoice) => entry.instanceId === this.selection?.instanceId && entry.model === this.selection?.model);
  }
  private descriptors(): ModelOptionDescriptor[] { return this.model()?.optionDescriptors ?? []; }
  private effort(): ModelOptionDescriptor | undefined {
    return this.descriptors().find((entry: ModelOptionDescriptor) => /reasoning|effort|thinking/i.test(entry.id + ' ' + entry.label) && entry.type === 'select');
  }
  private effortLabel(): string {
    const descriptor = this.effort();
    if (descriptor === undefined || this.selection === null) return '推理强度';
    const value = modelOptionValue(this.selection, descriptor);
    return `${modelOptionChoices(descriptor).find((entry: ModelOptionChoice) => entry.id === value)?.label ?? value}`;
  }
  private open(picker: string): void { this.picker = picker; this.query = ''; this.sheetOpen = true; }
  private changeOption(descriptor: ModelOptionDescriptor, value: string | boolean | null): void {
    if (this.selection === null || this.disabled) return;
    const next = withModelOption(this.selection, descriptor, value);
    if (next !== null) { this.onOptions(next); this.sheetOpen = false; }
  }
  @Builder
  pickerSheet() {
    Column({ space: 16 }) {
      if (this.picker === 'model') {
        Search({ value: this.query, placeholder: '搜索模型或提供方' }).textFont({ size: this.font(16) })
          .fontColor(this.color('foreground')).backgroundColor(this.color('input')).onChange((value: string) => { this.query = value; })
        List({ space: 4 }) {
          ForEach(this.models.filter((entry: ModelChoice) => `${entry.label} ${entry.model}`.toLowerCase().includes(this.query.toLowerCase())), (entry: ModelChoice) => {
            ListItem() {
              Row({ space: 12 }) {
                ProviderIcon({ driver: entry.driver ?? '', label: entry.providerLabel ?? '', iconSize: 20 })
                Column({ space: 4 }) {
                  Text(entry.label).fontSize(this.font(16)).fontColor(this.color('foreground')).width('100%')
                  Text(entry.instanceId).fontSize(this.font(12)).fontColor(this.color('foreground-muted')).width('100%')
                }.layoutWeight(1)
                if (entry.instanceId === this.selection?.instanceId && entry.model === this.selection?.model) {
                  Text('✓').fontSize(this.font(20)).fontColor(this.color('primary'))
                }
              }.padding(14).width('100%').borderRadius(12).backgroundColor(this.color('card'))
                .enabled(!this.disabled).onClick(() => { this.onModel({ instanceId: entry.instanceId, model: entry.model }); this.sheetOpen = false; })
                .accessibilityText(`选择模型 ${entry.label}`)
            }
          }, (entry: ModelChoice) => entry.instanceId + ':' + entry.model)
        }.layoutWeight(1).width('100%')
      } else if (this.picker === 'permission') {
        List({ space: 8 }) {
          ForEach(this.permissions, (entry: PermissionItem) => {
            ListItem() {
              Row({ space: 12 }) {
                Column({ space: 5 }) {
                  Text(entry.label).fontColor(this.color('foreground')).fontSize(this.font(16)).width('100%')
                  Text(entry.detail).fontColor(this.color('foreground-muted')).fontSize(this.font(13)).width('100%')
                }.layoutWeight(1)
                if (this.runtimeMode === entry.value) { Text('✓').fontSize(this.font(20)).fontColor(this.color('primary')) }
              }.padding(16).width('100%').borderRadius(12).backgroundColor(this.color('card'))
                .enabled(!this.disabled).onClick(() => { this.onMode('runtime', entry.value); this.sheetOpen = false; })
                .accessibilityText(`权限 ${entry.label}`)
            }
          }, (entry: PermissionItem) => entry.value)
        }.layoutWeight(1).width('100%')
      } else {
        List({ space: 16 }) {
          ForEach(this.descriptors().filter((entry: ModelOptionDescriptor) => this.picker === 'effort' ? entry.id === this.effort()?.id : entry.id !== this.effort()?.id), (descriptor: ModelOptionDescriptor) => {
            ListItem() {
              Column({ space: 10 }) {
                Text(descriptor.label).fontSize(this.font(16)).fontWeight(FontWeight.Medium).fontColor(this.color('foreground')).width('100%')
                if (descriptor.type === 'select') {
                  ForEach(modelOptionChoices(descriptor), (entry: ModelOptionChoice) => {
                    Button(`${entry.label}${this.selection !== null && modelOptionValue(this.selection, descriptor) === entry.id ? '  ✓' : ''}`)
                      .fontSize(this.font(15)).fontColor(this.color('foreground')).backgroundColor(this.color('card')).width('100%').height(44)
                      .enabled(!this.disabled).onClick(() => { this.changeOption(descriptor, entry.id); })
                  }, (entry: ModelOptionChoice) => entry.id)
                } else if (descriptor.type === 'boolean') {
                  Toggle({ type: ToggleType.Switch, isOn: this.selection !== null && modelOptionValue(this.selection, descriptor) === true })
                    .enabled(!this.disabled).onChange((value: boolean) => { this.changeOption(descriptor, value); })
                }
                Button('恢复默认').fontSize(this.font(13)).fontColor(this.color('foreground-muted')).backgroundColor(Color.Transparent)
                  .enabled(!this.disabled).onClick(() => { this.changeOption(descriptor, null); })
              }.width('100%')
            }
          }, (entry: ModelOptionDescriptor) => entry.id)
        }.layoutWeight(1).width('100%')
      }
    }.padding({ left: 20, right: 20, top: 16, bottom: 28 }).width('100%').height('100%')
  }
  @Builder
  private modelControls() {
    Row({ space: 0 }) {
        Button({ type: ButtonType.Normal }) { ToolbarLabel({ maxLabelWidth: this.compact ? 90 : 170, provider: true, driver: this.model()?.driver ?? '', providerLabel: this.model()?.providerLabel ?? '', label: this.model()?.label.split(' · ').slice(-1)[0] ?? this.selection?.model ?? '选择模型' }) }
          .backgroundColor(Color.Transparent).height(36).borderRadius(8).padding({ left: 4, right: 4 })
          .enabled(!this.disabled).onClick(() => { this.open('model'); }).accessibilityText('选择模型')
        if (this.effort() !== undefined) {
          Divider().vertical(true).height(12).color(this.color('border'))
          Button({ type: ButtonType.Normal }) { ToolbarLabel({ label: this.effortLabel() }) }
            .backgroundColor(Color.Transparent).height(36).borderRadius(8).padding({ left: 4, right: 4 })
            .enabled(!this.disabled).onClick(() => { this.open('effort'); }).accessibilityText('选择推理强度 Effort')
        }
    }
  }
  @Builder
  private modeControls() {
    Row({ space: 4 }) {
        Button({ type: ButtonType.Normal }) { ToolbarLabel({ label: this.compact ? '' : this.permissions.find((entry: PermissionItem) => entry.value === this.runtimeMode)?.label ?? '运行权限', icon: this.runtimeMode === 'full-access' ? 'unlock' : 'lock' }) }
          .backgroundColor(Color.Transparent).height(36).borderRadius(8).padding({ left: 4, right: 4 })
          .enabled(!this.disabled).onClick(() => { this.open('permission'); }).accessibilityText('选择运行权限')
        Button({ type: ButtonType.Normal }) { ToolbarLabel({ label: this.compact ? '' : this.interactionMode === 'plan' ? '计划' : '构建', icon: 'robot', chevron: false }) }
          .backgroundColor(Color.Transparent).height(36).borderRadius(8).padding({ left: 4, right: 4 })
          .enabled(!this.disabled).accessibilityText('执行模式').bindMenu([
            { value: '执行', action: () => { this.onMode('interaction', 'default'); } },
            { value: '计划', action: () => { this.onMode('interaction', 'plan'); } }
          ])
        if (this.descriptors().some((entry: ModelOptionDescriptor) => entry.id !== this.effort()?.id)) {
          Button({ type: ButtonType.Normal }) { AppIcon({ name: 'more', iconSize: 16, tint: this.color('foreground-muted') }) }
            .backgroundColor(Color.Transparent).height(36).width(30).padding(0).borderRadius(8)
            .enabled(!this.disabled).onClick(() => { this.open('options'); }).accessibilityText('其他模型选项')
        }
    }
  }
  build() {
    Column({ space: 0 }) {
      if (this.compact) {
        Scroll() {
          Row({ space: 6 }) { this.modelControls(); this.modeControls(); }
        }.scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Off).width('100%').height(36).align(Alignment.Start)
      } else {
        Scroll() { this.modelControls() }.scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Off).width('100%').height(36).align(Alignment.Start)
        Scroll() { this.modeControls() }.scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Off).width('100%').height(36).align(Alignment.Start)
      }
    }.width('100%')
      .bindSheet($$this.sheetOpen, this.pickerSheet(), { height: SheetSize.LARGE, title: { title: this.picker === 'model' ? '选择模型' : this.picker === 'permission' ? '运行权限' : '模型选项' }, blurStyle: BlurStyle.COMPONENT_THICK, dragBar: true, showClose: true, backgroundColor: '#E6' + this.color('screen').slice(1) })
  }
}

@Component
struct ToolbarLabel {
  @Prop label: string = '';
  @Prop maxLabelWidth: number = 170;
  @Prop icon: string = '';
  @Prop provider: boolean = false;
  @Prop driver: string = '';
  @Prop providerLabel: string = '';
  @Prop chevron: boolean = true;
  @StorageLink('themeKey') themeKey: string = 't3-code-light';
  @StorageLink('textSizes') sizes: Typography = resolveTypography(16, null, null);
  build() {
    Row({ space: 4 }) {
      if (this.provider) { ProviderIcon({ driver: this.driver, label: this.providerLabel, iconSize: 16 }) }
      if (this.icon) { AppIcon({ name: this.icon, iconSize: 16, tint: ThemeRuntime.color(this.themeKey, 'foreground-muted') }) }
      Text(this.label).fontSize(scaledFontSize(13, this.sizes.baseFontSize)).fontColor(ThemeRuntime.color(this.themeKey, 'foreground-secondary'))
        .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).constraintSize({ maxWidth: this.maxLabelWidth })
      if (this.chevron) { AppIcon({ name: 'down', iconSize: 10, tint: ThemeRuntime.color(this.themeKey, 'foreground-muted') }) }
    }
  }
}
