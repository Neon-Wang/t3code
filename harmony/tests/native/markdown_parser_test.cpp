#include "core/MD4CParser.hpp"
#include <cassert>
#include <iostream>
using namespace NitroMarkdown;
size_t count(const std::shared_ptr<MarkdownNode>& node, NodeType type) {
  size_t result = node->type == type ? 1 : 0;
  for (const auto& child : node->children) result += count(child, type);
  return result;
}
std::string content(const std::shared_ptr<MarkdownNode>& node) {
  std::string result = node->content.value_or("");
  for (const auto& child : node->children) result += content(child);
  return result;
}
int main() {
  MD4CParser parser;
  auto document = parser.parse("# 标题\n\n**bold** and *italic* and `x<y` [link](https://example.com)\n\n- [x] done\n- [ ] pending\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```cpp\nconst char* x = \"你好\";\n```\n", {});
  assert(count(document, NodeType::Heading) == 1);
  assert(count(document, NodeType::Bold) == 1);
  assert(count(document, NodeType::Italic) == 1);
  assert(count(document, NodeType::CodeInline) == 1);
  assert(count(document, NodeType::Link) == 1);
  assert(count(document, NodeType::TaskListItem) == 2);
  assert(count(document, NodeType::Table) == 1);
  assert(count(document, NodeType::TableCell) == 4);
  assert(count(document, NodeType::CodeBlock) == 1);
  assert(document->children.back()->language == "cpp");
  assert(content(document->children.back()) == "const char* x = \"你好\";\n");
  for (const auto& text : {"", "**streaming", "```ts\nconst value = 1", "[open](https://exam"}) {
    assert(parser.parse(text, {})->type == NodeType::Document);
  }
  std::cout << "Markdown grammar and incomplete streaming input passed\n";
}
