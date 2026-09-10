import { ModelSelection, ModelOptionDescriptor, ModelOptionChoice, ModelOptionSelection } from './Models';

export function modelOptionChoices(descriptor: ModelOptionDescriptor): ModelOptionChoice[] {
  return (descriptor.options ?? []).filter((choice: ModelOptionChoice) =>
    choice.id !== 'ultracode' && !(descriptor.promptInjectedValues ?? []).includes(choice.id));
}

export function modelOptionValue(selection: ModelSelection, descriptor: ModelOptionDescriptor): string | boolean {
  const explicit = selection.options?.find((option: ModelOptionSelection) => option.id === descriptor.id);
  return explicit?.value ?? descriptor.currentValue ??
    (descriptor.type === 'boolean' ? false : descriptor.options?.find((choice: ModelOptionChoice) => choice.isDefault)?.id ?? '');
}

export function withModelOption(selection: ModelSelection, descriptor: ModelOptionDescriptor, value: string | boolean | null): ModelSelection | null {
  if (value !== null) {
    if (descriptor.type === 'boolean') { if (typeof value !== 'boolean') return null; }
    else if (descriptor.type === 'select') {
      if (typeof value !== 'string' || !modelOptionChoices(descriptor).some((choice: ModelOptionChoice) => choice.id === value)) return null;
    } else return null;
  }
  const options = (selection.options ?? []).filter((option: ModelOptionSelection) => option.id !== descriptor.id);
  if (value !== null) options.push({ id: descriptor.id, value: value });
  return { instanceId: selection.instanceId, model: selection.model, options: options };
}
