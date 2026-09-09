// T3 Swift bridge — generic NAPI boundary.
//
// One module, zero per-module glue: every vendored upstream module's surface
// (props/events/async functions/constants) travels through the same calls.
// The ArkTS side pairs this with SwiftFrame.ets, which replays the display
// list produced by the Swift drawing code.
//
// The C ABI this binds is declared in harmony/swift/Sources/T3CABI.

#include <node_api.h>
#include <cstdlib>
#include <cstring>
#include <string>

namespace {

// C ABI (see T3CABI.swift)
extern "C" {
typedef void (*t3_event_sink_t)(const char*, const char*, const char*);
const char* t3_initialize();
const char* t3_module_names_json();
char* t3_constants_json(const char* module_name);
char* t3_create_view(const char* module_name);
bool t3_set_prop(const char* instance, const char* name, const char* value_json);
char* t3_call_async(const char* module, const char* function, const char* instance,
                    const char* arguments_json);
char* t3_call_sync_json(const char* module, const char* function, const char* arguments_json);
char* t3_display_list_json(const char* instance);
void t3_set_frame(const char* instance, double width, double height, double scale);
void t3_set_scroll_offset(const char* instance, double x, double y);
void t3_touch(const char* instance, int phase, double x, double y);
void t3_tick(double timestamp);
void t3_pump_main_queue(double seconds);
void t3_destroy_view(const char* instance);
void t3_free_string(char* pointer);
void t3_set_event_sink(t3_event_sink_t sink);
}

napi_env g_env = nullptr;
napi_ref g_event_callback = nullptr;

void DispatchEvent(const char* instance, const char* name, const char* payload_json) {
  if (g_env == nullptr || g_event_callback == nullptr) return;
  napi_handle_scope scope;
  napi_open_handle_scope(g_env, &scope);
  napi_value callback;
  napi_get_reference_value(g_env, g_event_callback, &callback);
  napi_value argv[3];
  napi_create_string_utf8(g_env, instance, NAPI_AUTO_LENGTH, &argv[0]);
  napi_create_string_utf8(g_env, name, NAPI_AUTO_LENGTH, &argv[1]);
  napi_create_string_utf8(g_env, payload_json, NAPI_AUTO_LENGTH, &argv[2]);
  napi_value global;
  napi_get_global(g_env, &global);
  napi_value result;
  napi_call_function(g_env, global, callback, 3, argv, &result);
  napi_close_handle_scope(g_env, scope);
}

napi_value Initialize(napi_env env, napi_callback_info /*info*/) {
  g_env = env;
  const char* names = t3_initialize();
  napi_value out;
  napi_create_string_utf8(env, names, NAPI_AUTO_LENGTH, &out);
  return out;
}

napi_value Constants(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  char module_name[256];
  size_t length = 0;
  napi_get_value_string_utf8(env, argv[0], module_name, sizeof(module_name), &length);
  char* json = t3_constants_json(module_name);
  napi_value out;
  if (json == nullptr) {
    napi_get_null(env, &out);
    return out;
  }
  napi_create_string_utf8(env, json, NAPI_AUTO_LENGTH, &out);
  t3_free_string(json);
  return out;
}

napi_value CreateView(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  char module_name[256];
  napi_get_value_string_utf8(env, argv[0], module_name, sizeof(module_name), nullptr);
  char* id = t3_create_view(module_name);
  napi_value out;
  if (id == nullptr) {
    napi_get_null(env, &out);
    return out;
  }
  napi_create_string_utf8(env, id, NAPI_AUTO_LENGTH, &out);
  t3_free_string(id);
  return out;
}

napi_value SetProp(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  char instance[64];
  char name[128];
  napi_get_value_string_utf8(env, argv[0], instance, sizeof(instance), nullptr);
  napi_get_value_string_utf8(env, argv[1], name, sizeof(name), nullptr);
  // Use the runtime serializer: quoted JSON-valued props must remain strings
  // across the C ABI, including embedded quotes, backslashes and control bytes.
  napi_value global, json_object, stringify, encoded;
  if (napi_get_global(env, &global) != napi_ok ||
      napi_get_named_property(env, global, "JSON", &json_object) != napi_ok ||
      napi_get_named_property(env, json_object, "stringify", &stringify) != napi_ok ||
      napi_call_function(env, json_object, stringify, 1, &argv[2], &encoded) != napi_ok) {
    return nullptr;
  }
  size_t length = 0;
  if (napi_get_value_string_utf8(env, encoded, nullptr, 0, &length) != napi_ok) return nullptr;
  std::string json(length + 1, '\0');
  if (napi_get_value_string_utf8(env, encoded, json.data(), json.size(), &length) != napi_ok) return nullptr;
  json.resize(length);
  napi_value out;
  napi_get_boolean(env, t3_set_prop(instance, name, json.c_str()), &out);
  return out;
}

napi_value CallAsync(napi_env env, napi_callback_info info) {
  size_t argc = 4;
  napi_value argv[4];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  char module[128];
  char function[128];
  char instance[64];
  napi_get_value_string_utf8(env, argv[0], module, sizeof(module), nullptr);
  napi_get_value_string_utf8(env, argv[1], function, sizeof(function), nullptr);
  napi_valuetype instance_type;
  napi_typeof(env, argv[2], &instance_type);
  const char* instance_pointer = nullptr;
  if (instance_type == napi_string) {
    napi_get_value_string_utf8(env, argv[2], instance, sizeof(instance), nullptr);
    instance_pointer = instance;
  }
  // Arguments arrive as a JSON array string.
  size_t length = 0;
  napi_get_value_string_utf8(env, argv[3], nullptr, 0, &length);
  std::string arguments(length, '\0');
  napi_get_value_string_utf8(env, argv[3], arguments.data(), length + 1, &length);
  char* json = t3_call_async(module, function, instance_pointer, arguments.c_str());
  napi_value out;
  if (json == nullptr) {
    napi_get_null(env, &out);
    return out;
  }
  napi_create_string_utf8(env, json, NAPI_AUTO_LENGTH, &out);
  t3_free_string(json);
  return out;
}

napi_value DisplayList(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  char instance[64];
  napi_get_value_string_utf8(env, argv[0], instance, sizeof(instance), nullptr);
  char* json = t3_display_list_json(instance);
  napi_value out;
  if (json == nullptr) {
    napi_get_null(env, &out);
    return out;
  }
  napi_create_string_utf8(env, json, NAPI_AUTO_LENGTH, &out);
  t3_free_string(json);
  return out;
}

napi_value SetFrame(napi_env env, napi_callback_info info) {
  size_t argc = 4;
  napi_value argv[4];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  char instance[64];
  double width = 0, height = 0, scale = 1;
  napi_get_value_string_utf8(env, argv[0], instance, sizeof(instance), nullptr);
  napi_get_value_double(env, argv[1], &width);
  napi_get_value_double(env, argv[2], &height);
  napi_get_value_double(env, argv[3], &scale);
  t3_set_frame(instance, width, height, scale);
  return nullptr;
}

napi_value SetScrollOffset(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  char instance[64];
  double x = 0, y = 0;
  napi_get_value_string_utf8(env, argv[0], instance, sizeof(instance), nullptr);
  napi_get_value_double(env, argv[1], &x);
  napi_get_value_double(env, argv[2], &y);
  t3_set_scroll_offset(instance, x, y);
  return nullptr;
}

napi_value Touch(napi_env env, napi_callback_info info) {
  size_t argc = 4;
  napi_value argv[4];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  char instance[64];
  double x = 0, y = 0;
  int32_t phase = 0;
  napi_get_value_string_utf8(env, argv[0], instance, sizeof(instance), nullptr);
  napi_get_value_int32(env, argv[1], &phase);
  napi_get_value_double(env, argv[2], &x);
  napi_get_value_double(env, argv[3], &y);
  t3_touch(instance, phase, x, y);
  return nullptr;
}

napi_value Tick(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  double timestamp = 0;
  napi_get_value_double(env, argv[0], &timestamp);
  t3_tick(timestamp);
  return nullptr;
}

napi_value PumpMainQueue(napi_env env, napi_callback_info info) {
  (void)env;
  (void)info;
  t3_pump_main_queue(0.05);
  return nullptr;
}

napi_value DestroyView(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  char instance[64];
  napi_get_value_string_utf8(env, argv[0], instance, sizeof(instance), nullptr);
  t3_destroy_view(instance);
  return nullptr;
}

napi_value SetEventSink(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc >= 1) {
    napi_create_reference(env, argv[0], 1, &g_event_callback);
    t3_set_event_sink(&DispatchEvent);
  }
  return nullptr;
}

napi_value CallSync(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  char module[128];
  char function[128];
  napi_get_value_string_utf8(env, argv[0], module, sizeof(module), nullptr);
  napi_get_value_string_utf8(env, argv[1], function, sizeof(function), nullptr);
  size_t length = 0;
  napi_get_value_string_utf8(env, argv[2], nullptr, 0, &length);
  std::string arguments(length, '\0');
  napi_get_value_string_utf8(env, argv[2], arguments.data(), length + 1, &length);
  char* json = t3_call_sync_json(module, function, arguments.c_str());
  napi_value out;
  if (json == nullptr) {
    napi_get_null(env, &out);
    return out;
  }
  napi_create_string_utf8(env, json, NAPI_AUTO_LENGTH, &out);
  t3_free_string(json);
  return out;
}

napi_value Init(napi_env env, napi_value exports) {
  const napi_property_descriptor descriptors[] = {
    {"initialize", nullptr, Initialize, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"constants", nullptr, Constants, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"createView", nullptr, CreateView, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"setProp", nullptr, SetProp, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"callAsync", nullptr, CallAsync, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"callSync", nullptr, CallSync, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"displayList", nullptr, DisplayList, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"setFrame", nullptr, SetFrame, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"setScrollOffset", nullptr, SetScrollOffset, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"touch", nullptr, Touch, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"tick", nullptr, Tick, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"pumpMainQueue", nullptr, PumpMainQueue, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"destroyView", nullptr, DestroyView, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"setEventSink", nullptr, SetEventSink, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(
    env, exports, sizeof(descriptors) / sizeof(descriptors[0]), descriptors);
  return exports;
}

}  // namespace

NAPI_MODULE(t3bridge, Init)
