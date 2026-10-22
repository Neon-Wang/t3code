// @effect-diagnostics nodeBuiltinImport:off - parses real navigation sources on disk.
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

type Node = {
  type: string;
  name?: string;
  loc?: { start: { line: number } };
  key?: Node;
  value?: Node;
  callee?: Node;
  object?: Node;
  property?: Node;
  arguments?: Node[];
};
type BabelPath = { node: Node };

const mobileRoot = NodePath.resolve(__dirname, "..");
const requireFromMobile = NodeModule.createRequire(NodePath.join(mobileRoot, "package.json"));
const babel: {
  parseSync(code: string, options: Record<string, unknown>): unknown;
  traverse(ast: unknown, visitor: Record<string, (path: BabelPath) => void>): void;
} = requireFromMobile("@babel/core");

const NAVIGATION_METHODS = new Set(["navigate", "push", "replace", "jumpTo"]);
const NAVIGATION_RECEIVER =
  /navigation$|navigator$|^(StackActions|CommonActions|TabActions|router)$/i;

function receiverName(callee: Node | undefined): string {
  const object = callee?.object;
  return (object?.type === "MemberExpression" ? object.property?.name : object?.name) ?? "";
}

function isTranslation(node: Node | undefined): boolean {
  if (node?.type !== "CallExpression") return false;
  const callee = node.callee;
  return (
    (callee?.type === "Identifier" && callee.name === "t") ||
    (callee?.type === "MemberExpression" && callee.property?.name === "t")
  );
}

// Route names are identifiers. A translated one only matches in English, so in
// Chinese the navigator throws while the module loads and the app opens blank.
function translatedRouteNames(filename: string): string[] {
  const ast = babel.parseSync(NodeFS.readFileSync(filename, "utf8"), {
    filename,
    configFile: false,
    babelrc: false,
    parserOpts: { plugins: ["typescript", "jsx"] },
  });
  const found: string[] = [];
  const at = (node: Node) =>
    `${NodePath.relative(mobileRoot, filename)}:${node.loc?.start.line ?? 0}`;
  babel.traverse(ast, {
    ObjectProperty({ node }) {
      if (node.key?.name === "initialRouteName" && isTranslation(node.value)) found.push(at(node));
    },
    JSXAttribute({ node }) {
      const name = (node as { name?: { name?: string } }).name?.name;
      const expression = (node.value as { expression?: Node } | undefined)?.expression;
      if (name === "initialRouteName" && isTranslation(expression)) found.push(at(node));
    },
    CallExpression({ node }) {
      const method = node.callee?.type === "MemberExpression" ? node.callee.property?.name : "";
      if (
        method &&
        NAVIGATION_METHODS.has(method) &&
        NAVIGATION_RECEIVER.test(receiverName(node.callee)) &&
        isTranslation(node.arguments?.[0])
      ) {
        found.push(at(node));
      }
    },
  });
  return found;
}

function sourceFiles(dir: string): string[] {
  return NodeFS.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = NodePath.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("navigation identifiers", () => {
  it("never pass a translated string as a route name", () => {
    const sources = sourceFiles(NodePath.join(mobileRoot, "src"));
    expect(sources.length).toBeGreaterThan(100);
    expect(sources.flatMap(translatedRouteNames)).toEqual([]);
  });
});
