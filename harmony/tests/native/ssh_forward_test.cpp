#include "ssh_session.h"
#include <cassert>
#include <iostream>

static std::string incoming, written;
static bool remote_eof=false;
static int writes=0, freed=0, sessions_freed=0;
extern "C" ssize_t libssh2_channel_write_ex(LIBSSH2_CHANNEL*,int,const char* data,size_t size) {
  if (++writes==1) return LIBSSH2_ERROR_EAGAIN;
  size=std::min(size,size_t(2));written.append(data,size);return size;
}
extern "C" ssize_t libssh2_channel_read_ex(LIBSSH2_CHANNEL*,int,char* data,size_t size) {
  if(incoming.empty()) return LIBSSH2_ERROR_EAGAIN;
  size=std::min(size,incoming.size());memcpy(data,incoming.data(),size);incoming.erase(0,size);return size;
}
extern "C" int libssh2_channel_eof(LIBSSH2_CHANNEL*) {return remote_eof;}
extern "C" int libssh2_channel_send_eof(LIBSSH2_CHANNEL*) {return 0;}
extern "C" int libssh2_channel_free(LIBSSH2_CHANNEL*) {++freed;return 0;}
extern "C" int libssh2_keepalive_send(LIBSSH2_SESSION*,int*) {return 0;}
extern "C" void libssh2_session_set_blocking(LIBSSH2_SESSION*,int) {}
extern "C" void libssh2_session_set_timeout(LIBSSH2_SESSION*,long) {}
extern "C" int libssh2_session_free(LIBSSH2_SESSION*) {++sessions_freed;return 0;}
extern "C" int libssh2_session_last_errno(LIBSSH2_SESSION*) {return LIBSSH2_ERROR_EAGAIN;}
extern "C" LIBSSH2_CHANNEL* libssh2_channel_direct_tcpip_ex(LIBSSH2_SESSION*,const char*,int,const char*,int) {return nullptr;}
int main() {
  int sockets[2];assert(socketpair(AF_UNIX,SOCK_STREAM,0,sockets)==0);
  t3ssh::Nonblocking(sockets[0]);t3ssh::Nonblocking(sockets[1]);
  t3ssh::Session session;
  session.session=reinterpret_cast<LIBSSH2_SESSION*>(1);session.running=true;
  session.clients.push_back({sockets[0],reinterpret_cast<LIBSSH2_CHANNEL*>(1),{}, {}});
  assert(send(sockets[1],"abcdef",6,0)==6);
  incoming="reply";
  session.Pump(); // First write would block; bytes must remain queued.
  assert(written.empty());
  for(int i=0;i<4;++i)session.Pump();
  assert(written=="abcdef");
  char result[16];auto count=recv(sockets[1],result,sizeof(result),0);
  assert(std::string(result,count)=="reply");
  shutdown(sockets[1],SHUT_WR);remote_eof=true;
  for(int i=0;i<3;++i)session.Pump();
  assert(session.clients.empty());assert(freed==1);
  // Closing an idle client must not wait for it to send data or EOF.
  close(sockets[1]);assert(socketpair(AF_UNIX,SOCK_STREAM,0,sockets)==0);
  session.clients.push_back({sockets[0],reinterpret_cast<LIBSSH2_CHANNEL*>(2),{}, {}});
  session.Close();assert(recv(sockets[1],result,sizeof(result),0)==0);
  assert(session.clients.empty());assert(sessions_freed==1);close(sockets[1]);
  assert(!session.Pump());
  std::cout<<"partial SSH writes, backpressure, bidirectional bytes, EOF and idle close pass\n";
}
