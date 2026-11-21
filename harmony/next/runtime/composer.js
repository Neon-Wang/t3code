import { translate } from "./locale.js";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import * as Effect from "effect/Effect";
import { Atom } from "effect/reactivity";
import * as Option from "effect/Option";
import { PROVIDER_SEND_TURN_MAX_ATTACHMENTS } from "@t3tools/contracts";
import {
  createAttachmentEnvironmentAtoms,
  runAttachmentUploadCycle,
} from "@t3tools/client-runtime/state/attachments";
import { resolveAssetUrl } from "@t3tools/client-runtime/state/assets";
import { buildModelOptions } from "../../../apps/mobile/src/lib/modelOptions.ts";
import { threadAllowsProviderSwitch } from "../../../apps/mobile/src/state/thread-provider-switching.ts";
import {
  resolveProviderOptionDescriptors,
  applyProviderOptionSelection,
} from "../../../apps/mobile/src/lib/providerOptions.ts";
import { getProviderOptionCurrentValue } from "@t3tools/shared/model";
import {
  threadRuntimeHasInterruptibleRun,
  deriveThreadRuntime,
} from "@t3tools/client-runtime/state/thread-execution";
import { pickAttachment, uploadAttachmentBytes } from "./attachments.js";
import { randomBytes } from "./platform.js";

export const newId = () =>
  Array.from(randomBytes(16), (byte) => byte.toString(16).padStart(2, "0")).join("");

export function createComposer({ runtime, registry, lists, server, session, context, run }) {
  const drafts = Atom.family(() =>
    Atom.make({ text: "", selection: null, attachments: [], busy: false }).pipe(Atom.keepAlive),
  );
  const attachments = createAttachmentEnvironmentAtoms(runtime);
  const key = (ref) => JSON.stringify([ref.environmentId, ref.threadId]);
  const draft = (ref) => drafts(key(ref));
  const update = (ref, patch) =>
    registry.set(draft(ref), { ...registry.get(draft(ref)), ...patch });
  const options = (config, selection, shell, projection) =>
    buildModelOptions(
      config,
      selection,
      threadAllowsProviderSwitch({ thread: shell, projection })
        ? undefined
        : projection?.thread.modelSelection.instanceId,
      projection?.thread.projectId ?? shell?.projectId ?? null,
    );
  const descriptors = (models, selection) =>
    resolveProviderOptionDescriptors({
      capabilities: models.find(
        (model) => model.key === `${selection?.instanceId}:${selection?.model}`,
      )?.capabilities,
      selections: selection?.options,
    });
  return {
    view(get, ref, projection, shell, writable) {
      const state = get(draft(ref));
      const selection = state.selection ?? projection?.thread.modelSelection;
      const models = options(
        get(server.configValueAtom(ref.environmentId)),
        selection,
        shell,
        projection,
      );
      return {
        text: state.text,
        busy: state.busy,
        writable: writable && !!projection,
        running: threadRuntimeHasInterruptibleRun(
          projection ? deriveThreadRuntime(projection) : null,
        ),
        modelKey: `${selection?.instanceId}:${selection?.model}`,
        provider:
          models.find((model) => model.key === `${selection?.instanceId}:${selection?.model}`)
            ?.providerDriver ?? "",
        models: models.map((model) => ({
          key: model.key,
          label: model.label,
          group: model.providerLabel,
          provider: model.providerDriver,
          disabled: model.isUnavailable === true,
        })),
        options: descriptors(models, selection).map((option) => ({
          id: option.id,
          label: option.label,
          value: String(getProviderOptionCurrentValue(option, selection)),
          choices:
            option.type === "boolean"
              ? [
                  { id: "true", label: translate("On") },
                  { id: "false", label: translate("Off") },
                ]
              : option.options,
        })),
        attachments: state.attachments.map(({ id, name, status }) => ({ id, name, status })),
      };
    },
    text(ref, text) {
      update(ref, { text });
    },
    async action(ref, action, value, projection, shell) {
      const state = registry.get(draft(ref));
      const config = registry.get(server.configValueAtom(ref.environmentId));
      const selection = state.selection ?? projection?.thread.modelSelection;
      const models = options(config, selection, shell, projection);
      if (action === "models") {
        if (config?.environment.capabilities.modelCatalogRefresh === true) {
          const result = await runAtomCommand(registry, server.refreshProviders, {
            environmentId: ref.environmentId,
            input: { modelCatalogOnly: true },
          });
          if (result._tag === "Failure") throw new Error(translate("Could not refresh models"));
        }
        return;
      }
      if (action === "model") {
        const model = models.find((model) => model.key === value && !model.isUnavailable);
        if (!model) throw new Error(translate("Model unavailable"));
        update(ref, { selection: model.selection });
        return;
      }
      if (action === "option") {
        const change = JSON.parse(value);
        const options = applyProviderOptionSelection(descriptors(models, selection), change);
        if (options === null) throw new Error(translate("Model option unavailable"));
        update(ref, { selection: { ...selection, options } });
        return;
      }
      if (state.busy) return;
      update(ref, { busy: true });
      try {
        if (action === "photo" || action === "file") {
          if (state.attachments.length >= PROVIDER_SEND_TURN_MAX_ATTACHMENTS)
            throw new Error(translate("Attachment limit reached"));
          const picked = await pickAttachment(context, action === "photo");
          if (!picked) return;
          const id = newId();
          const pending = { ...picked.upload, id, status: "uploading", attachmentId: null };
          update(ref, { attachments: [...state.attachments, pending] });
          const result = await Effect.runPromise(
            runAttachmentUploadCycle({
              registry,
              ...attachments,
              environmentId: ref.environmentId,
              upload: picked.upload,
              resolveUploadUrl(relativeUrl) {
                const connection = registry.get(
                  session.preparedConnectionValueAtom(ref.environmentId),
                );
                return Option.isSome(connection)
                  ? resolveAssetUrl(connection.value.httpBaseUrl, relativeUrl)
                  : null;
              },
              transport: (url) =>
                Effect.tryPromise((signal) => uploadAttachmentBytes(url, picked, signal)),
            }),
          );
          update(ref, {
            attachments: [
              ...state.attachments,
              { ...pending, attachmentId: result.attachmentId, status: result.status },
            ],
          });
          if (result.status === "failed")
            throw new Error(translate("Attachment upload failed: {step}", { step: result.step }));
          return;
        }
        if (action === "remove") {
          const attachment = state.attachments.find((item) => item.id === value);
          if (attachment?.attachmentId) {
            const result = await runAtomCommand(registry, attachments.remove, {
              environmentId: ref.environmentId,
              input: { attachmentId: attachment.attachmentId },
            });
            if (result._tag === "Failure")
              throw new Error(translate("Could not remove attachment"));
          }
          update(ref, { attachments: state.attachments.filter((item) => item.id !== value) });
          return;
        }
        if (action === "stop") return await run(lists.commands.interruptTurn, ref, {});
        if (action === "send" || action === "queue") {
          if (!state.text.trim() && state.attachments.length === 0) return;
          if (state.attachments.some((item) => item.status !== "uploaded"))
            throw new Error(translate("Remove failed attachments before sending."));
          if (!projection)
            throw new Error(translate("Wait for the thread to sync before sending."));
          await run(lists.commands.startTurn, ref, {
            message: {
              messageId: newId(),
              role: "user",
              text: state.text,
              attachments: state.attachments.map(
                ({ attachmentId, type, name, mimeType, sizeBytes }) => ({
                  id: attachmentId,
                  type,
                  name,
                  mimeType,
                  sizeBytes,
                }),
              ),
            },
            modelSelection: selection,
            runtimeMode: projection.thread.runtimeMode,
            interactionMode: projection.thread.interactionMode,
            dispatchMode: action === "queue" ? "queue" : "auto",
          });
          update(ref, { text: "", attachments: [] });
          return;
        }
        throw new Error(translate("Unknown composer action"));
      } finally {
        update(ref, { busy: false });
      }
    },
  };
}
