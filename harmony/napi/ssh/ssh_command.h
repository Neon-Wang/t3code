#pragma once
#include <libssh2.h>
#include <chrono>
#include <cstring>
#include <stdexcept>
#include <string>

namespace t3ssh {
struct CommandResult { std::string output; int exit_code; };
inline CommandResult Exec(LIBSSH2_SESSION* session, const std::string& command, const std::string& input) {
  struct CommandScope {
    LIBSSH2_SESSION* session;
    LIBSSH2_CHANNEL* channel = nullptr;
    explicit CommandScope(LIBSSH2_SESSION* value) : session(value) { libssh2_session_set_blocking(session, 1); }
    ~CommandScope() {
      if (channel) libssh2_channel_free(channel);
      libssh2_session_set_blocking(session, 0);
    }
  } scope(session);
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(30);
  auto check_time = [&] {
    if (std::chrono::steady_clock::now() >= deadline) throw std::runtime_error("SSH command timeout");
  };
  auto* channel = scope.channel = libssh2_channel_open_session(session);
  if (!channel) throw std::runtime_error("SSH command channel open failed");
  // Drain both remote streams; launch/pairing results remain the last JSON line.
  if (libssh2_channel_handle_extended_data2(channel, LIBSSH2_CHANNEL_EXTENDED_DATA_MERGE) != 0 ||
      libssh2_channel_exec(channel, command.c_str()) != 0) throw std::runtime_error("SSH exec failed");
  size_t offset = 0;
  while (offset < input.size()) {
    check_time();
    const auto count = libssh2_channel_write(channel, input.data() + offset, input.size() - offset);
    if (count <= 0) throw std::runtime_error("SSH command input failed");
    offset += static_cast<size_t>(count);
  }
  if (libssh2_channel_send_eof(channel) != 0) throw std::runtime_error("SSH command EOF failed");
  std::string output;
  char buffer[16384];
  for (;;) {
    check_time();
    const auto count = libssh2_channel_read(channel, buffer, sizeof(buffer));
    if (count < 0) throw std::runtime_error("SSH command output failed");
    if (count == 0) break;
    if (output.size() + static_cast<size_t>(count) > 4 * 1024 * 1024)
      throw std::runtime_error("SSH command output exceeds 4 MiB");
    output.append(buffer, static_cast<size_t>(count));
  }
  if (libssh2_channel_close(channel) != 0 || libssh2_channel_wait_closed(channel) != 0)
    throw std::runtime_error("SSH command close failed");
  return {std::move(output), libssh2_channel_get_exit_status(channel)};
}
} // namespace t3ssh
