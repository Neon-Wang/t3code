#include <node_api.h>
#include "core/MD4CParser.hpp"
#include <exception>
#include <string>

namespace {
void text(napi_env env, napi_value object, const char* key, const std::string& value) {
  napi_value result;
  napi_create_string_utf8(env, value.data(), value.size(), &result);
  napi_set_named_property(env, object, key, result);
}
void number(napi_env env, napi_value object, const char* key, int value) {
  napi_value result;
  napi_create_int32(env, value, &result);
  napi_set_named_property(env, object, key, result);
}
void boolean(napi_env env, napi_value object, const char* key, bool value) {
  napi_value result;
  napi_get_boolean(env, value, &result);
  napi_set_named_property(env, object, key, result);
}
napi_value node(napi_env env, const std::shared_ptr<NitroMarkdown::MarkdownNode>& input) {
  napi_value result, children;
  napi_create_object(env, &result);
  text(env, result, "type", NitroMarkdown::nodeTypeToString(input->type));
  if (input->content) text(env, result, "content", *input->content);
  if (input->level) number(env, result, "level", *input->level);
  if (input->href) text(env, result, "href", *input->href);
  if (input->title) text(env, result, "title", *input->title);
  if (input->alt) text(env, result, "alt", *input->alt);
  if (input->language) text(env, result, "language", *input->language);
  if (input->ordered) boolean(env, result, "ordered", *input->ordered);
  if (input->start) number(env, result, "start", *input->start);
  if (input->checked) boolean(env, result, "checked", *input->checked);
  if (input->isHeader) boolean(env, result, "isHeader", *input->isHeader);
  if (input->align) text(env, result, "align", NitroMarkdown::textAlignToString(*input->align));
  napi_create_array_with_length(env, input->children.size(), &children);
  for (size_t i = 0; i < input->children.size(); ++i)
    napi_set_element(env, children, i, node(env, input->children[i]));
  napi_set_named_property(env, result, "children", children);
  return result;
}
napi_value parse(napi_env env, napi_callback_info info) {
  size_t argc = 1, length = 0;
  napi_value value;
  napi_get_cb_info(env, info, &argc, &value, nullptr, nullptr);
  if (argc != 1 || napi_get_value_string_utf8(env, value, nullptr, 0, &length) != napi_ok) {
    napi_throw_type_error(env, nullptr, "Markdown input must be a string");
    return nullptr;
  }
  try {
    std::string input(length + 1, '\0');
    napi_get_value_string_utf8(env, value, input.data(), input.size(), &length);
    input.resize(length);
    NitroMarkdown::MD4CParser parser;
    return node(env, parser.parse(input, {}));
  } catch (const std::exception& error) {
    napi_throw_error(env, nullptr, error.what());
    return nullptr;
  }
}
napi_value init(napi_env env, napi_value exports) {
  const napi_property_descriptor descriptor = {"parse", nullptr, parse, nullptr, nullptr, nullptr, napi_default, nullptr};
  napi_define_properties(env, exports, 1, &descriptor);
  return exports;
}
}
NAPI_MODULE(t3markdown, init)
