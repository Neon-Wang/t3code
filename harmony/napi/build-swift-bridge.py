#!/usr/bin/env python3
"""Build the arm64 Swift/NAPI bridge without installing or changing toolchains."""
import argparse
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--toolchain", required=True, type=Path, help="Swift 6.3.3 toolchain root containing usr/bin")
parser.add_argument("--sdks", required=True, type=Path, help="Directory containing the official Swift 6.3.3 static Linux SDK artifactbundle")
parser.add_argument("--ohos-native", required=True, type=Path, help="DevEco SDK openharmony/native directory")
parser.add_argument("--output", required=True, type=Path, help="Build directory; the app's bundled libraries are never replaced")
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
output = args.output.resolve()
output.mkdir(parents=True, exist_ok=True)
tools = args.toolchain.resolve() / "usr/bin"
oh = args.ohos_native.resolve()
sdks = args.sdks.resolve()
version = subprocess.check_output([tools / "swift", "--version"], text=True)
if "Swift version 6.3.3" not in version:
    parser.error("This build requires the matching Swift 6.3.3 toolchain")
static = sdks / "swift-6.3.3-RELEASE_static-linux-0.1.0.artifactbundle/swift-6.3.3-RELEASE_static-linux-0.1.0/swift-linux-musl/musl-1.2.5.sdk/aarch64"
if not (static / "usr/lib/swift_static/linux-static/aarch64/swiftrt.o").is_file():
    parser.error("Swift 6.3.3 static Linux SDK is missing or incomplete")
if not (oh / "sysroot/usr/include").is_dir():
    parser.error("OpenHarmony native sysroot is missing")

def run(command):
    subprocess.run([str(part) for part in command], check=True)

scratch = output / "swift-build"
run([tools / "swift", "build", "--package-path", root, "--swift-sdks-path", sdks,
     "--swift-sdk", "aarch64-swift-linux-musl", "--scratch-path", scratch, "--target", "T3CABI"])
build = scratch / "aarch64-swift-linux-musl/debug"
objects = sorted(build.glob("*.build/*.swift.o")) + sorted(build.glob("*.build/*.swiftmodule.o"))
objects = [p for p in objects if p.parent.name not in {"T3TestRunner.build", "T3Dump.build"}]
autolink = output / "bridge.autolink"
run([tools / "swift-autolink-extract", *objects, "-o", autolink])
clang_flags = ["--target=aarch64-linux-ohos", "--sysroot=" + str(oh / "sysroot"), "-fPIC", "-O2"]
compat = output / "swift_ohos_compat.o"
run([oh / "llvm/bin/clang", *clang_flags, "-c", root / "napi/swift_ohos_compat.c", "-o", compat])
libraries = []
for flag in dict.fromkeys(autolink.read_text().split()):
    if flag in {"-lpthread", "-ldl"}:
        continue  # Provided by OHOS libc.
    if not flag.startswith("-l"):
        parser.error("Unexpected autolink flag: " + flag)
    name = "lib" + flag[2:] + ".a"
    archive = next((d / name for d in [static / "usr/lib/swift_static/linux-static", static / "usr/lib"] if (d / name).is_file()), None)
    if archive is None:
        parser.error("Missing static dependency: " + name)
    libraries.append(archive)
# Swift's image registration is essential for generic metadata lookup in a DSO.
# Its omission can link successfully but crash during module registration.
runtime = static / "usr/lib/swift_static/linux-static/aarch64/swiftrt.o"
bridge = output / "libt3bridge.so"
run([oh / "llvm/bin/clang++", *clang_flags, "-std=c++17", "-shared",
     "-Wl,--no-undefined", "-Wl,-Bsymbolic", "-Wl,--gc-sections", "-Wl,--exclude-libs,ALL",
     root / "napi/t3_bridge.cpp", *objects, runtime, compat, "-Wl,--start-group",
     *libraries, static / "usr/lib/libc++.a", static / "usr/lib/libunwind.a",
     static / "usr/lib/swift_static/linux-static/libswift_RegexParser.a",
     "-Wl,--end-group", "-lace_napi.z", "-lc++", "-lm", "-o", bridge])
run([oh / "llvm/bin/llvm-strip", "--strip-debug", bridge])
print("Built " + str(bridge))
