# T3 Code for HarmonyOS

把 T3 Code 移动端的原生能力（review diff 渲染、composer、终端、系统能力）带到
OpenHarmony / HarmonyOS，并用 ArkUI 构建可连接远程环境的 T3 Code 手机/平板应用。

本目录是一个**自包含的独立交付物**：不修改 `apps/mobile` 的任何文件，不依赖仓库
其余部分的构建系统，可以整体摘出来单独演进，也可以随上游滚动更新。

## 目录结构

```
harmony/
  tools/sync-upstream.mjs    上游同步工具（确定性变换 + 清单 + --check）
  vendor/                    同步产物：上游 Swift 源（确定性变换后）+ manifest.json
  Package.swift              SwiftPM 包（host 可 build/test）
  swift/
    Sources/T3CoreGraphics   几何 + 记录型 CGContext → Codable display list
    Sources/T3QuartzCore     CALayer/CATransaction/CADisplayLink（嵌入者驱动帧时钟）
    Sources/T3UIKit          UIKit-lite：UIView 树、约束微型求解、手势、文本编辑模型
    Sources/T3ExpoModulesCore Expo DSL 录制实现（Module/View/Prop/Events/AsyncFunction）
    Sources/T3GhosttyKit     GhosttyKit surface API，引擎可注入（host 无引擎）
    Sources/T3AVKit 等       AVKit/QuickLook/ImageIO 蒸馏（呈现记录式）
    Sources/Tendored*…       （由 vendor/ 生成的上游模块 target）
    Sources/T3Bridge         通用桥：注册表、prop/事件分发、display list 导出、输入/滚动/帧驱动
    Sources/T3SwiftCore      产品门面：registerVendoredModules()
    Tests/T3TestRunner       零依赖 host 测试运行器（XCTest 不可用时）
  napi/                      C++ NAPI 边界 + libssh2 隧道 + libghostty-vt 终端后端
  app/                       ArkUI 应用（DevEco/hvigor 工程，手机 + 平板）
```

## 核心设计：Swift 是唯一真源

上游的 12 个 Swift 文件（4 个模块，约 145KB）承载了全部渲染与交互逻辑。
Harmony 侧**不复写这些逻辑**，而是让同一份源码在三种环境编译运行：

| 环境                | 编译方式                                 | 验证               |
| ------------------- | ---------------------------------------- | ------------------ |
| host（macOS/Linux） | `swift build` + `swift run T3TestRunner` | ✅ 当前全绿        |
| OpenHarmony 设备    | OHOS sysroot 交叉编译 `.so` + NAPI 导出  | 见下「工具链现状」 |
| iOS（上游）         | 不受影响，`apps/mobile` 原样构建         | 上游 CI            |

### 同步契约（跟随上游滚动）

`node harmony/tools/sync-upstream.mjs` 产出**确定性** vendor 树：

1. `import UIKit → import T3UIKit` 等模块名重写（逐行、全量、可审计）；
2. 两处微小的编译器适配注入（记录在工具源码中，见其注释）：
   - 视图子类体内注入 `required convenience init?(coder:)` —— 纯 Swift 无法
     复刻 ObjC 基类的自动 init 继承；
   - `[kSecClass…]` 数组字面量改写为常量数组迭代 —— Swift 6.3 在 resultBuilder
     闭包内对跨模块 CFString 字面量的诊断崩溃的规避；
3. 每模块生成 `T3HarmonySupport.generated.swift`（跨模块构造工厂）；
4. `vendor/manifest.json` 记录上游 commit 与逐文件 sha256；`--check` 供 CI 判陈旧。

**上游更新流程：`git pull` → `node harmony/tools/sync-upstream.mjs` → `swift run
T3TestRunner`。** 若上游改了 DSL 面（新 Prop/事件/异步函数），桥自动获得；若引入
新的 Apple API，`swift build` 的报错即是精确的 shim 待办清单。

### 为什么 display list 而不是逐组件复刻

review-diff 的渲染是纯 `draw(_:) + CGContext` 记录式绘制。shim 的 `CGContext`
把绘制命令录制为 Codable 的 `T3DisplayList`，设备侧由**一个通用 ArkUI Canvas
组件**逐操作回放。上游绘制代码怎么改，Harmony 就怎么显示——没有第二份 UI 逻辑
会漂移。文本测量通过可注入的 measurer 由设备侧（ArkUI measure）提供，保证布局
与设备排版引擎一致。

### Expo DSL 即 API 注册表

模块定义文件（`T3ReviewDiffModule.swift` 等）在我们录制的 DSL 上运行一次，
产出 props/events/async-functions/constants 的**声明式注册表**。桥从这个注册表
分发，设备侧绑定自动跟随上游 DSL 演进。

## host 验证（当前状态）

```
cd harmony && swift build && swift run T3TestRunner
```

覆盖：5 模块注册、常量随定义传播、review-diff 行渲染进 display list（文件头/
代码行/hunk 文本）、display list JSON 往返、滚动→可见文件事件、点击→onPressLine、
composer 受控文档、终端无引擎时的估算 resize、vendor 树与上游一致性。

## OHOS SDK 安装（本机已装）

```
# 来源：OpenHarmony 5.0.3-Release（公开镜像，无需账号）
curl -L -C - https://repo.huaweicloud.com/openharmony/os/5.0.3-Release/ohos-sdk-mac-public.tar.gz \
  -o ~/ohos-sdk/ohos-sdk-mac-public.tar.gz
# sha256: 1fa1c67c…c00e8；解压 native/toolchains/ets 三个组件即可
tar xzf ~/ohos-sdk/ohos-sdk-mac-public.tar.gz -C ~/ohos-sdk sdk/packages/ohos-sdk/darwin/{native,toolchains,ets}-darwin-x64-*.zip
for z in native toolchains ets; do unzip -q ~/ohos-sdk/sdk/packages/ohos-sdk/darwin/${z}-darwin-x64-*.zip -d ~/ohos-sdk/; done
```

- 组件是 **darwin-x64**：Apple Silicon 经 Rosetta 2 运行（本机已验证
  `aarch64-unknown-linux-ohos-clang++` 15.0.4 正常出 aarch64 ELF）。
- `native/build/cmake/ohos.toolchain.cmake` 可直接给 libssh2/libghostty-vt 的
  CMake 交叉构建使用。
- hvigor/ohpm（打包 hap）不在此包内，属 command-line-tools/DevEco。

## 工具链现状（诚实说明）

- **Swift→OHOS 交叉编译尚无官方工具链**。Swift 官方支持 macOS/Linux/Android
  （静态 SDK），`aarch64-unknown-linux-ohos` 只有社区交叉方案。本包的设备侧路径：
  `napi/build-ohos.sh` 以 OHOS NDK sysroot + 社区 Swift 工具链把同一份 Swift 源
  编进 `libt3swiftcore.so`；Foundation 依赖 swift-corelibs-foundation 的 OHOS
  可用性，这是当前最大的外部不确定性（fallback：把 `T3Bridge` 的边界逐步下沉到
  C++，vendor 契约不变）。
- **终端后端**：iOS 用 vendored GhosttyKit（surface 渲染），Harmony 复用上游
  Android 的 `libghostty-vt` C 库（仓库 `native/libghostty-vt/` 是唯一 pin 源），
  经 NAPI 出快照帧由 ArkUI Canvas 绘制；Swift 侧逻辑通过 `T3GhosttyKit` 的引擎
  注入点接入。
- **推送/Live Activity**：不在本期范围（上游推送仅 iOS/APNs）。

## 与主仓的关系

- 不改 `apps/mobile`、`packages/*` 任何文件；仅在 `harmony/` 内新增。
- SSH 连接能力对齐桌面语义（`packages/ssh`）：远端脚本启动/复用 server、
  direct-tcpip 本地转发、pairing→OAuth token-exchange→websocket-ticket。
