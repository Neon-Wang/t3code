#!/usr/bin/env bash
# Build the HarmonyOS client with the SDK bundled in DevEco Studio.
set -euo pipefail
DEVECO_STUDIO_HOME="${DEVECO_STUDIO_HOME:-/Applications/DevEco-Studio.app/Contents}"
HVIGOR="$DEVECO_STUDIO_HOME/tools/hvigor/bin/hvigorw"
if [ ! -x "$HVIGOR" ]; then
  echo "DevEco Studio 未找到；设置 DEVECO_STUDIO_HOME 指向应用的 Contents 目录。" >&2
  exit 2
fi
export DEVECO_SDK_HOME="${DEVECO_SDK_HOME:-$DEVECO_STUDIO_HOME/sdk}"
export JAVA_HOME="${JAVA_HOME:-$DEVECO_STUDIO_HOME/jbr/Contents/Home}"
export NODE_HOME="${NODE_HOME:-$DEVECO_STUDIO_HOME/tools/node}"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [ ! -f build-profile.json5 ]; then
  cp build-profile.example.json5 build-profile.json5
fi
"$DEVECO_STUDIO_HOME/tools/ohpm/bin/ohpm" install --all
"$HVIGOR" --mode module -p product=default -p module=entry@default -p buildMode=debug \
  assembleHap --no-daemon
