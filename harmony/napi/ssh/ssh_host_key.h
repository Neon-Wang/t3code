#pragma once
#include <libssh2.h>
#include <cstring>
#include <string>

namespace t3ssh {
// OpenSSH SHA256 fingerprints omit Base64 padding.
inline std::string Fingerprint(const unsigned char* digest) {
  static constexpr char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string result = "SHA256:";
  unsigned int bits = 0;
  int count = 0;
  for (int i = 0; i < 32; ++i) {
    bits = (bits << 8) | digest[i];
    count += 8;
    while (count >= 6) {
      count -= 6;
      result += alphabet[(bits >> count) & 63];
    }
  }
  if (count > 0) result += alphabet[(bits << (6 - count)) & 63];
  return result;
}

// Keep verification and authentication in one boundary so no credential can be
// sent before the server's negotiated key matches the independently obtained pin.
inline const char* AuthenticatePinned(LIBSSH2_SESSION* session, const std::string& username,
  const std::string& password, const std::string& expected) {
  if (expected.size() != 50 || expected.compare(0, 7, "SHA256:") != 0)
    return "SSH requires a SHA256 host fingerprint from a trusted source";
  const char* hash = libssh2_hostkey_hash(session, LIBSSH2_HOSTKEY_HASH_SHA256);
  if (!hash || Fingerprint(reinterpret_cast<const unsigned char*>(hash)) != expected)
    return "SSH host fingerprint mismatch; password was not sent";
  if (libssh2_userauth_password_ex(session, username.data(), static_cast<unsigned int>(username.size()),
      password.data(), static_cast<unsigned int>(password.size()), nullptr) != 0)
    return "SSH authentication failed";
  return nullptr;
}
} // namespace t3ssh
