#!/usr/bin/env python3
"""Build the Harmony NAPI adapter against the pinned Ghostty C headers."""
import argparse
from pathlib import Path
import subprocess
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ohos-native', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
args.output.mkdir(parents=True, exist_ok=True)
subprocess.run([str(args.ohos_native / 'llvm/bin/clang++'), '--target=aarch64-linux-ohos',
    '--sysroot=' + str(args.ohos_native / 'sysroot'), '-std=c++17', '-shared', '-fPIC', '-O2',
    '-Wl,--no-undefined', '-Wall', '-Wextra', '-I', str(root / 'native/libghostty-vt/include'),
    str(root / 'harmony/napi/t3_terminal.cpp'), '-lace_napi.z', '-ldl',
    '-o', str(args.output / 'libt3terminal.so')], check=True)
