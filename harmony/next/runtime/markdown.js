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
        node.children.forEach((row, index) => {
          blocks.push({
            kind: "table",
            level: 0,
            depth,
            marker,
            language: "",
            runs: row.children.flatMap((cell, column) => [
              ...(column
                ? [
                    {
                      text: "   │   ",
                      bold: false,
                      italic: false,
                      strike: false,
                      code: false,
                      href: "",
                    },
                  ]
                : []),
              ...inline(cell, {
                bold: index === 0,
                italic: false,
                strike: false,
                code: false,
                href: "",
              }),
            ]),
          });
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
        });
    }
  };
  visit(document);
  return JSON.stringify(blocks);
}
