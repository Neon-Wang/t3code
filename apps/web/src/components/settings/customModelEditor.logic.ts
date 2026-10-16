import { i18n } from "@t3tools/shared/i18n";
import {
  type ModelCapabilities,
  ProviderDriverKind,
  type ProviderOptionDescriptor,
} from "@t3tools/contracts";
import { type CustomModelDefinition, createModelCapabilities } from "@t3tools/shared/model";

/** Editable mirror of a `ProviderOptionChoice`. `key` is only a React key. */
export interface EditorChoice {
  readonly key: string;
  readonly id: string;
  readonly label: string;
  readonly isDefault: boolean;
  readonly description?: string;
}

/** Editable mirror of a `ProviderOptionDescriptor`. `key` is only a React key. */
export interface EditorDescriptor {
  readonly key: string;
  readonly type: "select" | "boolean";
  readonly id: string;
  readonly label: string;
  readonly choices: ReadonlyArray<EditorChoice>;
  readonly currentBooleanValue?: boolean | undefined;
  readonly description?: string | undefined;
}

export interface CustomModelDraft {
  readonly slug: string;
  readonly name: string;
  readonly descriptors: ReadonlyArray<EditorDescriptor>;
}

export interface DescriptorPreset {
  readonly id: string;
  readonly label: string;
  readonly type: "select" | "boolean";
  readonly choices?: ReadonlyArray<{ id: string; label: string; isDefault?: boolean }>;
}

const EFFORT_CHOICES = [
  {
    id: "low",
    get label() {
      return i18n.t("chat.ui.trait.Low");
    },
  },
  {
    id: "medium",
    get label() {
      return i18n.t("chat.ui.trait.Medium");
    },
    isDefault: true,
  },
  {
    id: "high",
    get label() {
      return i18n.t("chat.ui.trait.High");
    },
  },
  {
    id: "xhigh",
    get label() {
      return i18n.t("chat.ui.trait.ExtraHigh");
    },
  },
] as const;

/**
 * Option ids each adapter actually reads off a turn's model selection, with
 * the usual choices pre-filled. Anything else the user types is stored
 * verbatim but will be ignored by the driver.
 */
export const DESCRIPTOR_PRESETS_BY_KIND: Partial<
  Record<ProviderDriverKind, ReadonlyArray<DescriptorPreset>>
> = {
  [ProviderDriverKind.make("codex")]: [
    {
      id: "reasoningEffort",
      get label() {
        return i18n.t("chat.ui.trait.Reasoning");
      },
      type: "select",
      choices: EFFORT_CHOICES,
    },
    {
      id: "serviceTier",
      get label() {
        return i18n.t("settings.providers.speed");
      },
      type: "select",
      choices: [
        {
          id: "default",
          get label() {
            return i18n.t("browser.standard");
          },
          isDefault: true,
        },
        {
          id: "fast",
          get label() {
            return i18n.t("chat.ui.trait.Fast");
          },
        },
      ],
    },
  ],
  [ProviderDriverKind.make("claudeAgent")]: [
    {
      id: "effort",
      get label() {
        return i18n.t("chat.ui.trait.Reasoning");
      },
      type: "select",
      choices: [
        {
          id: "low",
          get label() {
            return i18n.t("chat.ui.trait.Low");
          },
        },
        {
          id: "medium",
          get label() {
            return i18n.t("chat.ui.trait.Medium");
          },
        },
        {
          id: "high",
          get label() {
            return i18n.t("chat.ui.trait.High");
          },
          isDefault: true,
        },
        {
          id: "xhigh",
          get label() {
            return i18n.t("chat.ui.trait.ExtraHigh");
          },
        },
        {
          id: "max",
          get label() {
            return i18n.t("settings.diagnostics.max");
          },
        },
      ],
    },
    {
      id: "fastMode",
      get label() {
        return i18n.t("chat.ui.trait.FastMode");
      },
      type: "boolean",
    },
    {
      id: "thinking",
      get label() {
        return i18n.t("chat.ui.trait.Thinking");
      },
      type: "boolean",
    },
  ],
  [ProviderDriverKind.make("cursor")]: [
    {
      id: "reasoning",
      get label() {
        return i18n.t("chat.ui.trait.Reasoning");
      },
      type: "select",
      choices: EFFORT_CHOICES,
    },
    {
      id: "fastMode",
      get label() {
        return i18n.t("chat.ui.trait.FastMode");
      },
      type: "boolean",
    },
    {
      id: "thinking",
      get label() {
        return i18n.t("chat.ui.trait.Thinking");
      },
      type: "boolean",
    },
  ],
  [ProviderDriverKind.make("grok")]: [
    {
      id: "reasoningEffort",
      get label() {
        return i18n.t("chat.ui.trait.Reasoning");
      },
      type: "select",
      choices: EFFORT_CHOICES,
    },
  ],
  [ProviderDriverKind.make("pi")]: [
    {
      id: "thinking",
      get label() {
        return i18n.t("chat.ui.trait.Thinking");
      },
      type: "select",
      choices: [
        {
          id: "off",
          get label() {
            return i18n.t("settings.misc.off");
          },
        },
        {
          id: "minimal",
          get label() {
            return i18n.t("chat.ui.trait.Minimal");
          },
        },
        {
          id: "low",
          get label() {
            return i18n.t("chat.ui.trait.Low");
          },
        },
        {
          id: "medium",
          get label() {
            return i18n.t("chat.ui.trait.Medium");
          },
          isDefault: true,
        },
        {
          id: "high",
          get label() {
            return i18n.t("chat.ui.trait.High");
          },
        },
        {
          id: "xhigh",
          get label() {
            return i18n.t("chat.ui.trait.ExtraHigh");
          },
        },
        {
          id: "max",
          get label() {
            return i18n.t("settings.diagnostics.max");
          },
        },
      ],
    },
  ],
  [ProviderDriverKind.make("opencode")]: [
    {
      id: "variant",
      get label() {
        return i18n.t("chat.ui.trait.Reasoning");
      },
      type: "select",
      choices: EFFORT_CHOICES,
    },
    {
      id: "agent",
      get label() {
        return i18n.t("settings.providers.agent");
      },
      type: "select",
      choices: [
        {
          id: "build",
          get label() {
            return i18n.t("chat.composer.build");
          },
          isDefault: true,
        },
        {
          id: "plan",
          get label() {
            return i18n.t("chat.composer.plan");
          },
        },
      ],
    },
  ],
};

let nextKey = 0;
function newEditorKey(): string {
  nextKey += 1;
  return `k${nextKey}`;
}

export function choiceFromPreset(choice: {
  id: string;
  label: string;
  isDefault?: boolean;
}): EditorChoice {
  return { key: newEditorKey(), id: choice.id, label: choice.label, isDefault: !!choice.isDefault };
}

export function descriptorFromPreset(preset: DescriptorPreset): EditorDescriptor {
  return {
    key: newEditorKey(),
    type: preset.type,
    id: preset.id,
    label: preset.label,
    choices: (preset.choices ?? []).map(choiceFromPreset),
  };
}

export function emptyEditorDescriptor(): EditorDescriptor {
  return { key: newEditorKey(), type: "select", id: "", label: "", choices: [] };
}

export function emptyEditorChoice(): EditorChoice {
  return { key: newEditorKey(), id: "", label: "", isDefault: false };
}

/**
 * Prompt-injected choices (Claude's `ultrathink`) are delivered as prompt text
 * by built-in runtime profiles a custom entry does not have, so they are
 * dropped rather than stored as a plain option value.
 */
function descriptorToEditor(descriptor: ProviderOptionDescriptor): EditorDescriptor {
  const promptInjected = new Set(
    descriptor.type === "select" ? (descriptor.promptInjectedValues ?? []) : [],
  );
  const choices =
    descriptor.type === "select"
      ? descriptor.options.filter((option) => !promptInjected.has(option.id))
      : [];
  const defaultChoice =
    choices.find((option) => option.id === descriptor.currentValue) ??
    choices.find((option) => option.isDefault);
  return {
    key: newEditorKey(),
    type: descriptor.type,
    id: descriptor.id,
    label: descriptor.label,
    ...(descriptor.description !== undefined ? { description: descriptor.description } : {}),
    ...(descriptor.type === "boolean" && descriptor.currentValue !== undefined
      ? { currentBooleanValue: descriptor.currentValue }
      : {}),
    choices: choices.map((option) => ({
      key: newEditorKey(),
      id: option.id,
      label: option.label,
      ...(option.description !== undefined ? { description: option.description } : {}),
      isDefault: option === defaultChoice,
    })),
  };
}

export function draftFromDefinition(entry: CustomModelDefinition): CustomModelDraft {
  return {
    slug: entry.slug,
    name: entry.name === entry.slug ? "" : entry.name,
    descriptors: (entry.capabilities?.optionDescriptors ?? []).map(descriptorToEditor),
  };
}

/** Claude context choices require runtime suffix mappings that custom entries do not carry. */
export function descriptorsFromCapabilities(
  capabilities: ModelCapabilities | null | undefined,
  driverKind: ProviderDriverKind | null,
): EditorDescriptor[] {
  return (capabilities?.optionDescriptors ?? [])
    .filter((descriptor) => driverKind !== "claudeAgent" || descriptor.id !== "contextWindow")
    .map(descriptorToEditor);
}

/**
 * Validate the draft before saving. Returns the first problem in reading
 * order so the message is actionable, or `null` when the draft is sound.
 */
export function validateDraft(draft: CustomModelDraft): string | null {
  const seenIds = new Set<string>();
  for (const [index, descriptor] of draft.descriptors.entries()) {
    const position = i18n.t("settings.providers.optionNumber", { number: index + 1 });
    const id = descriptor.id.trim();
    if (!id) return i18n.t("settings.providers.optionNeedsId", { option: position });
    if (seenIds.has(id))
      return i18n.t("settings.providers.optionDuplicateId", { option: position, id: id });
    seenIds.add(id);
    if (!descriptor.label.trim())
      return i18n.t("settings.providers.optionNeedsLabel", { option: position });
    if (descriptor.type !== "select") continue;
    if (descriptor.choices.length === 0)
      return i18n.t("settings.providers.optionNeedsChoice", { option: position });
    const seenChoices = new Set<string>();
    for (const choice of descriptor.choices) {
      const choiceId = choice.id.trim();
      if (!choiceId) return i18n.t("settings.providers.choiceMissingValue", { option: position });
      if (seenChoices.has(choiceId)) {
        return i18n.t("settings.providers.duplicateChoice", { option: position, value: choiceId });
      }
      seenChoices.add(choiceId);
    }
  }
  return null;
}

/** Convert a validated draft back into a definition. Blank name → slug. */
export function definitionFromDraft(draft: CustomModelDraft): CustomModelDefinition {
  const descriptors: ProviderOptionDescriptor[] = draft.descriptors.map((descriptor) => {
    const id = descriptor.id.trim();
    const label = descriptor.label.trim();
    if (descriptor.type === "boolean") {
      return {
        id,
        label,
        type: "boolean",
        ...(descriptor.description !== undefined ? { description: descriptor.description } : {}),
        ...(descriptor.currentBooleanValue !== undefined
          ? { currentValue: descriptor.currentBooleanValue }
          : {}),
      };
    }
    const options = descriptor.choices.map((choice) => ({
      id: choice.id.trim(),
      label: choice.label.trim() || choice.id.trim(),
      ...(choice.description !== undefined ? { description: choice.description } : {}),
      ...(choice.isDefault ? { isDefault: true } : {}),
    }));
    const currentValue = options.find((option) => option.isDefault)?.id;
    return {
      id,
      label,
      type: "select",
      ...(descriptor.description !== undefined ? { description: descriptor.description } : {}),
      options,
      ...(currentValue ? { currentValue } : {}),
    };
  });
  const name = draft.name.trim();
  return {
    slug: draft.slug,
    name: name || draft.slug,
    capabilities:
      descriptors.length > 0 ? createModelCapabilities({ optionDescriptors: descriptors }) : null,
  };
}
