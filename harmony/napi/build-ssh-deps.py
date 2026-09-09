#!/usr/bin/env python3
"""Build pinned static SSH dependencies with the DevEco OHOS ARM64 toolchain.

Requires Python 3.12+, Perl and make. Downloads are verified before extraction.
Only the requested output directory is written; no host packages are installed.
"""
import argparse
import hashlib
import os
from pathlib import Path
import shlex
import subprocess
import tarfile
from urllib.request import urlopen

SOURCES = (
    ('openssl-3.5.8', 'https://github.com/openssl/openssl/releases/download/openssl-3.5.8/openssl-3.5.8.tar.gz',
     'a8f84a39918ec6415ce765d9b429d313ba97b8143169c172e734b9514464f5b2'),
    ('libssh2-1.11.1', 'https://libssh2.org/download/libssh2-1.11.1.tar.gz',
     'd9ec76cbe34db98eec3539fe2c899d26b0c837cb3eb466a56b0f109cabf658f7'),
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ohos-native', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--archives', type=Path, help='Use previously downloaded archives (still hash checked)')
    args = parser.parse_args()
    sdk, output = args.ohos_native.resolve(), args.output.resolve()
    clang = sdk / 'llvm/bin/clang'
    cmake = sdk / 'build-tools/cmake/bin/cmake'
    for required in (clang, cmake, sdk / 'build/cmake/ohos.toolchain.cmake'):
        if not required.is_file():
            parser.error(f'Missing OHOS toolchain file: {required}')
    output.mkdir(parents=True, exist_ok=True)
    for name, url, expected in SOURCES:
        archive = (args.archives or output) / (name + '.tar.gz')
        if not archive.exists():
            if args.archives:
                parser.error(f'Missing source archive: {archive}')
            with urlopen(url, timeout=60) as response:
                data = response.read()
            if hashlib.sha256(data).hexdigest() != expected:
                raise RuntimeError(f'Source hash mismatch: {name}')
            archive.write_bytes(data)
        if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
            raise RuntimeError(f'Source hash mismatch: {archive}')
        source = output / name
        if source.exists():
            parser.error(f'Use a fresh output directory; source already exists: {source}')
        with tarfile.open(archive) as tar:
            tar.extractall(output, filter='data')
    wrapper = output / 'ohos-clang'
    wrapper.write_text('#!/bin/sh\nexec ' + shlex.quote(str(clang)) +
                       ' --target=aarch64-linux-ohos --sysroot=' +
                       shlex.quote(str(sdk / 'sysroot')) + ' "$@"\n')
    wrapper.chmod(0o755)
    openssl = output / SOURCES[0][0]
    env = dict(os.environ, CC=str(wrapper), AR=str(sdk / 'llvm/bin/llvm-ar'),
               RANLIB=str(sdk / 'llvm/bin/llvm-ranlib'))
    subprocess.run(['perl', 'Configure', 'linux-aarch64', 'no-shared', 'no-tests',
                    'no-module', 'no-dso', '-fPIC'], cwd=openssl, env=env, check=True)
    subprocess.run(['make', '-j8', 'build_libs'], cwd=openssl, env=env, check=True)
    subprocess.run([str(cmake), '-S', str(output / SOURCES[1][0]),
                    '-B', str(output / 'libssh2-build'),
                    '-DCMAKE_TOOLCHAIN_FILE=' + str(sdk / 'build/cmake/ohos.toolchain.cmake'),
                    '-DOHOS_ARCH=arm64-v8a', '-DCMAKE_BUILD_TYPE=Release',
                    '-DCMAKE_POSITION_INDEPENDENT_CODE=ON', '-DBUILD_SHARED_LIBS=OFF',
                    '-DBUILD_STATIC_LIBS=ON', '-DBUILD_TESTING=OFF', '-DBUILD_EXAMPLES=OFF',
                    '-DCRYPTO_BACKEND=OpenSSL', '-DOPENSSL_INCLUDE_DIR=' + str(openssl / 'include'),
                    '-DOPENSSL_CRYPTO_LIBRARY=' + str(openssl / 'libcrypto.a'),
                    '-DOPENSSL_SSL_LIBRARY=' + str(openssl / 'libssl.a')], check=True)
    subprocess.run([str(cmake), '--build', str(output / 'libssh2-build'), '--parallel', '8'], check=True)
    print('SSH static dependencies built in', output)


if __name__ == '__main__':
    main()
