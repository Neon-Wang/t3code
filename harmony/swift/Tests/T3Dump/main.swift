// 快速 dump display list JSON
import Foundation
import T3SwiftCore
import T3Bridge
import T3CoreGraphics
import T3ExpoModulesCore

let registry = T3BridgeRegistry()
_ = registry.registerVendoredModules()
guard let instance = registry.createView(moduleName: "T3ReviewDiffSurface") else { fatalError() }
registry.setFrame(instanceId: instance, width: 390, height: 640, scale: 3)
try? registry.setProp(instanceId: instance, name: "rowHeight", value: .number(24))
let rows = """
[{"kind":"file","id":"f1","fileId":"f1","filePath":"Sources/App.swift","changeType":"modified","additions":3,"deletions":1},
{"kind":"hunk","id":"h1","fileId":"f1","text":"@@ -10,4 +10,6 @@"},
{"kind":"line","id":"l1","fileId":"f1","content":"let value = compute(input)","change":"new","newLineNumber":11}]
"""
try? registry.callAsyncFunction(moduleName: "T3ReviewDiffSurface", functionName: "setRowsJson", instanceId: instance, arguments: [.string(rows)])
registry.pumpMainQueue()
registry.layout(instanceId: instance)
if let list = registry.displayList(instanceId: instance),
   let data = try? JSONEncoder().encode(list),
   let json = String(data: data, encoding: .utf8) {
  print(json.prefix(3000))
}
