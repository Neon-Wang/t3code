#!/usr/bin/env bash
# 一键构建未签名 debug hap（OpenHarmony 命令行链路）。
# 前置：~/command-line-tools（DevEco CLI 5.0.5+）、~/ohos-sdk-hvigor（<api>/<component> 布局）、JDK。
set -euo pipefail
export PATH="$HOME/command-line-tools/bin:$HOME/command-line-tools/jdk/Contents/Home/bin:$PATH"
export JAVA_HOME="${JAVA_HOME:-$HOME/command-line-tools/jdk/Contents/Home}"
export OHOS_BASE_SDK_HOME="${OHOS_BASE_SDK_HOME:-$HOME/ohos-sdk-hvigor}"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
hvigorw --mode module -p product=default -p module=entry@default -p buildMode=debug \
  assembleHap --parallel --no-daemon
echo "产物：entry/build/default/outputs/default/entry-default-unsigned.hap"
