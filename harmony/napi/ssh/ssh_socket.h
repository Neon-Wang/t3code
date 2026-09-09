#pragma once
#include "ssh_session.h"
#include <netdb.h>
#include <poll.h>

namespace t3ssh {
inline int ConnectTcp(const std::string& host, int port) {
  addrinfo hints{};
  hints.ai_family = AF_UNSPEC;
  hints.ai_socktype = SOCK_STREAM;
  addrinfo* results = nullptr;
  if (getaddrinfo(host.c_str(), std::to_string(port).c_str(), &hints, &results)) return -1;
  const auto deadline = Session::Clock::now() + std::chrono::seconds(10);
  int fd = -1;
  for (auto* candidate = results; candidate; candidate = candidate->ai_next) {
    fd = socket(candidate->ai_family, candidate->ai_socktype, candidate->ai_protocol);
    if (fd < 0) continue;
    if (!Nonblocking(fd)) { CloseSocket(fd); continue; }
    if (connect(fd, candidate->ai_addr, candidate->ai_addrlen) == 0) break;
    if (errno == EINPROGRESS) {
      pollfd pending{fd, POLLOUT, 0};
      for (;;) {
        const auto remaining = std::chrono::duration_cast<std::chrono::milliseconds>(deadline - Session::Clock::now()).count();
        if (remaining <= 0) break;
        const int ready = poll(&pending, 1, static_cast<int>(remaining));
        if (ready < 0 && errno == EINTR) continue;
        if (ready > 0) {
          int error = 0; socklen_t length = sizeof(error);
          if (getsockopt(fd, SOL_SOCKET, SO_ERROR, &error, &length) == 0 && error == 0) {
            freeaddrinfo(results); return fd;
          }
        }
        break;
      }
    }
    CloseSocket(fd);
    if (Session::Clock::now() >= deadline) break;
  }
  freeaddrinfo(results);
  return fd;
}
} // namespace t3ssh
