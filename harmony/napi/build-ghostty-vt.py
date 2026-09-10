#!/usr/bin/env python3
"""Build the pinned Ghostty VT engine in an offline ARM64 Linux container.

Python 3.12+, Docker and a locally available ARM64 Linux image are required.
Archives are SHA256-checked; the actual build has no network or host packages.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tarfile
from urllib.request import urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path, help='Fresh build directory (must not exist)')
    parser.add_argument('--image', required=True, help='Local Linux ARM64 image pinned by @sha256 digest')
    parser.add_argument('--archives', required=True, type=Path, help='Reusable downloaded archive directory')
    parser.add_argument('--download', action='store_true', help='Download missing archives before the offline build')
    args = parser.parse_args()
    if not re.fullmatch(r'[^\s]+@sha256:[a-f0-9]{64}', args.image):
        parser.error('--image must use an immutable sha256 digest')
    root = Path(__file__).resolve().parents[2]
    manifest = json.loads(Path(__file__).with_name('ghostty-sources.json').read_text())
    revision = (root / 'native/libghostty-vt/VERSION').read_text().strip()
    if revision != manifest['revision']:
        parser.error('Ghostty source lock does not match native/libghostty-vt/VERSION')
    output, archives = args.output.resolve(), args.archives.resolve()
    if output.exists():
        parser.error('Use a fresh output directory; existing work is never overwritten')
    metadata = json.loads(subprocess.check_output(['docker', 'image', 'inspect', args.image], text=True))[0]
    if metadata['Architecture'] != 'arm64' or metadata['Os'] != 'linux':
        parser.error('The local image must be Linux ARM64')
    archives.mkdir(parents=True, exist_ok=True)
    for item in manifest['archives']:
        path = archives / item['name']
        if not path.exists():
            if not args.download:
                parser.error(f'Missing archive: {path}; use --download to fetch it')
            with urlopen(item['url'], timeout=120) as response:
                data = response.read()
            if hashlib.sha256(data).hexdigest() != item['sha256']:
                raise RuntimeError(f"Download hash mismatch: {item['name']}")
            path.write_bytes(data)
        if hashlib.sha256(path.read_bytes()).hexdigest() != item['sha256']:
            raise RuntimeError(f"Archive hash mismatch: {item['name']}")
    output.mkdir(parents=True)
    for item in manifest['archives']:
        if item['kind'] in ('source', 'toolchain'):
            with tarfile.open(archives / item['name']) as bundle:
                bundle.extractall(output, filter='data')
    source = 'ghostty-' + revision
    zig = '/build/zig-aarch64-linux-' + manifest['zigVersion'] + '/zig'
    docker = ['docker', 'run', '--rm', '--pull=never', '--network=none', '--platform=linux/arm64',
              '-v', str(output) + ':/build', '-v', str(archives) + ':/archives:ro']
    for item in manifest['archives']:
        if item['kind'] == 'dependency':
            subprocess.run(docker + ['--entrypoint', zig, args.image, 'fetch',
                           '--global-cache-dir', '/build/cache', '/archives/' + item['name']], check=True)
    subprocess.run(docker + ['-w', '/build/' + source, '--entrypoint', zig, args.image,
                   'build', '--global-cache-dir', '/build/cache', '-Demit-lib-vt',
                   '-Dtarget=aarch64-linux-musl', '-Doptimize=ReleaseFast', '-Dstrip=true',
                   '-Dsimd=false', '-Dversion-string=1.3.2-dev+' + revision[:8],
                   '-p', '/build/output'], check=True)
    library = output / 'output/lib/libghostty-vt.so.0.1.0'
    if not library.is_file():
        raise RuntimeError('Build did not produce the expected Ghostty shared library')
    receipt = {'revision': revision, 'zigVersion': manifest['zigVersion'], 'image': args.image,
               'librarySha256': hashlib.sha256(library.read_bytes()).hexdigest()}
    (output / 'build-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print('Built:', library, '\nSHA256:', receipt['librarySha256'])


if __name__ == '__main__':
    main()
