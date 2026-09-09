#pragma once
#include <libssh2.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <unistd.h>
#include <fcntl.h>
#include <cerrno>
#include <chrono>
#include <cstring>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>

namespace t3ssh {
inline bool Nonblocking(int fd) {
  const int flags = fcntl(fd, F_GETFL, 0);
  return flags >= 0 && fcntl(fd, F_SETFL, flags | O_NONBLOCK) == 0;
}
inline bool WouldBlock() { return errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR; }
inline void CloseSocket(int& fd) {
  if (fd >= 0) { shutdown(fd, SHUT_RDWR); close(fd); fd = -1; }
}
struct Forward { int listen_fd; uint16_t remote_port; };
struct Client {
  int fd;
  LIBSSH2_CHANNEL* channel;
  std::string to_remote, to_local;
  bool local_eof = false, eof_sent = false, remote_eof = false, closing = false;
};

// Every method is called by the same Worker. No libssh2 handle is shared
// concurrently, and local sockets never block that owner.
struct Session {
  using Clock = std::chrono::steady_clock;
  LIBSSH2_SESSION* session = nullptr;
  int socket_fd = -1;
  bool running = false;
  std::map<uint64_t, Forward> forwards;
  std::vector<Client> clients;
  uint64_t next_forward_id = 1;
  int pending_fd = -1;
  uint16_t pending_port = 0;
  Clock::time_point pending_since, keepalive_at = Clock::now();

  ~Session() { Close(); }
  void Close() {
    running = false;
    for (auto& item : forwards) CloseSocket(item.second.listen_fd);
    forwards.clear();
    CloseSocket(pending_fd);
    for (auto& client : clients) CloseSocket(client.fd);
    // Closing the transport first makes cleanup independent of peer replies.
    if (socket_fd >= 0) shutdown(socket_fd, SHUT_RDWR);
    if (session) {
      libssh2_session_set_blocking(session, 1);
      libssh2_session_set_timeout(session, 1000);
      libssh2_session_free(session); // Also frees all remaining channels.
      session = nullptr;
    }
    clients.clear();
    CloseSocket(socket_fd);
  }
  uint64_t OpenForward(int local_port, int remote_port) {
    if (!running) throw std::runtime_error("SSH not connected");
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    address.sin_port = htons(static_cast<uint16_t>(local_port));
    if (fd < 0 || !Nonblocking(fd) || bind(fd, reinterpret_cast<sockaddr*>(&address), sizeof(address)) || listen(fd, 8)) {
      CloseSocket(fd); throw std::runtime_error("SSH local bind failed");
    }
    const auto id = next_forward_id++;
    forwards.emplace(id, Forward{fd, static_cast<uint16_t>(remote_port)});
    return id;
  }
  bool Pump() {
    if (!running) return false;
    // libssh2 keeps an in-progress channel-open operation in the session. Only
    // one such operation may be retried at a time, with the same target port.
    if (pending_fd < 0 && clients.size() < 32) {
      for (auto& item : forwards) {
        int fd = accept(item.second.listen_fd, nullptr, nullptr);
        if (fd < 0) continue;
        if (!Nonblocking(fd)) { CloseSocket(fd); continue; }
        pending_fd = fd;
        pending_port = item.second.remote_port;
        pending_since = Clock::now();
        break;
      }
    }
    if (pending_fd >= 0) {
      auto* channel = libssh2_channel_direct_tcpip(session, "127.0.0.1", pending_port);
      if (channel) {
        clients.push_back(Client{pending_fd, channel, {}, {}});
        pending_fd = -1;
      } else if (libssh2_session_last_errno(session) != LIBSSH2_ERROR_EAGAIN) {
        CloseSocket(pending_fd);
      } else if (Clock::now() - pending_since > std::chrono::seconds(10)) {
        Close(); return false;
      }
    }
    for (auto it = clients.begin(); it != clients.end();) {
      auto& client = *it;
      char buffer[16384];
      if (!client.closing && !client.local_eof && client.to_remote.empty()) {
        const auto count = recv(client.fd, buffer, sizeof(buffer), 0);
        if (count > 0) client.to_remote.assign(buffer, static_cast<size_t>(count));
        else if (count == 0) client.local_eof = true;
        else if (!WouldBlock()) client.closing = true;
      }
      if (!client.closing && !client.to_remote.empty()) {
        const auto count = libssh2_channel_write(client.channel, client.to_remote.data(), client.to_remote.size());
        if (count > 0) client.to_remote.erase(0, static_cast<size_t>(count));
        else if (count < 0 && count != LIBSSH2_ERROR_EAGAIN) client.closing = true;
      }
      if (!client.closing && client.local_eof && client.to_remote.empty() && !client.eof_sent) {
        const int code = libssh2_channel_send_eof(client.channel);
        if (code == 0) client.eof_sent = true;
        else if (code != LIBSSH2_ERROR_EAGAIN) client.closing = true;
      }
      if (!client.closing && !client.remote_eof && client.to_local.empty()) {
        const auto count = libssh2_channel_read(client.channel, buffer, sizeof(buffer));
        if (count > 0) client.to_local.assign(buffer, static_cast<size_t>(count));
        else if (count < 0 && count != LIBSSH2_ERROR_EAGAIN) client.closing = true;
        if (count <= 0 && libssh2_channel_eof(client.channel)) client.remote_eof = true;
      }
      if (!client.closing && !client.to_local.empty()) {
#ifdef MSG_NOSIGNAL
        const int flags = MSG_NOSIGNAL;
#else
        const int flags = 0;
#endif
        const auto count = send(client.fd, client.to_local.data(), client.to_local.size(), flags);
        if (count > 0) client.to_local.erase(0, static_cast<size_t>(count));
        else if (count < 0 && !WouldBlock()) client.closing = true;
      }
      if (client.remote_eof && client.to_local.empty()) {
        shutdown(client.fd, SHUT_WR);
        if (client.eof_sent) client.closing = true;
      }
      if (client.closing) {
        CloseSocket(client.fd);
        if (libssh2_channel_free(client.channel) != LIBSSH2_ERROR_EAGAIN) {
          it = clients.erase(it); continue;
        }
      }
      ++it;
    }
    if (Clock::now() >= keepalive_at) {
      int next = 0;
      const int code = libssh2_keepalive_send(session, &next);
      if (code != 0 && code != LIBSSH2_ERROR_EAGAIN) { Close(); return false; }
      keepalive_at = Clock::now() + std::chrono::seconds(code == LIBSSH2_ERROR_EAGAIN ? 1 : 15);
    }
    return running;
  }
};
} // namespace t3ssh
