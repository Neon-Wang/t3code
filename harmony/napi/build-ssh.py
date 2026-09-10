#!/usr/bin/env python3
"""Build the Harmony SSH NAPI bridge against build-ssh-deps.py output."""
import argparse
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ohos-native', required=True, type=Path)
parser.add_argument('--ssh-deps', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent
args.output.mkdir(parents=True, exist_ok=True)
subprocess.run([str(args.ohos_native / 'llvm/bin/clang++'), '--target=aarch64-linux-ohos',
    '--sysroot=' + str(args.ohos_native / 'sysroot'), '-std=c++17', '-shared', '-fPIC', '-O2',
    '-Wl,--no-undefined', '-Wall', '-Wextra',
    '-I', str(args.ssh_deps / 'libssh2-1.11.1/include'),
    str(root / 'ssh/t3_ssh_tunnel.cpp'),
    str(args.ssh_deps / 'libssh2-build/src/libssh2.a'),
    str(args.ssh_deps / 'openssl-3.5.8/libcrypto.a'), '-lace_napi.z',
    '-o', str(args.output / 'libt3_ssh.so')], check=True)
