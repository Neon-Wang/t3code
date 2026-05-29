import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { TextGenerationError, type KimiSettings, type ModelSelection } from "@t3tools/contracts";
import { sanitizeBranchFragment, sanitizeFeatureBranchName } from "@t3tools/shared/git";

import {
  buildBranchNamePrompt,
  buildCommitMessagePrompt,
  buildPrContentPrompt,
  buildThreadTitlePrompt,
} from "./TextGenerationPrompts.ts";
import { type TextGenerationShape } from "./TextGeneration.ts";
import {
  sanitizeCommitSubject,
  sanitizePrTitle,
  sanitizeThreadTitle,
} from "./TextGenerationUtils.ts";

const KIMI_TIMEOUT_MS = 180_000;

function normalizeCliError(
  operation: string,
  error: unknown,
  fallback: string,
): TextGenerationError {
  if (error instanceof TextGenerationError) {
    return error;
  }
  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (
      error.message.includes("Command not found: kimi") ||
      lower.includes("spawn kimi") ||
      lower.includes("enoent")
    ) {
      return new TextGenerationError({
        operation,
        detail: "Kimi Code CLI (`kimi`) is required but not available on PATH.",
        cause: error,
      });
    }
    return new TextGenerationError({
      operation,
      detail: `${fallback}: ${error.message}`,
      cause: error,
    });
  }
  return new TextGenerationError({
    operation,
    detail: fallback,
    cause: error,
  });
}

function extractJsonObject(text: string): string | undefined {
  const trimmed = text.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return undefined;
  }
  return trimmed.slice(firstBrace, lastBrace + 1);
}

export const makeKimiTextGeneration = Effect.fn("makeKimiTextGeneration")(function* (
  kimiConfig: KimiSettings,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const runKimiJson = <S extends Schema.Top>(
    operation:
      | "generateCommitMessage"
      | "generatePrContent"
      | "generateBranchName"
      | "generateThreadTitle",
    cwd: string,
    prompt: string,
    outputSchema: S,
    modelSelection: ModelSelection,
  ): Effect.Effect<S["Type"], TextGenerationError, S["DecodingServices"]> =>
    Effect.gen(function* () {
      const fullPrompt = `${prompt}\n\nRespond ONLY with a valid JSON object. Do not wrap it in markdown code blocks.`;

      const args: Array<string> = ["-p", fullPrompt, "--output-format", "stream-json"];
      const model = modelSelection.model || kimiConfig.model || undefined;
      if (model) {
        args.push("-m", model);
      }

      const child = yield* spawner
        .spawn(
          ChildProcess.make(kimiConfig.binaryPath || "kimi", args, {
            cwd,
            env: environment,
          }),
        )
        .pipe(
          Effect.scoped,
          Effect.mapError((cause) =>
            normalizeCliError(operation, cause, "Failed to spawn Kimi Code CLI process"),
          ),
        );

      const outputRef = yield* Ref.make("");
      yield* child.stdout
        .pipe(
          Stream.decodeText(),
          Stream.splitLines,
          Stream.runForEach((line) =>
            Effect.sync(() => {
              if (line.trim().length === 0) return;
              try {
                const parsed = JSON.parse(line);
                if (parsed.role === "assistant" && typeof parsed.content === "string") {
                  Ref.update(outputRef, (current) => current + parsed.content);
                }
              } catch {
                // ignore invalid JSON lines
              }
            }),
          ),
        )
        .pipe(
          Effect.mapError((cause) =>
            normalizeCliError(operation, cause, "Failed to read Kimi Code output"),
          ),
        );

      const exitCode = yield* child.exitCode.pipe(
        Effect.mapError((cause) =>
          normalizeCliError(operation, cause, "Failed to read Kimi Code exit code"),
        ),
      );

      if (exitCode !== 0) {
        return yield* new TextGenerationError({
          operation,
          detail: `Kimi Code exited with code ${exitCode}.`,
        });
      }

      const output = yield* Ref.get(outputRef);
      const jsonText = extractJsonObject(output);
      if (!jsonText) {
        return yield* new TextGenerationError({
          operation,
          detail: `Kimi Code did not return a valid JSON object. Raw output:\n${output}`,
        });
      }

      const decodeOutput = Schema.decodeEffect(Schema.fromJsonString(outputSchema));
      return yield* decodeOutput(jsonText).pipe(
        Effect.catchTag("SchemaError", (cause) =>
          Effect.fail(
            new TextGenerationError({
              operation,
              detail: `Kimi Code returned invalid structured output. Raw output:\n${jsonText}`,
              cause,
            }),
          ),
        ),
      );
    }).pipe(Effect.timeoutOption(KIMI_TIMEOUT_MS));

  const generateCommitMessage: TextGenerationShape["generateCommitMessage"] = Effect.fn(
    "KimiTextGeneration.generateCommitMessage",
  )(function* (input) {
    const { prompt, outputSchema } = buildCommitMessagePrompt({
      branch: input.branch,
      stagedSummary: input.stagedSummary,
      stagedPatch: input.stagedPatch,
      includeBranch: input.includeBranch === true,
    });

    const generated = yield* runKimiJson(
      "generateCommitMessage",
      input.cwd,
      prompt,
      outputSchema,
      input.modelSelection,
    );

    return {
      subject: sanitizeCommitSubject(generated.subject),
      body: generated.body.trim(),
      ...("branch" in generated && typeof generated.branch === "string"
        ? { branch: sanitizeFeatureBranchName(generated.branch) }
        : {}),
    };
  });

  const generatePrContent: TextGenerationShape["generatePrContent"] = Effect.fn(
    "KimiTextGeneration.generatePrContent",
  )(function* (input) {
    const { prompt, outputSchema } = buildPrContentPrompt({
      baseBranch: input.baseBranch,
      headBranch: input.headBranch,
      commitSummary: input.commitSummary,
      diffSummary: input.diffSummary,
      diffPatch: input.diffPatch,
    });

    const generated = yield* runKimiJson(
      "generatePrContent",
      input.cwd,
      prompt,
      outputSchema,
      input.modelSelection,
    );

    return {
      title: sanitizePrTitle(generated.title),
      body: generated.body.trim(),
    };
  });

  const generateBranchName: TextGenerationShape["generateBranchName"] = Effect.fn(
    "KimiTextGeneration.generateBranchName",
  )(function* (input) {
    const { prompt, outputSchema } = buildBranchNamePrompt({
      message: input.message,
      attachments: input.attachments,
    });

    const generated = yield* runKimiJson(
      "generateBranchName",
      input.cwd,
      prompt,
      outputSchema,
      input.modelSelection,
    );

    return {
      branch: sanitizeBranchFragment(generated.branch),
    };
  });

  const generateThreadTitle: TextGenerationShape["generateThreadTitle"] = Effect.fn(
    "KimiTextGeneration.generateThreadTitle",
  )(function* (input) {
    const { prompt, outputSchema } = buildThreadTitlePrompt({
      message: input.message,
      attachments: input.attachments,
    });

    const generated = yield* runKimiJson(
      "generateThreadTitle",
      input.cwd,
      prompt,
      outputSchema,
      input.modelSelection,
    );

    return {
      title: sanitizeThreadTitle(generated.title),
    };
  });

  return {
    generateCommitMessage,
    generatePrContent,
    generateBranchName,
    generateThreadTitle,
  } satisfies TextGenerationShape;
});
