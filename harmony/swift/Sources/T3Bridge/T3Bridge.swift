import Foundation
import T3CoreGraphics
import T3QuartzCore
import T3UIKit
import T3ExpoModulesCore

/// Generic module/view bridge.
///
/// One registry per app process: modules register once (their `definition()`
/// runs once, yielding the declarative surface), then the embedder creates view
/// instances, drives props/input/scroll/ticks, and pulls display lists. The
/// boundary is intentionally narrow and identical for every module — no
/// per-module glue anywhere on this line.
public final class T3BridgeRegistry {
  public static let shared = T3BridgeRegistry()

  private var modules: [String: ModuleDefinition] = [:]
  private var moduleTypes: [String: Module] = [:]
  private var instances: [String: T3ViewInstance] = [:]
  private var nextInstanceId = 0

  private let queue = DispatchQueue(label: "t3.bridge")

  // Events flow to the embedder through one channel, keyed by instance id.
  public var eventHandler: ((String, String, [String: Any]) -> Void)?

  public init() {
    EventDispatcher.sink = { [weak self] view, name, payload in
      guard let self, let instance = self.instance(for: view) else { return }
      self.eventHandler?(instance.id, name, payload)
    }
  }

  /// Register a module instance (construction goes through the generated
  /// per-module support files); returns the exported name.
  @discardableResult
  public func register(_ module: Module) -> String? {
    let definition = module.definition()
    guard !definition.name.isEmpty else { return nil }
    modules[definition.name] = definition
    moduleTypes[definition.name] = module
    return definition.name
  }

  public func moduleNames() -> [String] { Array(modules.keys) }

  public func constants(moduleName: String) -> [String: Any] {
    modules[moduleName]?.constants ?? [:]
  }

  // MARK: view instances

  public func createView(moduleName: String) -> String? {
    guard let definition = modules[moduleName], let viewDefinition = definition.viewDefinition else {
      return nil
    }
    return queue.sync {
      let instance = T3ViewInstance(
        id: "v\(nextInstanceId)", definition: definition, viewDefinition: viewDefinition)
      nextInstanceId += 1
      instances[instance.id] = instance
      instance.view.t3Mount(in: instance.window)
      return instance.id
    }
  }

  public func setProp(instanceId: String, name: String, value: T3Value) throws {
    try instance(instanceId)?.setProp(name: name, value: value)
  }

  public func callAsyncFunction(
    moduleName: String, functionName: String, instanceId: String?, arguments: [T3Value],
    completion: ((Promise.State) -> Void)? = nil
  ) throws {
    guard let definition = modules[moduleName] else { return }
    guard let function = definition.asyncFunctions.first(where: { $0.name == functionName }) else { return }
    let view = instanceId.flatMap { instances[$0]?.view }
    let promise = Promise(completion)
    try function.body(view, arguments, promise)
  }

  public func callSyncFunction(moduleName: String, functionName: String, arguments: [T3Value]) throws -> Any? {
    guard let definition = modules[moduleName],
      let function = definition.syncFunctions.first(where: { $0.name == functionName })
    else { return nil }
    return try function.body(arguments)
  }

  // MARK: main queue

  /// The vendored modules decode payloads on a background queue and apply the
  /// results on the main queue. The embedder owns the main queue: call this
  /// after every batch of calls (and once per frame) so pending main-queue
  /// work runs. On the host it steps the main run loop; on OpenHarmony the
  /// NAPI layer maps it to the JS-thread pump.
  public func pumpMainQueue(seconds: Double = 0.25) {
    let deadline = Date().addingTimeInterval(seconds)
    while Date() < deadline {
      RunLoop.main.run(until: Date().addingTimeInterval(0.02))
    }
  }

  // MARK: frame lifecycle

  public func layout(instanceId: String) {
    instance(instanceId)?.layout()
  }

  public func displayList(instanceId: String) -> T3DisplayList? {
    instance(instanceId)?.displayList()
  }

  public func destroyView(instanceId: String) {
    queue.sync { instances.removeValue(forKey: instanceId) }
  }

  // MARK: input & clock driving

  public func touchBegan(instanceId: String, x: Double, y: Double) {
    instance(instanceId)?.touchBegan(at: CGPoint(x: x, y: y))
  }

  public func touchMoved(instanceId: String, x: Double, y: Double) {
    instance(instanceId)?.touchMoved(to: CGPoint(x: x, y: y))
  }

  public func touchEnded(instanceId: String, x: Double, y: Double) {
    instance(instanceId)?.touchEnded(at: CGPoint(x: x, y: y))
  }

  public func tick(timestamp: Double) {
    CADisplayLink.tick(timestamp)
  }

  public func setFrame(instanceId: String, width: Double, height: Double, scale: Double) {
    instance(instanceId)?.setFrame(width: width, height: height, scale: scale)
  }

  public func setScrollOffset(instanceId: String, x: Double, y: Double) {
    instance(instanceId)?.setScrollOffset(x: x, y: y)
  }

  // MARK: private

  private func instance(_ id: String) -> T3ViewInstance? {
    queue.sync { instances[id] }
  }

  private func instance(for view: ExpoView) -> T3ViewInstance? {
    queue.sync { instances.values.first { $0.view === view } }
  }
}

/// One live module view: the mounted UIKit-shim tree plus its frame state.
public final class T3ViewInstance {
  public let id: String
  public let view: ExpoView
  let definition: ModuleDefinition
  let viewDefinition: AnyViewDefinition
  let window = UIWindow()

  init(id: String, definition: ModuleDefinition, viewDefinition: AnyViewDefinition) {
    self.id = id
    self.definition = definition
    self.viewDefinition = viewDefinition
    self.view = viewDefinition.createAnyView()
  }

  func setProp(name: String, value: T3Value) throws {
    try viewDefinition.setProp(name, value: value, on: view)
    view.setNeedsLayout()
    view.setNeedsDisplay()
    view.layoutIfNeeded()
  }

  func layout() {
    view.layoutIfNeeded()
  }

  func displayList() -> T3DisplayList? {
    let context = CGContext()
    let previous = CGContext.current
    CGContext.current = context
    drawTree(view)
    CGContext.current = previous
    return context.takeDisplayList()
  }

  private func drawTree(_ view: UIView) {
    view.draw(view.bounds)
    for subview in view.subviews where !subview.isHidden {
      CGContext.current?.saveGState()
      CGContext.current?.clip(to: subview.frame)
      drawTree(subview)
      CGContext.current?.restoreGState()
    }
  }

  // MARK: input

  func touchBegan(at point: CGPoint) {
    driveRecognizers(point) { recognizer, local in recognizer.t3TouchBegan(at: local) }
  }

  func touchMoved(to point: CGPoint) {
    driveRecognizers(point) { recognizer, local in recognizer.t3TouchMoved(to: local) }
  }

  func touchEnded(at point: CGPoint) {
    driveRecognizers(point) { recognizer, local in recognizer.t3TouchEnded(at: local) }
  }

  /// UIKit delivers touch coordinates in each recognizer's view space.
  private func driveRecognizers(
    _ point: CGPoint, _ drive: (UIGestureRecognizer, CGPoint) -> Void
  ) {
    for (recognizer, local) in collectRecognizers(view, point: point) {
      drive(recognizer, local)
    }
  }

  private func collectRecognizers(_ view: UIView, point: CGPoint)
    -> [(UIGestureRecognizer, CGPoint)]
  {
    var result: [(UIGestureRecognizer, CGPoint)] = []
    var queue: [UIView] = [view]
    while let current = queue.popLast() {
      let local = view.convert(point, to: current)
      if current.point(inside: local) {
        for recognizer in current.gestureRecognizers {
          result.append((recognizer, local))
        }
      }
      queue.append(contentsOf: current.subviews)
    }
    return result
  }

  // MARK: frame & scroll

  func setFrame(width: Double, height: Double, scale: Double) {
    view.frame = CGRect(x: 0, y: 0, width: width, height: height)
    view.contentScaleFactor = scale
    view.layer.contentsScale = scale
    view.setNeedsLayout()
    view.layoutIfNeeded()
  }

  func setScrollOffset(x: Double, y: Double) {
    var queue: [UIView] = [view]
    while let current = queue.popLast() {
      if let scroll = current as? UIScrollView {
        scroll.contentOffset = CGPoint(x: x, y: y)
      }
      queue.append(contentsOf: current.subviews)
    }
  }
}
