// ExpoModulesCore re-exports the platform umbrella on iOS; mirror it so the
// module-definition sources (which import only this module) see the vocabulary.
@_exported import Foundation
@_exported import T3UIKit
import Foundation
import T3UIKit

// Recording implementation of the Expo modules DSL.
//
// Ground truth mirrors expo-modules-core 57: the DSL is a set of *global
// factory functions* (Name/Constants/View/Prop/Events/ViewName/Function/
// AsyncFunction) whose results are collected by @resultBuilder closures —
// `ModuleDefinitionBuilder` on Module.definition(), `ViewDefinitionBuilder`
// inside View. The vendored module-definition files are compiled unmodified;
// running them once at registration yields a declarative registry (props,
// events, async functions, constants) that the bridge introspects. An upstream
// prop or function addition therefore reaches Harmony with zero glue changes.

// MARK: - Context & promise

public final class AppContext: NSObject {
  /// The utilities surface the vendored control module reads (current presenter).
  public final class Utilities: NSObject {
    public var currentViewControllerProvider: (() -> UIViewController?)?

    public func currentViewController() -> UIViewController? {
      currentViewControllerProvider?()
    }
  }

  public var utilities: Utilities?

  public override init() { super.init() }
}

/// Expo promise surface used by presentation async functions.
public final class Promise: NSObject {
  public enum State: Sendable {
    case pending
    case resolved(Any?)
    case rejected(String)
  }

  public private(set) var state: State = .pending
  var completionHandlers: [(State) -> Void] = []

  public init(_ completion: ((State) -> Void)? = nil) {
    if let completion { completionHandlers.append(completion) }
  }

  public func resolve(_ value: Any? = nil) { finish(.resolved(value)) }
  public func reject(_ reason: String) { finish(.rejected(reason)) }
  public func reject(_ error: Error) { finish(.rejected(error.localizedDescription)) }
  public func reject(code: Int, message: String) { finish(.rejected(message)) }

  private func finish(_ final: State) {
    guard case .pending = state else { return }
    state = final
    for handler in completionHandlers { handler(final) }
    completionHandlers.removeAll()
  }
}

// MARK: - Security surface

#if canImport(Security)
@_exported import Security

/// Host-compiler workaround companion (see tools/sync-upstream.mjs): iterating
/// this value replaces the in-closure array literal of Security constants.
public let t3KeychainClassConstants: [CFString] = [
  kSecClassGenericPassword, kSecClassInternetPassword,
]
#else
// corelibs-foundation builds have no Security framework; the constants are
// inert on Harmony (the showcase capture path never runs there).
public let kSecClass: CFString = "class" as CFString
public let kSecClassGenericPassword: CFString = "genp" as CFString
public let kSecClassInternetPassword: CFString = "inet" as CFString

public let t3KeychainClassConstants: [CFString] = [
  kSecClassGenericPassword, kSecClassInternetPassword,
]

public typealias OSStatus = Int32
public let errSecItemNotFound: OSStatus = -25300

public func SecItemDelete(_ query: CFDictionary?) -> OSStatus { errSecItemNotFound }
#endif

// MARK: - Events

/// Event dispatch keyed by the property name the JS side references (Expo
/// matches dispatchers to event names by the property name on the view). Each
/// view instance owns its dispatchers; binding walks the instance's stored
/// properties once at init and stamps name + owner — no per-class caches.
public final class EventDispatcher: NSObject {
  public static var sink: ((ExpoView, String, [String: Any]) -> Void)?

  public override init() { super.init() }

  weak var ownerView: ExpoView?
  var eventName: String?

  public func callAsFunction(_ payload: [String: Any] = [:]) {
    guard let owner = ownerView, let name = eventName else { return }
    EventDispatcher.sink?(owner, name, payload)
  }

  static func bindOwner(_ view: ExpoView) {
    var mirror: Mirror? = Mirror(reflecting: view)
    while let current = mirror {
      for child in current.children {
        if let name = child.label, let dispatcher = child.value as? EventDispatcher,
          dispatcher.ownerView == nil
        {
          dispatcher.ownerView = view
          dispatcher.eventName = name
        }
      }
      mirror = current.superclassMirror
    }
  }
}

// MARK: - View base

open class ExpoView: UIView {
  public let appContext: AppContext?

  public required init(appContext: AppContext? = nil) {
    self.appContext = appContext
    super.init(frame: .zero)
    EventDispatcher.bindOwner(self)
  }

  public override init(frame: CGRect) {
    self.appContext = nil
    super.init(frame: frame)
    EventDispatcher.bindOwner(self)
  }

  public required init?(coder: NSCoder) {
    self.appContext = nil
    super.init(coder: coder)
    EventDispatcher.bindOwner(self)
  }
}

// MARK: - Module

/// Mirrors the upstream shape: a protocol, so conforming module classes write
/// `func definition()` without `override`. Builders propagate to conformances.
public protocol Module: AnyObject {
  @ModuleDefinitionBuilder
  func definition() -> ModuleDefinition
}

extension Module {
  public var appContext: AppContext? { T3ModuleStorage.appContext(for: self) }
}

enum T3ModuleStorage {
  private static var contexts: [ObjectIdentifier: AppContext] = [:]

  func callAsFunction() {}

  static func appContext(for module: AnyObject) -> AppContext? {
    contexts[ObjectIdentifier(module)]
  }

  static func setContext(_ context: AppContext?, for module: AnyObject) {
    contexts[ObjectIdentifier(module)] = context
  }
}

// MARK: - Definition components

public protocol AnyDefinitionComponent: AnyObject {}

public final class NameDefinition: AnyDefinitionComponent {
  public let name: String
  init(name: String) { self.name = name }
}

public final class ConstantsDefinition: AnyDefinitionComponent {
  public let constants: [String: Any]
  init(constants: [String: Any]) { self.constants = constants }
}

public struct EventsDefinition {
  public let names: [String]
}

public struct ViewNameDefinition {
  public let name: String
}

public protocol AnyConcreteViewProp: AnyObject {
  var name: String { get }
  func apply(_ view: ExpoView, _ value: T3Value)
}

public final class ConcreteViewProp<ViewType: ExpoView, PropType>: AnyDefinitionComponent, AnyConcreteViewProp {
  public let name: String
  public let setter: (ViewType, PropType) -> Void

  init(name: String, setter: @escaping (ViewType, PropType) -> Void) {
    self.name = name
    self.setter = setter
  }

  public func apply(_ view: ExpoView, _ value: T3Value) {
    guard let typed = view as? ViewType else { return }
    setter(typed, T3Value.decode(PropType.self, value))
  }
}

public final class ViewDefinition<ViewType: ExpoView>: AnyDefinitionComponent {
  public let viewType: ViewType.Type
  public private(set) var viewName: String?
  public private(set) var props: [String: (ExpoView, T3Value) throws -> Void] = [:]
  public private(set) var eventNames: [String] = []
  public private(set) var functions: [AnyAsyncFunction] = []

  init(_ viewType: ViewType.Type) { self.viewType = viewType }

  func addProp<PropType>(_ name: String, setter: @escaping (ViewType, PropType) -> Void) {
    props[name] = { view, value in
      guard let typed = view as? ViewType else { return }
      setter(typed, T3Value.decode(PropType.self, value))
    }
  }

  func addAnyProp(_ prop: AnyConcreteViewProp) {
    props[prop.name] = { view, value in
      prop.apply(view, value)
    }
  }

  func setViewName(_ name: String) { viewName = name }
  func addEvents(_ names: [String]) { eventNames.append(contentsOf: names) }
  func addFunction(_ function: AnyAsyncFunction) { functions.append(function) }

  public func createView() -> ViewType { ViewType(appContext: nil) }
}

public final class AnyAsyncFunction: AnyDefinitionComponent {
  public let name: String
  public let body: (ExpoView?, [T3Value], Promise) throws -> Void

  init(name: String, body: @escaping (ExpoView?, [T3Value], Promise) throws -> Void) {
    self.name = name
    self.body = body
  }
}

public final class AnySyncFunction: AnyDefinitionComponent {
  public let name: String
  public let body: ([T3Value]) throws -> Any?

  init(name: String, body: @escaping ([T3Value]) throws -> Any?) {
    self.name = name
    self.body = body
  }
}

// MARK: - Module definition

public final class ModuleDefinition: NSObject {
  public private(set) var name: String = ""
  public private(set) var constants: [String: Any] = [:]
  public private(set) var viewDefinition: AnyViewDefinition?
  public private(set) var asyncFunctions: [AnyAsyncFunction] = []
  public private(set) var syncFunctions: [AnySyncFunction] = []

  init(components: [AnyDefinitionComponent]) {
    super.init()
    for component in components {
      switch component {
      case let named as NameDefinition:
        name = named.name
      case let constants as ConstantsDefinition:
        self.constants.merge(constants.constants) { _, new in new }
      case let view as AnyViewDefinition:
        viewDefinition = view
        asyncFunctions.append(contentsOf: view.anyFunctions)
      case let asyncFunction as AnyAsyncFunction:
        asyncFunctions.append(asyncFunction)
      case let syncFunction as AnySyncFunction:
        syncFunctions.append(syncFunction)
      default:
        break
      }
    }
  }
}

public protocol AnyViewDefinition: AnyObject {
  var anyViewName: String? { get }
  var anyEventNames: [String] { get }
  var anyFunctions: [AnyAsyncFunction] { get }
  func setProp(_ name: String, value: T3Value, on view: ExpoView) throws
  func createAnyView() -> ExpoView
}

extension ViewDefinition: AnyViewDefinition {
  public var anyViewName: String? { viewName }
  public var anyEventNames: [String] { eventNames }
  public var anyFunctions: [AnyAsyncFunction] { functions }

  public func setProp(_ name: String, value: T3Value, on view: ExpoView) throws {
    guard let setter = props[name] else { return }
    try setter(view, value)
  }

  public func createAnyView() -> ExpoView { createView() }
}

// MARK: - Builders

@resultBuilder
public struct ModuleDefinitionBuilder {
  public static func buildExpression(_ component: AnyDefinitionComponent) -> AnyDefinitionComponent { component }
  public static func buildBlock(_ components: AnyDefinitionComponent...) -> ModuleDefinition {
    ModuleDefinition(components: components)
  }

  public static func buildBlock() -> ModuleDefinition {
    ModuleDefinition(components: [])
  }
}

@resultBuilder
public struct ViewDefinitionBuilder<ViewType: ExpoView> {
  public static func buildExpression<P>(_ prop: ConcreteViewProp<ViewType, P>) -> ConcreteViewProp<ViewType, P> { prop }
  public static func buildExpression(_ events: EventsDefinition) -> EventsDefinition { events }
  public static func buildExpression(_ viewName: ViewNameDefinition) -> ViewNameDefinition { viewName }
  public static func buildExpression(_ function: AnyAsyncFunction) -> AnyAsyncFunction { function }
  public static func buildBlock(
    _ elements: AnyViewDefinitionElement...
  ) -> [AnyViewDefinitionElement] { elements }
}

public protocol AnyViewDefinitionElement {}

extension ConcreteViewProp: AnyViewDefinitionElement {}
extension EventsDefinition: AnyViewDefinitionElement {}
extension ViewNameDefinition: AnyViewDefinitionElement {}
extension AnyAsyncFunction: AnyViewDefinitionElement {

  /// Queue affinity is recorded but not enforced: the bridge is single-threaded.
  @discardableResult
  public func runOnQueue(_ queue: DispatchQueue) -> AnyAsyncFunction { self }
}

// MARK: - Global DSL factories

public func Name(_ name: String) -> NameDefinition { NameDefinition(name: name) }

public func Constants(_ constants: [String: Any]) -> ConstantsDefinition {
  ConstantsDefinition(constants: constants)
}

public func View<ViewType: ExpoView>(
  _ viewType: ViewType.Type,
  @ViewDefinitionBuilder<ViewType> _ elements: @escaping () -> [AnyViewDefinitionElement]
) -> ViewDefinition<ViewType> {
  let definition = ViewDefinition(viewType)
  for element in elements() {
    switch element {
    case let prop as AnyConcreteViewProp:
      definition.addAnyProp(prop)
    case let events as EventsDefinition:
      definition.addEvents(events.names)
    case let viewName as ViewNameDefinition:
      definition.setViewName(viewName.name)
    case let function as AnyAsyncFunction:
      definition.addFunction(function)
    default:
      break
    }
  }
  return definition
}

public func Prop<ViewType: ExpoView, PropType>(
  _ name: String,
  _ setter: @escaping (ViewType, PropType) -> Void
) -> ConcreteViewProp<ViewType, PropType> {
  ConcreteViewProp(name: name, setter: setter)
}

public func Events(_ names: String...) -> EventsDefinition { EventsDefinition(names: names) }

/// Module lifecycle hook (no-op on the shim: the bridge drives lifetimes).
public final class OnDestroyDefinition: AnyDefinitionComponent, AnyViewDefinitionElement {}

public func OnDestroy(_ closure: @escaping () -> Void) -> OnDestroyDefinition {
  OnDestroyDefinition()
}

public func OnCreate(_ closure: @escaping () -> Void) -> OnDestroyDefinition {
  OnDestroyDefinition()
}

public func ViewName(_ name: String) -> ViewNameDefinition { ViewNameDefinition(name: name) }

// MARK: AsyncFunction — view variants

public func AsyncFunction<ViewType: ExpoView>(
  _ name: String, _ body: @escaping (ViewType) -> Void
) -> AnyAsyncFunction {
  AnyAsyncFunction(name: name) { view, _, _ in
    guard let view = view as? ViewType else { return }
    body(view)
  }
}

public func AsyncFunction<ViewType: ExpoView, A>(
  _ name: String, _ body: @escaping (ViewType, A) -> Void
) -> AnyAsyncFunction {
  AnyAsyncFunction(name: name) { view, arguments, _ in
    guard let view = view as? ViewType, arguments.count >= 1 else { return }
    body(view, T3Value.decode(A.self, arguments[0]))
  }
}

public func AsyncFunction<ViewType: ExpoView, A, B>(
  _ name: String, _ body: @escaping (ViewType, A, B) -> Void
) -> AnyAsyncFunction {
  AnyAsyncFunction(name: name) { view, arguments, _ in
    guard let view = view as? ViewType, arguments.count >= 2 else { return }
    body(view, T3Value.decode(A.self, arguments[0]), T3Value.decode(B.self, arguments[1]))
  }
}

// MARK: AsyncFunction — module-level variants

public func AsyncFunction<R>(
  _ name: String, _ body: @escaping () -> R
) -> AnyAsyncFunction {
  AnyAsyncFunction(name: name) { _, _, promise in
    promise.resolve(body())
  }
}

public func AsyncFunction<A>(
  _ name: String, _ body: @escaping (A) -> Void
) -> AnyAsyncFunction {
  AnyAsyncFunction(name: name) { _, arguments, _ in
    guard arguments.count >= 1 else { return }
    body(T3Value.decode(A.self, arguments[0]))
  }
}

public func AsyncFunction<A, B>(
  _ name: String, _ body: @escaping (A, B) -> Void
) -> AnyAsyncFunction {
  AnyAsyncFunction(name: name) { _, arguments, _ in
    guard arguments.count >= 2 else { return }
    body(T3Value.decode(A.self, arguments[0]), T3Value.decode(B.self, arguments[1]))
  }
}

public func AsyncFunction<A, B, C>(
  _ name: String, _ body: @escaping (A, B, C, Promise) throws -> Void
) -> AnyAsyncFunction {
  AnyAsyncFunction(name: name) { _, arguments, promise in
    guard arguments.count >= 3 else { return promise.reject("missing arguments") }
    do {
      try body(
        T3Value.decode(A.self, arguments[0]), T3Value.decode(B.self, arguments[1]),
        T3Value.decode(C.self, arguments[2]), promise)
    } catch {
      promise.reject(error)
    }
  }
}

public func AsyncFunction<A, B, C, D>(
  _ name: String, _ body: @escaping (A, B, C, D, Promise) throws -> Void
) -> AnyAsyncFunction {
  AnyAsyncFunction(name: name) { _, arguments, promise in
    guard arguments.count >= 4 else { return promise.reject("missing arguments") }
    do {
      try body(
        T3Value.decode(A.self, arguments[0]), T3Value.decode(B.self, arguments[1]),
        T3Value.decode(C.self, arguments[2]), T3Value.decode(D.self, arguments[3]), promise)
    } catch {
      promise.reject(error)
    }
  }
}

// MARK: Function (sync)

/// Concrete Void overload: generic R inference for multi-statement void
/// closures inside result builders fails opaquely, so cover it explicitly.
public func Function(
  _ name: String, _ body: @escaping () -> Void
) -> AnySyncFunction {
  AnySyncFunction(name: name) { _ in body() }
}

public func Function<R>(
  _ name: String, _ body: @escaping () -> R
) -> AnySyncFunction {
  AnySyncFunction(name: name) { _ in body() }
}

public func Function<A, R>(
  _ name: String, _ body: @escaping (A) -> R
) -> AnySyncFunction {
  AnySyncFunction(name: name) { arguments in
    guard arguments.count >= 1 else { return nil }
    return body(T3Value.decode(A.self, arguments[0]))
  }
}

// MARK: - Bridge values

public enum T3Value {
  case string(String)
  case number(Double)
  case boolean(Bool)
  case null

  public static func decode<A>(_ type: A.Type, _ value: T3Value) -> A {
    let decoded: Any
    if type == Void.self {
      decoded = ()
    } else if type == String.self, case .string(let string) = value {
      decoded = string
    } else if type == URL.self, case .string(let string) = value {
      decoded = URL(string: string) ?? URL(fileURLWithPath: string)
    } else if type == Double.self, case .number(let double) = value {
      decoded = double
    } else if type == Int.self, case .number(let double) = value {
      decoded = Int(double)
    } else if type == CGFloat.self, case .number(let double) = value {
      decoded = CGFloat(double)
    } else if type == Bool.self, case .boolean(let bool) = value {
      decoded = bool
    } else if type == Bool.self, case .number(let double) = value {
      decoded = double != 0
    } else if type == [String].self, case .string(let string) = value {
      decoded = string.split(separator: "\u{1F}").map(String.init)
    } else if type == [String].self, case .null = value {
      decoded = [String]()
    } else if case .null = value {
      decoded = decodableNull(type)
    } else {
      decoded = rawFallback(value)
    }
    return decoded as! A
  }

  private static func decodableNull(_ type: Any) -> Any {
    if let optional = type as? ExpressibleByNilLiteral.Type { return optional.init(nilLiteral: ()) }
    return ()
  }

  private static func rawFallback(_ value: T3Value) -> Any {
    switch value {
    case .string(let string): return string
    case .number(let double): return double
    case .boolean(let bool): return bool
    case .null: return ()
    }
  }
}
