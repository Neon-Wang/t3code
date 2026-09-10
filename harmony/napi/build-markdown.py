#!/usr/bin/env python3
"""Build the same pinned Markdown parser used by the iOS client, without Nitro bindings."""
import argparse
import hashlib
from pathlib import Path
import subprocess
import tarfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ohos-native', type=Path)
parser.add_argument('--host-test', action='store_true')
parser.add_argument('--node-headers', type=Path, help='Also run the NAPI adapter tests on macOS')
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
if not args.host_test and args.ohos_native is None:
    parser.error('--ohos-native is required for the device library')
root = Path(__file__).resolve().parents[2]
archive = root / 'apps/mobile/deps/react-native-nitro-markdown-0.5.0.tgz'
expected = '743a2aee4169e147dd0386280a3e42d431390740fdae3d14166f1ed0905e5a6d'
if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
    raise SystemExit('Markdown archive hash mismatch')
args.output.mkdir(parents=True, exist_ok=True)
source = args.output / 'source'
# Extract only named regular files; keep upstream licenses with the build inputs.
files = ['LICENSE', 'cpp/md4c/md4c.c', 'cpp/md4c/md4c.h',
         'cpp/core/MD4CParser.cpp', 'cpp/core/MD4CParser.hpp', 'cpp/core/MarkdownTypes.hpp']
with tarfile.open(archive, 'r:gz') as package:
    for name in files:
        member = package.getmember('package/' + name)
        if not member.isfile():
            raise SystemExit('Expected a regular source file: ' + name)
        destination = source / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(package.extractfile(member).read())
cpp = source / 'cpp'
if args.host_test:
    cc, cxx, flags = 'clang', 'clang++', ['-O2']
else:
    cc = str(args.ohos_native / 'llvm/bin/clang')
    cxx = str(args.ohos_native / 'llvm/bin/clang++')
    flags = ['--target=aarch64-linux-ohos', '--sysroot=' + str(args.ohos_native / 'sysroot'), '-O2', '-fPIC']
obj = args.output / 'md4c.o'
subprocess.run([cc, *flags, '-c', str(cpp / 'md4c/md4c.c'), '-o', str(obj)], check=True)
common = [cxx, *flags, '-std=c++17', '-I', str(cpp), str(cpp / 'core/MD4CParser.cpp'), str(obj)]
if args.host_test:
    binary = args.output / 'markdown-parser-test'
    subprocess.run([*common, str(root / 'harmony/tests/native/markdown_parser_test.cpp'), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
    if args.node_headers:
        addon = args.output / 't3markdown.node'
        subprocess.run([*common, '-bundle', '-undefined', 'dynamic_lookup', '-I', str(args.node_headers),
                        str(root / 'harmony/napi/t3_markdown.cpp'), '-o', str(addon)], check=True)
        subprocess.run(['node', str(root / 'harmony/tests/native/markdown_bridge_test.cjs'), str(addon.resolve())], check=True)
else:
    subprocess.run([*common, '-shared', '-Wl,--no-undefined', str(root / 'harmony/napi/t3_markdown.cpp'),
                    '-lace_napi.z', '-o', str(args.output / 'libt3markdown.so')], check=True)
