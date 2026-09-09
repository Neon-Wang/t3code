// Ghostty's VT engine is shared with the Android client. ArkUI owns drawing.
#include <node_api.h>
#include <ghostty/vt.h>
#include <dlfcn.h>
#include <algorithm>
#include <cmath>
#include <string>
#include <vector>
#include <stdexcept>
#include <memory>

#define VT_FUNCTIONS(X) \
 X(terminal_grid_ref) X(terminal_select_word) X(terminal_select_all) X(terminal_selection_format_alloc) X(free) X(terminal_mode_get) X(paste_encode) X(terminal_get) X(terminal_scroll_viewport) X(terminal_new) X(terminal_free) X(terminal_set) X(terminal_vt_write) X(terminal_resize) \
 X(render_state_new) X(render_state_free) X(render_state_update) X(render_state_get) \
 X(render_state_colors_get) X(render_state_row_iterator_new) X(render_state_row_iterator_free) \
 X(render_state_row_iterator_next) X(render_state_row_get) X(render_state_row_cells_new) \
 X(render_state_row_cells_free) X(render_state_row_cells_next) X(render_state_row_cells_get)

struct Api {
#define DECLARE(name) decltype(&ghostty_##name) name = nullptr;
 VT_FUNCTIONS(DECLARE)
#undef DECLARE
 Api() {
   void* library = dlopen("libghostty-vt.so", RTLD_NOW | RTLD_LOCAL);
   if (!library) throw std::runtime_error("Ghostty library could not be loaded");
#define LOAD(name) name = reinterpret_cast<decltype(name)>(dlsym(library, "ghostty_" #name)); if (!name) throw std::runtime_error("Ghostty API missing: " #name);
   VT_FUNCTIONS(LOAD)
#undef LOAD
 }
};
Api& api() { static Api instance; return instance; }
void check(GhosttyResult result) { if (result != GHOSTTY_SUCCESS) throw std::runtime_error("Ghostty operation failed"); }

struct Session {
 GhosttyTerminal terminal = nullptr;
 GhosttyRenderState render = nullptr;
 GhosttyRenderStateRowIterator rows = nullptr;
 GhosttyRenderStateRowCells cells = nullptr;
 std::string responses;
 void close() {
   if (cells) api().render_state_row_cells_free(cells);
   if (rows) api().render_state_row_iterator_free(rows);
   if (render) api().render_state_free(render);
   if (terminal) api().terminal_free(terminal);
   cells=nullptr; rows=nullptr; render=nullptr; terminal=nullptr;
 }
 ~Session() { close(); }
};
void writePty(GhosttyTerminal, void* userdata, const uint8_t* bytes, size_t length) {
 static_cast<Session*>(userdata)->responses.append(reinterpret_cast<const char*>(bytes),length);
}
bool terminalSize(GhosttyTerminal terminal, void*, GhosttySizeReportSize* size) {
 uint32_t width=0,height=0;
 if (api().terminal_get(terminal,GHOSTTY_TERMINAL_DATA_COLS,&size->columns)!=GHOSTTY_SUCCESS ||
     api().terminal_get(terminal,GHOSTTY_TERMINAL_DATA_ROWS,&size->rows)!=GHOSTTY_SUCCESS ||
     api().terminal_get(terminal,GHOSTTY_TERMINAL_DATA_WIDTH_PX,&width)!=GHOSTTY_SUCCESS ||
     api().terminal_get(terminal,GHOSTTY_TERMINAL_DATA_HEIGHT_PX,&height)!=GHOSTTY_SUCCESS ||
     !size->columns || !size->rows) return false;
 size->cell_width=width/size->columns;size->cell_height=height/size->rows;
 return true;
}
void finalize(napi_env, void* data, void*) { delete static_cast<Session*>(data); }

void napiCheck(napi_status result) { if (result != napi_ok) throw std::runtime_error("Invalid terminal arguments"); }
struct Arguments {
 napi_value values[6]{};
 Arguments(napi_env env, napi_callback_info info, size_t expected) {
   size_t count=6; napiCheck(napi_get_cb_info(env,info,&count,values,nullptr,nullptr));
   if (count!=expected) throw std::runtime_error("Invalid terminal argument count");
 }
 Session* session(napi_env env) {
   void* value=nullptr; napiCheck(napi_get_value_external(env,values[0],&value));
   auto* session=static_cast<Session*>(value);
   if (!session || !session->terminal) throw std::runtime_error("Terminal has been destroyed");
   return session;
 }
 int dimension(napi_env env,size_t index,int maximum) {
   int32_t value=0;napiCheck(napi_get_value_int32(env,values[index],&value));
   if (value<1 || value>maximum) throw std::runtime_error("Invalid terminal dimensions");
   return value;
 }
};
napi_value text(napi_env env,const std::string& value) { napi_value out;napiCheck(napi_create_string_utf8(env,value.data(),value.size(),&out));return out; }
napi_value number(napi_env env,uint32_t value) { napi_value out;napiCheck(napi_create_uint32(env,value,&out));return out; }
void property(napi_env env,napi_value object,const char* key,napi_value value) { napiCheck(napi_set_named_property(env,object,key,value)); }
void numeric(napi_env env,napi_value object,const char* key,uint32_t value) { property(env,object,key,number(env,value)); }
napi_value object(napi_env env) { napi_value out;napiCheck(napi_create_object(env,&out));return out; }
napi_value empty(napi_env env) { napi_value out;napi_get_undefined(env,&out);return out; }
std::string drain(Session* session) { std::string result;result.swap(session->responses);return result; }
template<class F> napi_value guard(napi_env env,F run) {
 try { return run(); } catch(const std::exception& error) { napi_throw_error(env,nullptr,error.what());return nullptr; }
}

napi_value Create(napi_env env,napi_callback_info info) { return guard(env,[&]() {
 Arguments args(env,info,2);const int cols=args.dimension(env,0,1000),rows=args.dimension(env,1,500);
 auto* session=new Session();
 try {
   check(api().terminal_new(nullptr,&session->terminal,{static_cast<uint16_t>(cols),static_cast<uint16_t>(rows),1000}));
   check(api().render_state_new(nullptr,&session->render));
   check(api().render_state_row_iterator_new(nullptr,&session->rows));
   check(api().render_state_row_cells_new(nullptr,&session->cells));
   check(api().terminal_set(session->terminal,GHOSTTY_TERMINAL_OPT_USERDATA,session));
   check(api().terminal_set(session->terminal,GHOSTTY_TERMINAL_OPT_WRITE_PTY,reinterpret_cast<const void*>(writePty)));
   check(api().terminal_set(session->terminal,GHOSTTY_TERMINAL_OPT_SIZE,reinterpret_cast<const void*>(terminalSize)));
   napi_value out;napiCheck(napi_create_external(env,session,finalize,nullptr,&out));return out;
 } catch (...) { delete session;throw; }
 }); }
GhosttyColorRgb colorArgument(napi_env env,napi_value argument) {
 double value=0;napiCheck(napi_get_value_double(env,argument,&value));
 if (!std::isfinite(value) || value<0 || value>0xffffff || std::floor(value)!=value)
   throw std::runtime_error("Invalid terminal RGB color");
 const auto packed=static_cast<uint32_t>(value);
 return {static_cast<uint8_t>(packed>>16),static_cast<uint8_t>(packed>>8),static_cast<uint8_t>(packed)};
}
GhosttyGridRef viewportRef(napi_env env, Arguments& args, Session* session, size_t xIndex, size_t yIndex) {
 int32_t x=0,y=0;
 napiCheck(napi_get_value_int32(env,args.values[xIndex],&x));
 napiCheck(napi_get_value_int32(env,args.values[yIndex],&y));
 uint16_t cols=0,rows=0;
 check(api().terminal_get(session->terminal,GHOSTTY_TERMINAL_DATA_COLS,&cols));
 check(api().terminal_get(session->terminal,GHOSTTY_TERMINAL_DATA_ROWS,&rows));
 GhosttyPoint point{};point.tag=GHOSTTY_POINT_TAG_VIEWPORT;
 point.value.coordinate.x=std::clamp<int32_t>(x,0,cols-1);
 point.value.coordinate.y=std::clamp<int32_t>(y,0,rows-1);
 GhosttyGridRef ref{};ref.size=sizeof(ref);
 check(api().terminal_grid_ref(session->terminal,point,&ref));return ref;
}
napi_value SelectWord(napi_env env,napi_callback_info info) { return guard(env,[&]() {
 Arguments args(env,info,3);auto* session=args.session(env);
 GhosttyTerminalSelectWordOptions options{};options.size=sizeof(options);
 options.ref=viewportRef(env,args,session,1,2);
 GhosttySelection selection{};selection.size=sizeof(selection);
 check(api().terminal_select_word(session->terminal,&options,&selection));
 check(api().terminal_set(session->terminal,GHOSTTY_TERMINAL_OPT_SELECTION,&selection));return empty(env);
 }); }
napi_value SelectRange(napi_env env,napi_callback_info info) { return guard(env,[&]() {
 Arguments args(env,info,5);auto* session=args.session(env);
 GhosttySelection selection{};selection.size=sizeof(selection);
 selection.start=viewportRef(env,args,session,1,2);selection.end=viewportRef(env,args,session,3,4);
 check(api().terminal_set(session->terminal,GHOSTTY_TERMINAL_OPT_SELECTION,&selection));return empty(env);
 }); }
napi_value SelectAll(napi_env env,napi_callback_info info) { return guard(env,[&]() {
 Arguments args(env,info,1);auto* session=args.session(env);
 GhosttySelection selection{};selection.size=sizeof(selection);
 check(api().terminal_select_all(session->terminal,&selection));
 check(api().terminal_set(session->terminal,GHOSTTY_TERMINAL_OPT_SELECTION,&selection));return empty(env);
 }); }
napi_value ClearSelection(napi_env env,napi_callback_info info) { return guard(env,[&]() {
 Arguments args(env,info,1);auto* session=args.session(env);
 check(api().terminal_set(session->terminal,GHOSTTY_TERMINAL_OPT_SELECTION,nullptr));return empty(env);
 }); }
napi_value SelectionText(napi_env env,napi_callback_info info) { return guard(env,[&]() {
 Arguments args(env,info,1);auto* session=args.session(env);
 GhosttyTerminalSelectionFormatOptions options{};options.size=sizeof(options);
 options.emit=GHOSTTY_FORMATTER_FORMAT_PLAIN;options.unwrap=true;options.trim=true;
 uint8_t* bytes=nullptr;size_t length=0;
 const auto result=api().terminal_selection_format_alloc(session->terminal,nullptr,options,&bytes,&length);
 if (result==GHOSTTY_NO_VALUE) return text(env,"");
 check(result);
 auto release=[length](uint8_t* value) { api().free(nullptr,value,length); };
 std::unique_ptr<uint8_t,decltype(release)> owned(bytes,release);
 return text(env,bytes?std::string(reinterpret_cast<char*>(bytes),length):std::string());
 }); }
napi_value EncodePaste(napi_env env,napi_callback_info info) { return guard(env,[&]() {
 Arguments args(env,info,2);auto* session=args.session(env);
 size_t length=0;napiCheck(napi_get_value_string_utf8(env,args.values[1],nullptr,0,&length));
 std::vector<char> input(length+1);
 napiCheck(napi_get_value_string_utf8(env,args.values[1],input.data(),input.size(),&length));
 bool bracketed=false;
 check(api().terminal_mode_get(session->terminal,GHOSTTY_MODE_BRACKETED_PASTE,&bracketed));
 // Bracketed paste adds two six-byte delimiters; encoding never grows the body.
 std::vector<char> output(length+12);size_t written=0;
 check(api().paste_encode(input.data(),length,bracketed,output.data(),output.size(),&written));
 return text(env,std::string(output.data(),written));
 }); }
napi_value SetTheme(napi_env env,napi_callback_info info) { return guard(env,[&]() {
 Arguments args(env,info,5);auto* session=args.session(env);
 const auto fg=colorArgument(env,args.values[1]),bg=colorArgument(env,args.values[2]),cursor=colorArgument(env,args.values[3]);
 bool isArray=false;napiCheck(napi_is_array(env,args.values[4],&isArray));
 uint32_t length=0;
 if (!isArray) throw std::runtime_error("Terminal palette must contain 16 colors");
 napiCheck(napi_get_array_length(env,args.values[4],&length));
 if (length!=16) throw std::runtime_error("Terminal palette must contain 16 colors");
 GhosttyColorRgb palette[256];
 check(api().terminal_get(session->terminal,GHOSTTY_TERMINAL_DATA_COLOR_PALETTE_DEFAULT,palette));
 for(uint32_t i=0;i<length;i++) {
   napi_value value;napiCheck(napi_get_element(env,args.values[4],i,&value));
   palette[i]=colorArgument(env,value);
 }
 // Validate every input before mutation. Preserve extended colors and let
 // Ghostty keep program-provided OSC overrides above these theme defaults.
 check(api().terminal_set(session->terminal,GHOSTTY_TERMINAL_OPT_COLOR_FOREGROUND,&fg));
 check(api().terminal_set(session->terminal,GHOSTTY_TERMINAL_OPT_COLOR_BACKGROUND,&bg));
 check(api().terminal_set(session->terminal,GHOSTTY_TERMINAL_OPT_COLOR_CURSOR,&cursor));
 check(api().terminal_set(session->terminal,GHOSTTY_TERMINAL_OPT_COLOR_PALETTE,palette));
 return empty(env);
 }); }
napi_value Destroy(napi_env env,napi_callback_info info) { return guard(env,[&]() {
 Arguments args(env,info,1);args.session(env)->close();return empty(env);
 }); }
napi_value Feed(napi_env env,napi_callback_info info) { return guard(env,[&]() {
 Arguments args(env,info,2);auto* session=args.session(env);size_t length=0;
 napiCheck(napi_get_value_string_utf8(env,args.values[1],nullptr,0,&length));
 std::vector<char> bytes(length+1);napiCheck(napi_get_value_string_utf8(env,args.values[1],bytes.data(),bytes.size(),&length));
 api().terminal_vt_write(session->terminal,reinterpret_cast<const uint8_t*>(bytes.data()),length);
 return text(env,drain(session));
 }); }
napi_value Resize(napi_env env,napi_callback_info info) { return guard(env,[&]() {
 Arguments args(env,info,5);auto* session=args.session(env);
 check(api().terminal_resize(session->terminal,args.dimension(env,1,1000),args.dimension(env,2,500),
   args.dimension(env,3,65535),args.dimension(env,4,65535)));
 return text(env,drain(session));
 }); }
uint32_t rgb(GhosttyColorRgb value) { return (uint32_t(value.r)<<16)|(uint32_t(value.g)<<8)|value.b; }
void utf8(std::string& out,uint32_t cp) {
 if (cp<=0x7f) out.push_back(cp);
 else if (cp<=0x7ff) {out.push_back(0xc0|(cp>>6));out.push_back(0x80|(cp&63));}
 else if (cp<=0xffff) {out.push_back(0xe0|(cp>>12));out.push_back(0x80|((cp>>6)&63));out.push_back(0x80|(cp&63));}
 else if (cp<=0x10ffff) {out.push_back(0xf0|(cp>>18));out.push_back(0x80|((cp>>12)&63));out.push_back(0x80|((cp>>6)&63));out.push_back(0x80|(cp&63));}
}
napi_value Snapshot(napi_env env,napi_callback_info info) { return guard(env,[&]() {
 Arguments args(env,info,1);auto* session=args.session(env);check(api().render_state_update(session->render,session->terminal));
 uint16_t cols=0,rows=0,x=0,y=0;bool visible=false,viewport=false;
 check(api().render_state_get(session->render,GHOSTTY_RENDER_STATE_DATA_COLS,&cols));
 check(api().render_state_get(session->render,GHOSTTY_RENDER_STATE_DATA_ROWS,&rows));
 check(api().render_state_get(session->render,GHOSTTY_RENDER_STATE_DATA_CURSOR_VISIBLE,&visible));
 check(api().render_state_get(session->render,GHOSTTY_RENDER_STATE_DATA_CURSOR_VIEWPORT_HAS_VALUE,&viewport));
 if(viewport) {
   check(api().render_state_get(session->render,GHOSTTY_RENDER_STATE_DATA_CURSOR_VIEWPORT_X,&x));
   check(api().render_state_get(session->render,GHOSTTY_RENDER_STATE_DATA_CURSOR_VIEWPORT_Y,&y));
 }
 GhosttyRenderStateColors colors{};colors.size=sizeof(colors);check(api().render_state_colors_get(session->render,&colors));
 napi_value result=object(env);numeric(env,result,"cols",cols);numeric(env,result,"rows",rows);
 numeric(env,result,"cursorX",x);numeric(env,result,"cursorY",y);numeric(env,result,"cursorVisible",visible&&viewport);
 numeric(env,result,"background",rgb(colors.background));numeric(env,result,"cursorColor",rgb(colors.cursor_has_value?colors.cursor:colors.foreground));
 napi_value cells;napiCheck(napi_create_array(env,&cells));uint32_t index=0;
 check(api().render_state_get(session->render,GHOSTTY_RENDER_STATE_DATA_ROW_ITERATOR,&session->rows));
 for(uint16_t row=0;row<rows&&api().render_state_row_iterator_next(session->rows);row++) {
   check(api().render_state_row_get(session->rows,GHOSTTY_RENDER_STATE_ROW_DATA_CELLS,&session->cells));
   for(uint16_t col=0;col<cols&&api().render_state_row_cells_next(session->cells);col++) {
     GhosttyStyle style{};style.size=sizeof(style);GhosttyColorRgb fg=colors.foreground,bg=colors.background;
     check(api().render_state_row_cells_get(session->cells,GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_STYLE,&style));
     api().render_state_row_cells_get(session->cells,GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_FG_COLOR,&fg);
     api().render_state_row_cells_get(session->cells,GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_BG_COLOR,&bg);
     if(style.inverse) std::swap(fg,bg);
     uint32_t count=0;check(api().render_state_row_cells_get(session->cells,GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_GRAPHEMES_LEN,&count));
     std::string content;
     if(count&&!style.invisible) {
       std::vector<uint32_t> points(count);check(api().render_state_row_cells_get(session->cells,GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_GRAPHEMES_BUF,points.data()));
       for(auto cp:points) utf8(content,cp);
     }
     bool selected=false;check(api().render_state_row_cells_get(session->cells,GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_SELECTED,&selected));
     napi_value cell=object(env);numeric(env,cell,"x",col);numeric(env,cell,"y",row);
     numeric(env,cell,"foreground",rgb(fg));numeric(env,cell,"background",rgb(bg));
     numeric(env,cell,"flags",(style.bold?1:0)|(style.italic?2:0)|(style.underline?4:0)|(style.strikethrough?8:0)|(style.faint?16:0)|(selected?32:0));
     property(env,cell,"text",text(env,content));napiCheck(napi_set_element(env,cells,index++,cell));
   }
 }
 property(env,result,"cells",cells);return result;
 }); }
napi_value Scroll(napi_env env,napi_callback_info info) { return guard(env,[&]() {
 Arguments args(env,info,2);auto* session=args.session(env);int32_t rows=0;
 napiCheck(napi_get_value_int32(env,args.values[1],&rows));
 GhosttyTerminalScrollViewport scroll{};scroll.tag=GHOSTTY_SCROLL_VIEWPORT_DELTA;
 scroll.value.delta=std::clamp(rows,-1000,1000);
 api().terminal_scroll_viewport(session->terminal,scroll);return empty(env);
 }); }
napi_value Bottom(napi_env env,napi_callback_info info) { return guard(env,[&]() {
 Arguments args(env,info,1);auto* session=args.session(env);
 GhosttyTerminalScrollViewport scroll{};scroll.tag=GHOSTTY_SCROLL_VIEWPORT_BOTTOM;
 api().terminal_scroll_viewport(session->terminal,scroll);return empty(env);
 }); }
napi_value Init(napi_env env,napi_value exports) {
 const napi_property_descriptor descriptors[]={
 {"selectWord",nullptr,SelectWord,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"selectRange",nullptr,SelectRange,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"selectAll",nullptr,SelectAll,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"clearSelection",nullptr,ClearSelection,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"selectionText",nullptr,SelectionText,nullptr,nullptr,nullptr,napi_default,nullptr},

 {"encodePaste",nullptr,EncodePaste,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"setTheme",nullptr,SetTheme,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"scroll",nullptr,Scroll,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"scrollToBottom",nullptr,Bottom,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"create",nullptr,Create,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"destroy",nullptr,Destroy,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"feed",nullptr,Feed,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"resize",nullptr,Resize,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"snapshot",nullptr,Snapshot,nullptr,nullptr,nullptr,napi_default,nullptr}};
 napi_define_properties(env,exports,sizeof(descriptors)/sizeof(descriptors[0]),descriptors);return exports;
}
NAPI_MODULE(t3terminal,Init)
