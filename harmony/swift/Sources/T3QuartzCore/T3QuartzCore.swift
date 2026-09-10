import Foundation
import T3CoreGraphics

/// Monotonic media clock for animation drivers.
public func CACurrentMediaTime() -> Double { Date().timeIntervalSinceReferenceDate }

/// CALayer shim: a retained node the bridge can invalidate. Layer *content* is
/// never rendered by the shim — drawing flows through the recording CGContext —
/// but the terminal uses layer frames/contentsScale to align its surfaces, so
/// the bookkeeping must exist.
open class CALayer {
  public var frame: CGRect = .zero
  public var contentsScale: Double = 1
  public var sublayers: [CALayer]?
  public private(set) var needsDisplay = true

  public init() {}

  public func setNeedsDisplay() { needsDisplay = true }
  public func addSublayer(_ layer: CALayer) { sublayers = (sublayers ?? []) + [layer] }
}

/// CATransaction shim. The upstream code only uses it to disable implicit
/// animations around frame updates; the display list is transaction-free.
public enum CATransaction {
  public static func begin() {}
  public static func commit() {}
  public static func setDisableActions(_ disabled: Bool) {}
  public static func setCompletionBlock(_ block: (() -> Void)? ) { block?() }
}

/// CADisplayLink shim driven by the embedder's frame clock: the bridge pumps
/// `tick()` once per vsync from the platform render loop, which fires the
/// registered target/actions (used by the diff view's horizontal deceleration).
public final class CADisplayLink: NSObject {
  public static var allLinks: [CADisplayLink] = []
  public private(set) var target: AnyObject?
  public private(set) var selector: Selector?
  public var isPaused = false
  public var preferredFramesPerSecond: Int = 60
  public var timestamp: Double = 0

  public static func tick(_ timestamp: Double) {
    for link in allLinks where !link.isPaused {
      link.timestamp = timestamp
      guard let target = link.target, let selector = link.selector else { continue }
      t3SendAction(target, selector, link)
    }
  }

  public init(target: Any, selector sel: Selector) {
    // `Any` mirrors the UIKit signature; the shim stores the object reference.
    if let object = target as? NSObject {
      self.target = object
      self.selector = sel
    }
    super.init()
    CADisplayLink.allLinks.append(self)
  }

  deinit { CADisplayLink.allLinks.removeAll { $0 === self } }

  public func add(to runLoop: RunLoop, forMode mode: RunLoop.Mode) {}
  public func add(toRunloop runLoop: RunLoop, forMode mode: RunLoop.Mode) {}
  public func invalidate() {
    isPaused = true
    target = nil
    selector = nil
    CADisplayLink.allLinks.removeAll { $0 === self }
  }
}
