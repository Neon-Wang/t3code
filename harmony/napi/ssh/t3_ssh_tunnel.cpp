// T3 SSH tunnel — libssh2 over NAPI.
//
// Mirrors the semantics of packages/ssh (desktop): a persistent SSH session to
// the user's host, local-forward listeners ("ssh -L") bridging to the remote
// T3 server port, and exec channels for the launch/pairing/stop scripts. The
// control operations resolve promises on the JS thread; SSH I/O is performed
// outside that thread. Forwarding lifetime remains owned by the session.
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
#include "ssh_host_key.h"
#include "ssh_worker.h"
#include "ssh_session.h"
#include "ssh_socket.h"
#include "ssh_command.h"
#include <memory>
#include <stdexcept>

#include <algorithm>
#include <cstring>
#include <functional>
#include <string>

namespace {

t3ssh::Session g_session;

struct NativeResult {
  enum Kind { Boolean, ForwardId, Command } kind = Boolean;
  int64_t number = 0;
  std::string output;
};

struct AsyncOperation {
  NativeResult result;
  std::string error;
  std::future<void> ready;
  napi_async_work work = nullptr;
  napi_deferred deferred = nullptr;
};

t3ssh::Worker g_commands([] { return g_session.Pump(); });

napi_value RunAsync(napi_env env, std::function<NativeResult()> action) {
  auto job = std::make_shared<AsyncOperation>();
  std::packaged_task<void()> task([weak_job = std::weak_ptr<AsyncOperation>(job), action = std::move(action)] {
    auto job = weak_job.lock();
    if (!job) return;
    try { job->result = action(); }
    catch (const std::exception& error) { job->error = error.what(); }
    catch (...) { job->error = "SSH operation failed"; }
  });
  job->ready = task.get_future();
  napi_value promise, name;
  if (napi_create_promise(env, &job->deferred, &promise) != napi_ok ||
      napi_create_string_utf8(env, "t3-ssh", NAPI_AUTO_LENGTH, &name) != napi_ok) return nullptr;
  auto holder = new std::shared_ptr<AsyncOperation>(job);
  const auto status = napi_create_async_work(env, nullptr, name,
    [](napi_env, void* data) {
      const auto job = *static_cast<std::shared_ptr<AsyncOperation>*>(data);
      job->ready.wait();
    },
    [](napi_env env, napi_status status, void* data) {
      auto holder = static_cast<std::shared_ptr<AsyncOperation>*>(data);
      auto job = *holder;
      delete holder;
      napi_value value;
      if (status != napi_ok || !job->error.empty()) {
        napi_value message;
        const std::string error = status == napi_ok ? job->error : "SSH operation cancelled";
        napi_create_string_utf8(env, error.c_str(), error.size(), &message);
        napi_create_error(env, nullptr, message, &value);
        napi_reject_deferred(env, job->deferred, value);
      } else {
        if (job->result.kind == NativeResult::Command) {
          napi_create_object(env, &value);
          napi_value output, code;
          napi_create_string_utf8(env, job->result.output.data(), job->result.output.size(), &output);
          napi_create_int32(env, static_cast<int32_t>(job->result.number), &code);
          napi_set_named_property(env, value, "stdout", output);
          napi_set_named_property(env, value, "exitCode", code);
        } else if (job->result.kind == NativeResult::ForwardId) {
          napi_create_int64(env, job->result.number, &value);
        } else napi_get_boolean(env, true, &value);
        napi_resolve_deferred(env, job->deferred, value);
      }
      napi_delete_async_work(env, job->work);
    }, holder, &job->work);
  if (status != napi_ok || napi_queue_async_work(env, job->work) != napi_ok) {
    delete holder;
    if (job->work) napi_delete_async_work(env, job->work);
    napi_throw_error(env, nullptr, "Unable to queue SSH operation");
    return nullptr;
  }
  g_commands.Post(std::move(task));
  return promise;
}

// —— NAPI 表面 ——

napi_value Connect(napi_env env, napi_callback_info info) {
  size_t argc = 5;
  napi_value argv[5];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  std::string host, username, secret, fingerprint;
  int32_t port = 0;
  auto read_string = [env](napi_value value, std::string& out, size_t limit) {
    size_t length = 0;
    if (napi_get_value_string_utf8(env, value, nullptr, 0, &length) != napi_ok ||
        length == 0 || length > limit) return false;
    out.resize(length);
    return napi_get_value_string_utf8(env, value, out.data(), length + 1, nullptr) == napi_ok;
  };
  if (argc != 5 || !read_string(argv[0], host, 255) ||
      napi_get_value_int32(env, argv[1], &port) != napi_ok || port < 1 || port > 65535 ||
      !read_string(argv[2], username, 255) || !read_string(argv[3], secret, 65536) ||
      !read_string(argv[4], fingerprint, 50) || fingerprint.size() != 50 ||
      host.find('\0') != std::string::npos || username.find('\0') != std::string::npos) {
    napi_throw_error(env, nullptr, "SSH requires host, port, username, password and SHA256 host fingerprint");
    return nullptr;
  }
  return RunAsync(env, [host, port, username, secret = std::move(secret), fingerprint]() mutable {
  static const int initialized = libssh2_init(0);
  if (initialized != 0) {
    throw std::runtime_error("SSH initialization failed");
  }

  g_session.Close();
  g_session.socket_fd = t3ssh::ConnectTcp(host, port);
  if (g_session.socket_fd < 0) {
    throw std::runtime_error("tcp connect failed");
  }
  g_session.session = libssh2_session_init();
  if (!g_session.session) {
    g_session.Close();
    throw std::runtime_error("SSH session allocation failed");
  }
  libssh2_session_set_blocking(g_session.session, 1);
  libssh2_session_set_timeout(g_session.session, 10000);
  if (libssh2_session_handshake(g_session.session, g_session.socket_fd) != 0) {
    g_session.Close();
    throw std::runtime_error("ssh handshake failed");
  }

  const char* authentication_error = t3ssh::AuthenticatePinned(
    g_session.session, username, secret, fingerprint);
  std::fill(secret.begin(), secret.end(), '\0');
  if (authentication_error) {
    g_session.Close();
    throw std::runtime_error(authentication_error);
  }
  libssh2_keepalive_config(g_session.session, 1, 15);

  libssh2_session_set_blocking(g_session.session, 0);
  g_session.running = true;
  return NativeResult{};
  });
}

napi_value OpenForward(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  int32_t local_port = 0, remote_port = 0;
  if (argc != 3 || napi_get_value_int32(env, argv[1], &local_port) != napi_ok ||
      napi_get_value_int32(env, argv[2], &remote_port) != napi_ok ||
      local_port < 1 || local_port > 65535 || remote_port < 1 || remote_port > 65535) {
    napi_throw_error(env, nullptr, "SSH forwarding requires valid local and remote ports");
    return nullptr;
  }

  return RunAsync(env, [local_port, remote_port] {
    return NativeResult{NativeResult::ForwardId,
      static_cast<int64_t>(g_session.OpenForward(local_port, remote_port)), {}};
  });
}

napi_value Exec(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  size_t command_length = 0, stdin_length = 0;
  if (argc != 2 || napi_get_value_string_utf8(env, argv[0], nullptr, 0, &command_length) != napi_ok ||
      napi_get_value_string_utf8(env, argv[1], nullptr, 0, &stdin_length) != napi_ok ||
      command_length == 0 || command_length > 65536 || stdin_length > 1024 * 1024) {
    napi_throw_error(env, nullptr, "SSH command or input is invalid or too large");
    return nullptr;
  }
  std::string command_text(command_length, '\0'), stdin_text(stdin_length, '\0');
  napi_get_value_string_utf8(env, argv[0], command_text.data(), command_length + 1, nullptr);
  napi_get_value_string_utf8(env, argv[1], stdin_text.data(), stdin_length + 1, nullptr);
  if (command_text.find('\0') != std::string::npos) {
    napi_throw_error(env, nullptr, "SSH command contains a null byte");
    return nullptr;
  }

  return RunAsync(env, [command_text, stdin_text] {
  if (!g_session.running) throw std::runtime_error("SSH not connected");
  auto result = t3ssh::Exec(g_session.session, command_text, stdin_text);
  return NativeResult{NativeResult::Command, result.exit_code, std::move(result.output)};
  });
}

napi_value Disconnect(napi_env env, napi_callback_info /*info*/) {
  return RunAsync(env, [] { g_session.Close(); return NativeResult{}; });
}

napi_value Init(napi_env env, napi_value exports) {
  const napi_property_descriptor descriptors[] = {
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
