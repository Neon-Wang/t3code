// @effect-diagnostics nodeBuiltinImport:off - parses real widget sources on disk.
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

type BabelPath = {
  node: { type: string; name?: string; body?: unknown };
  parent: { source?: { value: string } };
  scope: { getBinding(name: string): { kind: string; path: BabelPath } | undefined };
  findParent(test: (path: BabelPath) => boolean): BabelPath | null;
  traverse(visitor: Record<string, (path: BabelPath) => void>): void;
  isTSType(): boolean;
  isTSTypeAnnotation(): boolean;
  isTSTypeParameterInstantiation(): boolean;
};

const requireFromMobile = NodeModule.createRequire(
  NodePath.resolve(__dirname, "../../package.json"),
);
const babel: {
  parseSync(code: string, options: Record<string, unknown>): unknown;
  traverse(ast: unknown, visitor: Record<string, (path: BabelPath) => void>): void;
} = requireFromMobile("@babel/core");

// expo-widgets serializes each "widget" function to a string and evaluates it
// in a runtime that only provides @expo/ui exports and JS globals. Any other
// module binding the function closes over is undefined on the device and the
// widget renders "Property '<name>' doesn't exist" instead of its layout.
function capturedModuleBindings(filename: string): string[] {
  const ast = babel.parseSync(NodeFS.readFileSync(filename, "utf8"), {
    filename,
    configFile: false,
    babelrc: false,
    parserOpts: { plugins: ["typescript", "jsx"] },
  });
  const captured = new Set<string>();
  babel.traverse(ast, {
    Function(fn) {
      const body = fn.node.body as { directives?: Array<{ value: { value: string } }> };
      if (!body.directives?.some((directive) => directive.value.value === "widget")) return;
      fn.traverse({
        ReferencedIdentifier(ref) {
          // Type positions are erased before the function is serialized.
          if (
            ref.findParent(
              (parent) =>
                parent.isTSType() ||
                parent.isTSTypeAnnotation() ||
                parent.isTSTypeParameterInstantiation(),
            )
          )
            return;
          const name = ref.node.name!;
          const binding = ref.scope.getBinding(name);
          if (!binding || binding.path.findParent((parent) => parent === fn)) return;
          const source = binding.kind === "module" ? binding.path.parent.source?.value : undefined;
          if (source?.startsWith("@expo/ui/")) return;
          captured.add(name);
        },
      });
    },
  });
  return [...captured].toSorted();
}

const widgetFiles = NodeFS.readdirSync(__dirname)
  .filter((file) => file.endsWith(".tsx"))
  .map((file) => NodePath.join(__dirname, file))
  .filter((file) => NodeFS.readFileSync(file, "utf8").includes('"widget";'));

describe("widget runtime scope", () => {
  it("finds the widget functions", () => {
    expect(widgetFiles.map((file) => NodePath.basename(file)).toSorted()).toEqual([
      "AgentActivity.tsx",
      "SubscriptionUsage.android.tsx",
      "SubscriptionUsage.tsx",
    ]);
  });

  it.each(widgetFiles.map((file) => [NodePath.basename(file), file]))(
    "%s only uses bindings the widget runtime provides",
    (_name, file) => {
      expect(capturedModuleBindings(file)).toEqual([]);
    },
  );
});
