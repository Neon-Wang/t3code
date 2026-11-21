import { parseMarkdownDocument } from "../../../apps/mobile/src/lib/markdownDocument.ts";

export function markdownBlocks(text) {
  const document = parseMarkdownDocument(text);
  const definitions = new Map();
  const collect = (node) => {
    if (node.type === "definition") definitions.set(node.identifier.toUpperCase(), node.url);
    for (const child of node.children ?? []) collect(child);
  };
  collect(document);
  const inline = (
    node,
    parent = { bold: false, italic: false, strike: false, code: false, href: "" },
  ) => {
    const style = {
      ...parent,
      bold: parent.bold || node.type === "strong",
      italic: parent.italic || node.type === "emphasis",
      strike: parent.strike || node.type === "delete",
      code: parent.code || node.type === "inlineCode",
      href:
        node.type === "link"
          ? node.url
          : node.type === "linkReference"
            ? (definitions.get(node.identifier.toUpperCase()) ?? "")
            : parent.href,
    };
    if (node.type === "break") return [{ ...style, text: "\n" }];
    if (node.type === "image" || node.type === "imageReference")
      return [
        {
          ...style,
          text: node.alt ?? "",
          href: node.url ?? definitions.get(node.identifier.toUpperCase()) ?? "",
        },
      ];
    if (typeof node.value === "string") return [{ ...style, text: node.value }];
    return (node.children ?? []).flatMap((child) => inline(child, style));
  };
  const blocks = [];
  const visit = (node, depth = 0, marker = "") => {
    switch (node.type) {
      case "definition":
        return;
      case "root":
        for (const child of node.children) visit(child, depth);
        return;
      case "list": {
        let number = node.start ?? 1;
        for (const item of node.children) {
          const label =
            typeof item.checked === "boolean"
              ? item.checked
                ? "☑"
                : "☐"
              : node.ordered
                ? `${number}.`
                : "•";
          item.children.forEach((child, index) =>
            visit(child, depth + 1, index === 0 ? label : ""),
          );
          number++;
        }
        return;
      }
      case "blockquote":
        for (const child of node.children) visit(child, depth + 1, "│");
        return;
      case "table":
        blocks.push({
          kind: "table",
          level: 0,
          depth,
          marker,
          language: "",
          runs: [],
          rows: node.children.map((row) => row.children.map((cell) => inline(cell))),
        });
        return;
      case "code":
        blocks.push({
          kind: "code",
          level: 0,
          depth,
          marker,
          language: node.lang ?? "",
          runs: highlightCode(node.value ?? "", node.lang ?? ""),
        });
        return;
      default:
        blocks.push({
          kind: node.type,
          level: node.depth ?? 0,
          depth,
          marker,
          language: node.lang ?? "",
          runs: inline(node),
          rows: [],
        });
    }
  };
  visit(document);
  return JSON.stringify(blocks);
}

// A small keyword / string / comment / number tokenizer for fenced code. Android colors fences
// natively with a grammar engine (EnrichedMarkdownText.tsx, lib/highlights.ts); this covers the
// common tokens of its NATIVE_HIGHLIGHT_FENCES languages and uses the same GitHub palette.
const KEYWORDS = new Set(
  (
    "abstract as async await break case catch class const continue def default defer del do " +
    "elif else enum export extends false final finally fn for from func function go if impl " +
    "implements import in instanceof interface is lambda let loop match mod mut new nil none " +
    "not null of or package pass private protected pub public raise readonly return self " +
    "static struct super switch then this throw true try type typeof undefined use var void " +
    "while with yield fi done esac echo local True False None"
  ).split(" "),
);
const HASH_COMMENT =
  /^(bash|sh|zsh|shell|console|py|python|rb|ruby|yaml|yml|toml|make|makefile|dockerfile|r|perl|ini|conf)$/i;
const plain = { bold: false, italic: false, strike: false, code: true, href: "" };
export function highlightCode(code, language) {
  const hash = HASH_COMMENT.test(language);
  const pattern = new RegExp(
    [
      String.raw`\/\*[\s\S]*?(?:\*\/|$)`,
      String.raw`\/\/[^\n]*`,
      String.raw`<!--[\s\S]*?(?:-->|$)`,
      ...(hash ? [String.raw`#[^\n]*`] : []),
      String.raw`"(?:[^"\\\n]|\\.)*"?`,
      String.raw`'(?:[^'\\\n]|\\.)*'?`,
      "`(?:[^`\\\\]|\\\\.)*`?",
      String.raw`\b\d[\d_]*(?:\.\d+)?\b`,
      String.raw`[A-Za-z_$][\w$]*`,
    ].join("|"),
    "g",
  );
  const runs = [];
  let last = 0;
  const push = (text, color) => {
    if (!text) return;
    const previous = runs[runs.length - 1];
    if (previous && previous.color === color) previous.text += text;
    else runs.push({ ...plain, text, color });
  };
  for (const match of code.matchAll(pattern)) {
    const token = match[0];
    push(code.slice(last, match.index), "");
    const first = token[0];
    const color =
      token.startsWith("//") || token.startsWith("/*") || token.startsWith("<!--") || first === "#"
        ? "comment"
        : first === '"' || first === "'" || first === "`"
          ? "string"
          : /\d/.test(first)
            ? "number"
            : KEYWORDS.has(token)
              ? "keyword"
              : "";
    push(token, color);
    last = match.index + token.length;
  }
  push(code.slice(last), "");
  return runs;
}
