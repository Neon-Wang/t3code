#include "ssh_command.h"
#include <cassert>
#include <iostream>
static bool fail_read=false;static int freed=0,blocking=-1,eofs=0;
static std::string input,output="command output";
extern "C" void libssh2_session_set_blocking(LIBSSH2_SESSION*,int value){blocking=value;}
extern "C" LIBSSH2_CHANNEL* libssh2_channel_open_ex(LIBSSH2_SESSION*,const char*,unsigned int,unsigned int,unsigned int,const char*,unsigned int){return reinterpret_cast<LIBSSH2_CHANNEL*>(1);}
extern "C" int libssh2_channel_process_startup(LIBSSH2_CHANNEL*,const char*,unsigned int,const char*,unsigned int){return 0;}
extern "C" int libssh2_channel_handle_extended_data2(LIBSSH2_CHANNEL*,int){return 0;}
extern "C" ssize_t libssh2_channel_write_ex(LIBSSH2_CHANNEL*,int,const char* data,size_t size){size=std::min(size,size_t(2));input.append(data,size);return size;}
extern "C" int libssh2_channel_send_eof(LIBSSH2_CHANNEL*){++eofs;return 0;}
extern "C" ssize_t libssh2_channel_read_ex(LIBSSH2_CHANNEL*,int,char* data,size_t size){
 if(fail_read)return LIBSSH2_ERROR_SOCKET_RECV;
 size=std::min(size,output.size());memcpy(data,output.data(),size);output.erase(0,size);return size;
}
extern "C" int libssh2_channel_close(LIBSSH2_CHANNEL*){return 0;}
extern "C" int libssh2_channel_wait_closed(LIBSSH2_CHANNEL*){return 0;}
extern "C" int libssh2_channel_get_exit_status(LIBSSH2_CHANNEL*){return 7;}
extern "C" int libssh2_channel_free(LIBSSH2_CHANNEL*){++freed;return 0;}
int main(){
 auto result=t3ssh::Exec(nullptr,"test-command","abcdef");
 assert(result.exit_code==7&&result.output=="command output");
 assert(input=="abcdef"&&eofs==1&&freed==1&&blocking==0);
 fail_read=true;bool rejected=false;
 try{t3ssh::Exec(nullptr,"test-command","");}catch(const std::runtime_error&){rejected=true;}
 assert(rejected&&eofs==2&&freed==2&&blocking==0);
 std::cout<<"exec preserves partial input, EOF, exit status and read failures; cleanup restores nonblocking mode\n";
}
