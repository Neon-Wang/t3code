#include "ssh_socket.h"
#include <cassert>
#include <iostream>
int main() {
  int listener=socket(AF_INET,SOCK_STREAM,0);
  sockaddr_in address{};address.sin_family=AF_INET;address.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
  assert(bind(listener,reinterpret_cast<sockaddr*>(&address),sizeof(address))==0);
  assert(listen(listener,1)==0);
  socklen_t length=sizeof(address);
  assert(getsockname(listener,reinterpret_cast<sockaddr*>(&address),&length)==0);
  int fd=t3ssh::ConnectTcp("127.0.0.1",ntohs(address.sin_port));
  assert(fd>=0);assert(fcntl(fd,F_GETFL,0)&O_NONBLOCK);
  int accepted=accept(listener,nullptr,nullptr);assert(accepted>=0);
  close(accepted);t3ssh::CloseSocket(fd);close(listener);
  assert(t3ssh::ConnectTcp("127.0.0.1",ntohs(address.sin_port))==-1);
  std::cout<<"TCP connects nonblocking and reports refused connections\n";
}
