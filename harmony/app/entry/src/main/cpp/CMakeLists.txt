# T3 Code HarmonyOS 原生库装配。
# Swift 核心 + NAPI 模块由 harmony/napi/build-ohos.sh 产出，拷入本目录的
# prebuilt/ 后链接；这样 hvigor 只负责组装，交叉编译复杂度留在专用脚本里。
cmake_minimum_required(VERSION 3.16)
project(t3code_entry)

set(PREBUILT ${CMAKE_CURRENT_SOURCE_DIR}/prebuilt/${OHOS_ARCH})

add_library(t3bridge SHARED IMPORTED)
set_target_properties(t3bridge PROPERTIES IMPORTED_LOCATION ${PREBUILT}/libt3bridge.so)

add_library(t3_ssh SHARED IMPORTED)
set_target_properties(t3_ssh PROPERTIES IMPORTED_LOCATION ${PREBUILT}/libt3_ssh.so)

# 占位目标：无源码，仅确保 prebuilt 存在性在构建期可见。
add_library(t3_native_placeholder INTERFACE)
target_include_directories(t3_native_placeholder INTERFACE ${CMAKE_CURRENT_SOURCE_DIR})
