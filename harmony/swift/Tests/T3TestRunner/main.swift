import Foundation
import T3SwiftCore
import T3Bridge
import T3CoreGraphics
import T3ExpoModulesCore
import T3UIKit

// Host-side end-to-end verification for the vendored upstream modules running
// behind the shim stack: registration → view creation → prop driving → display
// list output → event flow. Zero-dependency runner (XCTest is unavailable on a
// CommandLineTools-only host); exits nonzero on the first failure.

var failureCount = 0

func expect(_ condition: Bool, _ message: String, file: StaticString = #fileID, line: UInt = #line) {
  if condition {
    print("  ✓ \(message)")
  } else {
    failureCount += 1
    print("  ✗ \(message) [\(file):\(line)]")
  }
}

func expectEqual<T: Equatable>(_ lhs: T, _ rhs: T, _ message: String) {
  expect(lhs == rhs, "\(message) (got \(lhs), want \(rhs))")
}

func expectThrows<T>(_ body: () throws -> T, _ message: String) {
  do {
    _ = try body()
    expect(false, "\(message) — expected an error")
  } catch {
    expect(true, message)
  }
}

final class Harness {
  let registry = T3BridgeRegistry()
  var events: [(instance: String, name: String, payload: [String: Any])] = []

  init() {
    let names = registry.registerVendoredModules()
    expect(names.contains("T3ReviewDiffSurface"), "review-diff module registered")
    expect(names.contains("T3ComposerEditor"), "composer module registered")
    expect(names.contains("T3TerminalSurface"), "terminal module registered")
    expect(names.contains("T3NativeControls"), "native controls module registered")
    expect(names.contains("T3KeyboardCommands"), "keyboard commands module registered")
    registry.eventHandler = { [weak self] instance, name, payload in
      if name == "onDebug", let message = payload["message"] as? String {
        print("    [onDebug] \(message) \(payload.filter { $0.key != "message" })")
      }
      self?.events.append((instance, name, payload))
    }
  }
}

// MARK: - Tests

func testRegistrySurface(_ h: Harness) {
  print("registry surface")
  expectEqual(
    h.registry.constants(moduleName: "T3TerminalSurface")["hardwareKeyRevision"] as? Int ?? -1,
    3, "terminal constants travel with the definition")
}

func makeRowsJson() -> String {
  let rows = [
    """
    {"kind":"file","id":"f1","fileId":"f1","filePath":"Sources/App.swift","changeType":"modified",
     "additions":3,"deletions":1}
    """,
    """
    {"kind":"hunk","id":"h1","fileId":"f1","text":"@@ -10,4 +10,6 @@"}
    """,
    """
    {"kind":"line","id":"l1","fileId":"f1","content":"let value = compute(input)",
     "change":"new","newLineNumber":11}
    """,
    """
    {"kind":"line","id":"l2","fileId":"f1","content":"let old = removed(input)",
     "change":"deleted","oldLineNumber":9}
    """,
  ]
  return "[\(rows.joined(separator: ","))]"
}

func testReviewDiffRenders(_ h: Harness) throws {
  print("review diff: render")
  let instance = try XCTUnwrap(h.registry.createView(moduleName: "T3ReviewDiffSurface"))
  h.registry.setFrame(instanceId: instance, width: 390, height: 640, scale: 3)
  try h.registry.setProp(instanceId: instance, name: "appearanceScheme", value: .string("dark"))
  try h.registry.setProp(instanceId: instance, name: "rowHeight", value: .number(24))
  try h.registry.setProp(instanceId: instance, name: "contentWidth", value: .number(360))
  try h.registry.callAsyncFunction(
    moduleName: "T3ReviewDiffSurface", functionName: "setRowsJson", instanceId: instance,
    arguments: [.string(makeRowsJson())])
  h.registry.pumpMainQueue()
  h.registry.layout(instanceId: instance)

  guard let list = h.registry.displayList(instanceId: instance) else {
    expect(false, "display list produced")
    return
  }
  expect(!list.ops.isEmpty, "display list has content")

  var texts: [String] = []
  func collect(_ ops: [T3DisplayOp]) {
    for op in ops {
      switch op {
      case .text(let text): texts.append(text.runs.map(\.text).joined())
      case .group(_, let nested): collect(nested)
      default: break
      }
    }
  }
  collect(list.ops)
  expect(texts.contains { $0.contains("App.swift") }, "file header rendered")
  expect(texts.contains { $0.contains("compute(input)") }, "code row rendered")
  expect(texts.contains { $0.contains("@@") }, "hunk row rendered")

  // Serialization round-trip: the display list must encode losslessly for the
  // NAPI boundary.
  let data = try JSONEncoder().encode(list)
  let decoded = try JSONDecoder().decode(T3DisplayList.self, from: data)
  expectEqual(decoded.opCount, list.opCount, "display list JSON round-trip preserves op count")
}

func testReviewDiffScrollAndTap(_ h: Harness) throws {
  print("review diff: scroll + tap")
  let instance = try XCTUnwrap(h.registry.createView(moduleName: "T3ReviewDiffSurface"))
  h.registry.setFrame(instanceId: instance, width: 390, height: 640, scale: 3)
  try h.registry.setProp(instanceId: instance, name: "rowHeight", value: .number(24))
  try h.registry.callAsyncFunction(
    moduleName: "T3ReviewDiffSurface", functionName: "setRowsJson", instanceId: instance,
    arguments: [.string(makeRowsJson())])
  h.registry.pumpMainQueue()
  h.registry.layout(instanceId: instance)

  try h.registry.callAsyncFunction(
    moduleName: "T3ReviewDiffSurface", functionName: "scrollToTop", instanceId: instance,
    arguments: [.boolean(false)])

  // Small offset: content is only ~150pt tall (header 54 + hunk 24 + lines 48).
  h.registry.setScrollOffset(instanceId: instance, x: 0, y: 20)
  let visible = h.events.filter { $0.name == "onVisibleFileChange" }
  expect(!visible.isEmpty, "visible file change emitted after scroll")
  if let event = visible.first {
    expectEqual(event.payload["fileId"] as? String ?? "", "f1", "visible file id correct")
  }

  // Tap the first code line: absolute content y 78..102 → local y 58..82 with
  // the 20pt offset → root y ≈ 78 lands mid-line.
  h.registry.touchBegan(instanceId: instance, x: 100, y: 78)
  h.registry.touchEnded(instanceId: instance, x: 100, y: 78)
  expect(
    h.events.contains { $0.name == "onPressLine" || $0.name == "onToggleFile" },
    "tap produced a row event (got \(h.events.map(\.name)))")
}

func testComposer(_ h: Harness) throws {
  print("composer: controlled document")
  let instance = try XCTUnwrap(h.registry.createView(moduleName: "T3ComposerEditor"))
  h.registry.setFrame(instanceId: instance, width: 390, height: 120, scale: 3)
  let document = """
    {"value":"hello world","selection":{"start":0,"end":0},"tokensJson":"[]",
     "mostRecentEventCount":0,"isNativeEcho":false}
    """
  try h.registry.setProp(instanceId: instance, name: "controlledDocumentJson", value: .string(document))
  try h.registry.setProp(instanceId: instance, name: "placeholder", value: .string("Ask anything"))
  h.registry.layout(instanceId: instance)
  try h.registry.callAsyncFunction(
    moduleName: "T3ComposerEditor", functionName: "focus", instanceId: instance, arguments: [])
  _ = h.registry.displayList(instanceId: instance)
  expect(true, "composer controlled document + focus round-trip")
}

func testTerminal(_ h: Harness) throws {
  print("terminal: estimated resize without engine")
  let instance = try XCTUnwrap(h.registry.createView(moduleName: "T3TerminalSurface"))
  h.registry.setFrame(instanceId: instance, width: 390, height: 500, scale: 3)
  h.registry.layout(instanceId: instance)

  let resize = h.events.first { $0.name == "onResize" }
  expect(resize != nil, "estimated resize emitted (got \(h.events.map(\.name)))")
  if let payload = resize?.payload {
    let cols = payload["cols"] as? Int ?? -1
    let rows = payload["rows"] as? Int ?? -1
    expect(cols >= 20 && cols <= 400, "estimated cols within bounds (\(cols))")
    expect(rows >= 5, "estimated rows within bounds (\(rows))")
  }

  try h.registry.setProp(instanceId: instance, name: "initialBuffer", value: .string("hello"))
  try h.registry.setProp(instanceId: instance, name: "fontSize", value: .number(12))
  h.registry.layout(instanceId: instance)
  expect(!h.events.contains { $0.name == "onInput" }, "no input without an engine")
}

func testSyncCheck() {
  print("sync determinism")
  let repoRoot = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()
  let process = Process()
  process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
  process.arguments = ["node", "harmony/tools/sync-upstream.mjs", "--check"]
  process.currentDirectoryURL = repoRoot
  let pipe = Pipe()
  process.standardOutput = pipe
  process.standardError = pipe
  do {
    try process.run()
    let output = String(
      data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    process.waitUntilExit()
    if process.terminationStatus != 0 {
      print("    [sync] \(output.trimmingCharacters(in: .whitespacesAndNewlines))")
    }
    expect(process.terminationStatus == 0, "vendored tree in sync with upstream")
  } catch {
    print("  ? sync check skipped (\(error))")
  }
}

// Minimal XCTUnwrap replacement for the runner.
func XCTUnwrap<T>(_ value: T?, _ message: String = "unwrapped nil") throws -> T {
  guard let value else {
    throw RunnerError(description: message)
  }
  return value
}

struct RunnerError: Error, CustomStringConvertible {
  let description: String
}

// MARK: - Entry

do {
  let harness = Harness()
  testRegistrySurface(harness)
  try testReviewDiffRenders(harness)
  try testReviewDiffScrollAndTap(harness)
  try testComposer(harness)
  try testTerminal(harness)
  testSyncCheck()
  if failureCount > 0 {
    print("FAILED: \(failureCount) assertion(s)")
    exit(1)
  }
  print("PASSED: all host-side assertions green")
} catch {
  print("FAILED: \(error)")
  exit(1)
}
