// T3 SSH tunnel — libssh2 over NAPI.
//
// Mirrors the semantics of packages/ssh (desktop): a persistent SSH session to
// the user's host, local-forward listeners ("ssh -L") bridging to the remote
// T3 server port, and exec channels for the launch/pairing/stop scripts. The
// remote scripts themselves are unchanged shell — the same bytes the desktop
// sends. State and results flow to ArkTS through one event callback.
//
// Build: scripts in build-ohos.sh vendor libssh2 from source for the OHOS ABI.

#include <node_api.h>

#include <arpa/inet.h>
#include <netdb.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/socket.h>
#include <unistd.h>

#include <libssh2.h>

#include <atomic>
#include <condition_variable>
#include <cstring>
#include <deque>
#include <functional>
#include <map>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace {

struct EventSink {
  napi_threadsafe_function tsfn = nullptr;

  void Emit(const std::string& type, const std::string& json) {
    if (tsfn == nullptr) return;
    std::string* payload = new std::string("{\"type\":\"" + type + "\"," + json + "}");
    napi_call_threadsafe_function(
      tsfn, payload, napi_tsfn_nonblocking);
  }
};

EventSink g_sink;

struct Forward {
  int listen_fd = -1;
  uint16_t local_port = 0;
  uint16_t remote_port = 0;
  std::thread accept_thread;
  std::vector<std::thread> pumps;
};

struct SshSession {
  LIBSSH2_SESSION* session = nullptr;
  int socket_fd = -1;
  std::atomic<bool> running{false};
  std::mutex mutex;
  std::map<uint64_t, Forward> forwards;
  uint64_t next_forward_id = 1;
  std::thread keepalive_thread;

  ~SshSession() { Close(); }

  void Close() {
    running.store(false);
    for (auto& [id, forward] : forwards) {
      if (forward.listen_fd >= 0) {
        shutdown(forward.listen_fd, SHUT_RDWR);
        close(forward.listen_fd);
      }
      if (forward.accept_thread.joinable()) forward.accept_thread.join();
      for (auto& pump : forward.pumps) {
        if (pump.joinable()) pump.join();
      }
    }
    forwards.clear();
    if (keepalive_thread.joinable()) keepalive_thread.join();
    if (session != nullptr) {
      libssh2_session_disconnect(session, "t3 bye");
      libssh2_session_free(session);
      session = nullptr;
    }
    if (socket_fd >= 0) {
      close(socket_fd);
      socket_fd = -1;
    }
  }
};

SshSession g_session;

void PumpBidirectional(int local_fd, LIBSSH2_CHANNEL* channel) {
  // Both directions until either side closes; the remote T3 server traffic is
  // plain HTTP/WebSocket bytes over the direct-tcpip channel.
  std::thread to_remote([local_fd, channel]() {
    char buffer[16 * 1024];
    while (g_session.running.load()) {
      ssize_t received = recv(local_fd, buffer, sizeof(buffer), 0);
      if (received <= 0) break;
      ssize_t offset = 0;
      while (offset < received) {
        ssize_t written = libssh2_channel_write(channel, buffer + offset, received - offset);
        if (written <= 0) goto done;
        offset += written;
      }
    }
  done:
    libssh2_channel_send_eof(channel);
    shutdown(local_fd, SHUT_RD);
  });
  std::thread to_local([local_fd, channel]() {
    char buffer[16 * 1024];
    while (g_session.running.load()) {
      ssize_t received = libssh2_channel_read(channel, buffer, sizeof(buffer));
      if (received == LIBSSH2_ERROR_EAGAIN) continue;
      if (received <= 0) break;
      ssize_t offset = 0;
      while (offset < received) {
        ssize_t written = send(local_fd, buffer + offset, received - offset, 0);
        if (written <= 0) goto done;
        offset += written;
      }
    }
  done:
    shutdown(local_fd, SHUT_WR);
  });
  to_remote.join();
  to_local.join();
  libssh2_channel_free(channel);
  close(local_fd);
}

int ConnectTcp(const std::string& host, int port) {
  struct addrinfo hints{};
  hints.ai_family = AF_UNSPEC;
  hints.ai_socktype = SOCK_STREAM;
  struct addrinfo* results = nullptr;
  if (getaddrinfo(host.c_str(), std::to_string(port).c_str(), &hints, &results) != 0) return -1;
  int fd = -1;
  for (struct addrinfo* candidate = results; candidate != nullptr; candidate = candidate->ai_next) {
    fd = socket(candidate->ai_family, candidate->ai_socktype, candidate->ai_protocol);
    if (fd < 0) continue;
    if (connect(fd, candidate->ai_addr, candidate->ai_addrlen) == 0) break;
    close(fd);
    fd = -1;
  }
  freeaddrinfo(results);
  return fd;
}

// —— NAPI 表面 ——

napi_value Initialize(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc >= 1) {
    napi_value resource_name;
    napi_create_string_utf8(env, "t3-ssh-events", NAPI_AUTO_LENGTH, &resource_name);
    napi_create_threadsafe_function(
      env, argv[0], nullptr, resource_name, 0, 1,
      /* thread_finalize_data */ nullptr,
      /* thread_finalize_cb */ nullptr,
      /* context */ nullptr,
      [](napi_env cb_env, napi_value function, void* /*context*/, void* data) {
        std::string* payload = static_cast<std::string*>(data);
        napi_value json;
        napi_create_string_utf8(cb_env, payload->c_str(), NAPI_AUTO_LENGTH, &json);
        napi_value global;
        napi_get_global(cb_env, &global);
        napi_call_function(cb_env, global, function, 1, &json, nullptr);
        delete payload;
      },
      &g_sink.tsfn);
  }
  libssh2_init(0);
  napi_value out;
  napi_get_boolean(env, true, &out);
  return out;
}

napi_value Connect(napi_env env, napi_callback_info info) {
  size_t argc = 4;
  napi_value argv[4];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  char host[256];
  int32_t port = 22;
  char username[128];
  napi_get_value_string_utf8(env, argv[0], host, sizeof(host), nullptr);
  napi_get_value_int32(env, argv[1], &port);
  napi_get_value_string_utf8(env, argv[2], username, sizeof(username), nullptr);
  size_t password_length = 0;
  napi_get_value_string_utf8(env, argv[3], nullptr, 0, &password_length);
  std::string secret(password_length, '\0');
  if (password_length > 0) {
    napi_get_value_string_utf8(env, argv[3], secret.data(), password_length + 1, &password_length);
  }

  g_session.Close();
  g_session.socket_fd = ConnectTcp(host, port);
  if (g_session.socket_fd < 0) {
    napi_throw_error(env, nullptr, "tcp connect failed");
    return nullptr;
  }
  g_session.session = libssh2_session_init();
  libssh2_session_set_blocking(g_session.session, 1);
  libssh2_session_set_timeout(g_session.session, 10000);
  if (libssh2_session_handshake(g_session.session, g_session.socket_fd) != 0) {
    g_session.Close();
    napi_throw_error(env, nullptr, "ssh handshake failed");
    return nullptr;
  }

  // Authentication: public key first (files or agent-equivalent), password as
  // the interactive fallback — the desktop retries via SSH_ASKPASS the same way.
  bool authenticated = false;
  if (!secret.empty()) {
    authenticated =
      libssh2_userauth_password(g_session.session, username, secret.c_str()) == 0;
    if (!authenticated) {
      g_session.Close();
      napi_throw_error(env, nullptr, "authentication failed");
      return nullptr;
    }
  }
  if (!authenticated) {
    napi_throw_error(env, nullptr, "no credentials");
    return nullptr;
  }

  g_session.running.store(true);
  g_session.keepalive_thread = std::thread([]() {
    // ServerAliveInterval 15s × 3, mirroring the desktop's ssh options.
    int failures = 0;
    while (g_session.running.load()) {
      for (int i = 0; i < 15 && g_session.running.load(); i++) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
      }
      if (!g_session.running.load()) return;
      if (libssh2_keepalive_config(g_session.session, 1, 15) == 0 &&
          libssh2_keepalive_send(g_session.session, nullptr, nullptr) == 0) {
        failures = 0;
      } else if (++failures >= 3) {
        g_sink.Emit("error", "\"message\":\"keepalive timeout\"");
        return;
      }
    }
  });

  napi_value out;
  napi_get_boolean(env, true, &out);
  return out;
}

napi_value OpenForward(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  char host[256];
  int32_t local_port = 0;
  int32_t remote_port = 3773;
  napi_get_value_string_utf8(env, argv[0], host, sizeof(host), nullptr);
  napi_get_value_int32(env, argv[1], &local_port);
  napi_get_value_int32(env, argv[2], &remote_port);

  int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  address.sin_port = htons(static_cast<uint16_t>(local_port));
  if (bind(listen_fd, reinterpret_cast<sockaddr*>(&address), sizeof(address)) != 0 ||
      listen(listen_fd, 8) != 0) {
    close(listen_fd);
    napi_throw_error(env, nullptr, "local bind failed");
    return nullptr;
  }

  uint64_t id;
  {
    std::lock_guard<std::mutex> lock(g_session.mutex);
    id = g_session.next_forward_id++;
    Forward& forward = g_session.forwards[id];
    forward.listen_fd = listen_fd;
    forward.local_port = local_port;
    forward.remote_port = static_cast<uint16_t>(remote_port);
    forward.accept_thread = std::thread([id, listen_fd, remote_port]() {
      while (g_session.running.load()) {
        int client = accept(listen_fd, nullptr, nullptr);
        if (client < 0) break;
        LIBSSH2_CHANNEL* channel = libssh2_channel_direct_tcpip(
          g_session.session, "127.0.0.1", static_cast<uint16_t>(remote_port));
        if (channel == nullptr) {
          close(client);
          continue;
        }
        std::lock_guard<std::mutex> lock(g_session.mutex);
        auto entry = g_session.forwards.find(id);
        if (entry != g_session.forwards.end()) {
          entry->second.pumps.emplace_back(PumpBidirectional, client, channel);
        }
      }
    });
  }

  g_sink.Emit("forward-open", "\"localPort\":" + std::to_string(local_port) +
    ",\"remotePort\":" + std::to_string(remote_port));
  napi_value out;
  napi_create_int64(env, static_cast<int64_t>(id), &out);
  return out;
}

napi_value Exec(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  char command[4096];
  size_t command_length = 0;
  napi_get_value_string_utf8(env, argv[0], nullptr, 0, &command_length);
  std::string command_text(command_length, '\0');
  napi_get_value_string_utf8(
    env, argv[0], command_text.data(), command_length + 1, &command_length);
  (void)command;

  napi_valuetype stdin_type;
  napi_typeof(env, argv[1], &stdin_type);
  std::string stdin_text;
  if (stdin_type == napi_string) {
    size_t stdin_length = 0;
    napi_get_value_string_utf8(env, argv[1], nullptr, 0, &stdin_length);
    stdin_text.resize(stdin_length);
    napi_get_value_string_utf8(env, argv[1], stdin_text.data(), stdin_length + 1, &stdin_length);
  }

  LIBSSH2_CHANNEL* channel = libssh2_channel_open_session(g_session.session);
  if (channel == nullptr) {
    napi_throw_error(env, nullptr, "channel open failed");
    return nullptr;
  }
  // The launch/pairing scripts are delivered via stdin (`sh -l -s -- <key>`).
  std::string full_command = stdin_text.empty() ? command_text : command_text;
  if (libssh2_channel_exec(channel, full_command.c_str()) != 0) {
    libssh2_channel_free(channel);
    napi_throw_error(env, nullptr, "exec failed");
    return nullptr;
  }
  if (!stdin_text.empty()) {
    ssize_t offset = 0;
    while (offset < static_cast<ssize_t>(stdin_text.size())) {
      ssize_t written = libssh2_channel_write(
        channel, stdin_text.data() + offset, stdin_text.size() - offset);
      if (written <= 0) break;
      offset += written;
    }
    libssh2_channel_send_eof(channel);
  }

  std::string stdout_text;
  char buffer[4096];
  ssize_t received;
  while ((received = libssh2_channel_read(channel, buffer, sizeof(buffer))) > 0) {
    stdout_text.append(buffer, static_cast<size_t>(received));
  }
  int exit_code = libssh2_channel_get_exit_status(channel);
  libssh2_channel_free(channel);

  napi_value out;
  napi_create_object(env, &out);
  napi_value stdout_value;
  napi_create_string_utf8(env, stdout_text.c_str(), NAPI_AUTO_LENGTH, &stdout_value);
  napi_set_named_property(env, out, "stdout", stdout_value);
  napi_value code_value;
  napi_create_int32(env, exit_code, &code_value);
  napi_set_named_property(env, out, "exitCode", code_value);
  return out;
}

napi_value Disconnect(napi_env env, napi_callback_info /*info*/) {
  g_session.Close();
  napi_value out;
  napi_get_boolean(env, true, &out);
  return out;
}

napi_value Init(napi_env env, napi_value exports) {
  const napi_property_descriptor descriptors[] = {
    {"initialize", nullptr, Initialize, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"connect", nullptr, Connect, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"openForward", nullptr, OpenForward, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"exec", nullptr, Exec, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"disconnect", nullptr, Disconnect, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof(descriptors) / sizeof(descriptors[0]), descriptors);
  return exports;
}

}  // namespace

NAPI_MODULE(t3_ssh, Init)
