import Foundation
import T3CoreGraphics

// Gesture recognizers: state machines driven by the bridge's normalized touch
// stream. The embedder delivers touches in the module view's coordinate space;
// recognizers translate them into the same target/action calls the upstream
// code registers, including pan translation bookkeeping.

public enum UIGestureRecognizerState: Int {
  case possible, began, changed, ended, cancelled, failed
}

open class UIGestureRecognizer: NSObject {
  public var state: UIGestureRecognizerState = .possible
  public var cancelsTouchesInView = true
  public var delaysTouchesBegan = false
  public var delaysTouchesEnd = false
  public weak var delegate: UIGestureRecognizerDelegate?
  weak var view: UIView?

  public typealias TargetAction = (target: NSObject, action: Selector)
  public private(set) var targetActions: [TargetAction] = []

  public override convenience init() { self.init(target: nil, action: nil) }

  public init(target: Any?, action: Selector?) {
    super.init()
    if let target = target as? NSObject, let action {
      targetActions.append((target, action))
    }
  }

  public func addTarget(_ target: Any, action: Selector) {
    guard let object = target as? NSObject else { return }
    targetActions.append((object, action))
  }

  /// Dependency edges the vendored views register (tap requires long-press).
  /// A tap whose dependency is still possible/active fails instead of firing.
  private static var failureRequirements: [ObjectIdentifier: [WeakBox]] = [:]

  private struct WeakBox {
    weak var recognizer: UIGestureRecognizer?
  }

  public func require(toFail other: UIGestureRecognizer) {
    UIGestureRecognizer.failureRequirements[ObjectIdentifier(self), default: []]
      .append(WeakBox(recognizer: other))
  }

  /// UIKit semantics: a dependency only blocks while it is actively
  /// recognizing (began/changed). A merely *possible* dependency — e.g. a
  /// long-press waiting out its minimum duration — lets the tap through.
  func t3BlockedByFailureRequirement() -> Bool {
    let dependencies = UIGestureRecognizer.failureRequirements[ObjectIdentifier(self)] ?? []
    return dependencies.contains { box in
      guard let dependency = box.recognizer else { return false }
      return dependency.state == .began || dependency.state == .changed
    }
  }

  public func removeTarget(_ target: Any?, action: Selector?) {
    targetActions.removeAll { entry in
      (action == nil || entry.action == action) && (target == nil || entry.target === target as? NSObject)
    }
  }

  func setStateAndFire(_ newState: UIGestureRecognizerState) {
    state = newState
    fire()
  }

  func fire() {
    for entry in targetActions {
      t3SendAction(entry.target, entry.action, self)
    }
  }

  // Touch driving (bridge entry points).
  open func t3TouchBegan(at point: CGPoint) {}
  open func t3TouchMoved(to point: CGPoint) {}
  open func t3TouchEnded(at point: CGPoint) {}
  open func t3TouchCancelled() { state = .cancelled }
}

public protocol UIGestureRecognizerDelegate: AnyObject {
  func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool
  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
  ) -> Bool
}

extension UIGestureRecognizerDelegate {
  public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool { true }
  public func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
  ) -> Bool { false }
}

// MARK: - Tap

public final class UITapGestureRecognizer: UIGestureRecognizer {
  public var numberOfTapsRequired = 1
  public var numberOfTouchesRequired = 1
  private var beginPoint: CGPoint?

  public override func t3TouchBegan(at point: CGPoint) {
    beginPoint = point
  }

  public func location(in view: UIView?) -> CGPoint { beginPoint ?? .zero }

  public override func t3TouchEnded(at point: CGPoint) {
    defer { beginPoint = nil }
    guard let start = beginPoint else { return }
    let distance = hypot(point.x - start.x, point.y - start.y)
    guard distance <= 44 else { state = .failed; return }
    if t3BlockedByFailureRequirement() {
      state = .failed
      return
    }
    if delegate?.gestureRecognizerShouldBegin(self) == false {
      state = .failed
      return
    }
    setStateAndFire(.ended)
  }
}

// MARK: - Long press

public final class UILongPressGestureRecognizer: UIGestureRecognizer {
  public var minimumPressDuration: Double = 0.5
  public var allowableMovement: Double = 10
  private var beginPoint: CGPoint?
  private var lastPoint: CGPoint?
  private var fired = false

  public func location(in view: UIView?) -> CGPoint { lastPoint ?? beginPoint ?? .zero }

  public override func t3TouchBegan(at point: CGPoint) {
    beginPoint = point
    lastPoint = point
    fired = false
  }

  public override func t3TouchMoved(to point: CGPoint) {
    lastPoint = point
  }

  /// The embedder decides when a press qualifies as "long" (it owns the clock);
  /// it calls this between began and ended.
  public func t3HoldRecognized(at point: CGPoint) {
    guard !fired else { return }
    fired = true
    if delegate?.gestureRecognizerShouldBegin(self) == false { return }
    setStateAndFire(.began)
  }

  public override func t3TouchEnded(at point: CGPoint) {
    defer { beginPoint = nil }
    guard fired else { return }
    setStateAndFire(.ended)
  }
}

// MARK: - Pan

public final class UIPanGestureRecognizer: UIGestureRecognizer {
  public var maximumNumberOfTouches = UInt.max
  public var minimumNumberOfTouches = 1
  private var beginPoint: CGPoint?
  private var lastPoint: CGPoint?
  private var translationValue = CGPoint.zero

  public func translation(in view: UIView?) -> CGPoint { translationValue }
  public func setTranslation(_ translation: CGPoint, in view: UIView?) { translationValue = translation }
  public func velocity(in view: UIView?) -> CGPoint { .zero }
  public func location(in view: UIView?) -> CGPoint { lastPoint ?? beginPoint ?? .zero }

  public override func t3TouchBegan(at point: CGPoint) {
    beginPoint = point
    lastPoint = point
    translationValue = .zero
  }

  public override func t3TouchMoved(to point: CGPoint) {
    lastPoint = point
    guard let start = beginPoint else { return }
    translationValue = CGPoint(x: point.x - start.x, y: point.y - start.y)
    if state == .possible {
      guard delegate?.gestureRecognizerShouldBegin(self) != false else { return }
      setStateAndFire(.began)
    } else if state == .began || state == .changed {
      setStateAndFire(.changed)
    }
  }

  public override func t3TouchEnded(at point: CGPoint) {
    lastPoint = point
    if state == .began || state == .changed {
      setStateAndFire(.ended)
    } else {
      state = .failed
    }
  }
}
