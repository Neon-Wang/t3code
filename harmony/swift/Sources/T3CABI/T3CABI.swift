import Foundation
import T3Bridge
import T3CoreGraphics
import T3ExpoModulesCore
import T3SwiftCore

// C ABI over the bridge registry — the single seam the NAPI layer calls.
// Everything crosses as primitives or JSON strings: the display list, event
// payloads, and module surfaces are already Codable/JSON-shaped by design.

@_cdecl("t3_initialize")
public func t3Initialize() -> UnsafeMutablePointer<CChar> {
  let names = T3BridgeRegistry.shared.registerVendoredModules()
  return t3DuplicateJSONString((names as NSArray).componentsJoined(by: ","))
}

@_cdecl("t3_module_names_json")
public func t3ModuleNamesJson() -> UnsafeMutablePointer<CChar> {
  let names = T3BridgeRegistry.shared.moduleNames()
  return t3DuplicateJSONString((names as NSArray).componentsJoined(by: ","))
}

@_cdecl("t3_constants_json")
public func t3ConstantsJson(_ moduleName: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>? {
  let name = String(cString: moduleName)
  guard JSONSerialization.isValidJSONObject(emptyObject) else { return nil }
  let constants = T3BridgeRegistry.shared.constants(moduleName: name)
  guard let data = try? JSONSerialization.data(withJSONObject: constants.bridgeSafe) else {
    return t3DuplicateJSONString("{}")
  }
  return t3DuplicateJSONString(String(data: data, encoding: .utf8) ?? "{}")
}

@_cdecl("t3_create_view")
public func t3CreateView(_ moduleName: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>? {
  let name = String(cString: moduleName)
  guard let id = T3BridgeRegistry.shared.createView(moduleName: name) else { return nil }
  return t3DuplicateJSONString(id)
}

@_cdecl("t3_set_prop")
public func t3SetProp(
  _ instanceId: UnsafePointer<CChar>, _ name: UnsafePointer<CChar>, _ valueJson: UnsafePointer<CChar>
) -> Bool {
  let id = String(cString: instanceId)
  let prop = String(cString: name)
  guard let data = String(cString: valueJson).data(using: .utf8),
    let raw = try? JSONSerialization.jsonObject(with: data)
  else { return false }
  let value: T3Value
  switch raw {
  case let string as String: value = .string(string)
  case let number as NSNumber:
    if number.t3IsBoolean { value = .boolean(number.boolValue) } else { value = .number(number.doubleValue) }
  case let bool as Bool: value = .boolean(bool)
  default: value = .null
  }
  do {
    try T3BridgeRegistry.shared.setProp(instanceId: id, name: prop, value: value)
    return true
  } catch {
    return false
  }
}

@_cdecl("t3_call_async")
public func t3CallAsync(
  _ moduleName: UnsafePointer<CChar>,
  _ functionName: UnsafePointer<CChar>,
  _ instanceId: UnsafePointer<CChar>?,
  _ argumentsJson: UnsafePointer<CChar>
) -> UnsafeMutablePointer<CChar>? {
  let module = String(cString: moduleName)
  let function = String(cString: functionName)
  let instance = instanceId.map { String(cString: $0) }
  guard let data = String(cString: argumentsJson).data(using: .utf8),
    let raw = try? JSONSerialization.jsonObject(with: data) as? [Any]
  else { return nil }
  let arguments: [T3Value] = raw.map { item in
    switch item {
    case let string as String: return .string(string)
    case let number as NSNumber:
      if number.t3IsBoolean { return .boolean(number.boolValue) }
      return .number(number.doubleValue)
    case let bool as Bool: return .boolean(bool)
    default: return .null
    }
  }
  var result: Promise.State = .pending
  do {
    try T3BridgeRegistry.shared.callAsyncFunction(
      moduleName: module, functionName: function, instanceId: instance, arguments: arguments
    ) { state in
      result = state
    }
  } catch {
    return t3DuplicateJSONString("{\"error\":\"\(error.localizedDescription)\"}")
  }
  switch result {
  case .resolved:
    return t3DuplicateJSONString("{\"ok\":true}")
  case .rejected(let reason):
    return t3DuplicateJSONString("{\"error\":\"\(reason.t3JSONEscaped)\"}")
  case .pending:
    return t3DuplicateJSONString("{\"pending\":true}")
  }
}

@_cdecl("t3_call_sync_json")
public func t3CallSyncJson(
  _ moduleName: UnsafePointer<CChar>, _ functionName: UnsafePointer<CChar>,
  _ argumentsJson: UnsafePointer<CChar>
) -> UnsafeMutablePointer<CChar>? {
  let module = String(cString: moduleName)
  let function = String(cString: functionName)
  guard let data = String(cString: argumentsJson).data(using: .utf8),
    let raw = try? JSONSerialization.jsonObject(with: data) as? [Any]
  else { return nil }
  let arguments: [T3Value] = raw.map { item in
    switch item {
    case let string as String: return .string(string)
    case let number as NSNumber: return .number(number.doubleValue)
    default: return .null
    }
  }
  guard let result = try? T3BridgeRegistry.shared.callSyncFunction(
    moduleName: module, functionName: function, arguments: arguments)
  else { return t3DuplicateJSONString("null") }
  if let string = result as? String {
    return t3DuplicateJSONString("\"\(string.t3JSONEscaped)\"")
  }
  return t3DuplicateJSONString("null")
}

@_cdecl("t3_display_list_json")
public func t3DisplayListJson(_ instanceId: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>? {
  let id = String(cString: instanceId)
  guard let list = T3BridgeRegistry.shared.displayList(instanceId: id),
    let data = try? JSONEncoder().encode(list),
    let json = String(data: data, encoding: .utf8)
  else { return nil }
  return t3DuplicateJSONString(json)
}

@_cdecl("t3_set_frame")
public func t3SetFrame(
  _ instanceId: UnsafePointer<CChar>, _ width: Double, _ height: Double, _ scale: Double
) {
  T3BridgeRegistry.shared.setFrame(
    instanceId: String(cString: instanceId), width: width, height: height, scale: scale)
}

@_cdecl("t3_set_scroll_offset")
public func t3SetScrollOffset(_ instanceId: UnsafePointer<CChar>, _ x: Double, _ y: Double) {
  T3BridgeRegistry.shared.setScrollOffset(instanceId: String(cString: instanceId), x: x, y: y)
}

@_cdecl("t3_touch")
public func t3Touch(
  _ instanceId: UnsafePointer<CChar>, _ phase: Int32, _ x: Double, _ y: Double
) {
  let id = String(cString: instanceId)
  switch phase {
  case 0: T3BridgeRegistry.shared.touchBegan(instanceId: id, x: x, y: y)
  case 1: T3BridgeRegistry.shared.touchMoved(instanceId: id, x: x, y: y)
  default: T3BridgeRegistry.shared.touchEnded(instanceId: id, x: x, y: y)
  }
}

@_cdecl("t3_tick")
public func t3Tick(_ timestamp: Double) {
  T3BridgeRegistry.shared.tick(timestamp: timestamp)
}

@_cdecl("t3_pump_main_queue")
public func t3PumpMainQueue(_ seconds: Double) {
  T3BridgeRegistry.shared.pumpMainQueue(seconds: seconds)
}

@_cdecl("t3_destroy_view")
public func t3DestroyView(_ instanceId: UnsafePointer<CChar>) {
  T3BridgeRegistry.shared.destroyView(instanceId: String(cString: instanceId))
}

@_cdecl("t3_free_string")
public func t3FreeString(_ pointer: UnsafeMutablePointer<CChar>?) {
  pointer.map { free($0) }
}

@_cdecl("t3_set_event_sink")
public func t3SetEventSink(
  _ sink: @convention(c) (UnsafePointer<CChar>, UnsafePointer<CChar>, UnsafePointer<CChar>) -> Void
) {
  T3BridgeRegistry.shared.eventHandler = { instance, name, payload in
    var bridgeable: [String: Any] = [:]
    for (key, value) in payload {
      if JSONSerialization.isValidJSONObject([value]) || value is NSNull {
        bridgeable[key] = value
      } else if let describable = value as? CustomStringConvertible {
        bridgeable[key] = describable.description
      }
    }
    guard let data = try? JSONSerialization.data(withJSONObject: bridgeable),
      let json = String(data: data, encoding: .utf8)
    else { return }
    instance.withCString { instanceC in
      name.withCString { nameC in
        json.withCString { jsonC in
          sink(instanceC, nameC, jsonC)
        }
      }
    }
  }
}

// MARK: - Helpers

private let emptyObject: [String: Any] = [:]

func t3DuplicateJSONString(_ string: String) -> UnsafeMutablePointer<CChar> {
  let buffer = strdup(string)
  return buffer ?? UnsafeMutablePointer<CChar>(bitPattern: 1)!
}

extension String {
  var t3JSONEscaped: String {
    let data = try? JSONSerialization.data(withJSONObject: [self])
    guard let data, let array = try? JSONSerialization.jsonObject(with: data) as? [String] else {
      return self
    }
    return array.first ?? self
  }
}

extension NSNumber {
  /// JSON booleans arrive as NSNumber; distinguish from 0/1 integers the way
  /// JSONSerialization round-trips do (objCType "c" for booleans).
  var t3IsBoolean: Bool {
    CFGetTypeID(self) == CFBooleanGetTypeID()
  }
}

extension Dictionary where Key == String, Value == Any {
  /// NSNumber-backed values only: constants crossing the C boundary must be
  /// plain JSON types.
  var bridgeSafe: [String: Any] {
    compactMapValues { value -> Any? in
      switch value {
      case let number as NSNumber: return number
      case let string as String: return string
      case let bool as Bool: return bool
      default: return nil
      }
    }
  }
}
