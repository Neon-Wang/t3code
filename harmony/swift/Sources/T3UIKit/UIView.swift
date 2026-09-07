import Foundation
import T3CoreGraphics
import T3QuartzCore

// MARK: - Responder

open class UIResponder: NSObject {
  weak static var t3CurrentFirstResponder: UIResponder?

  open var canBecomeFirstResponder: Bool { false }

  open var next: UIResponder? { nil }

  open var keyCommands: [UIKeyCommand]? { nil }

  @discardableResult open func becomeFirstResponder() -> Bool {
    UIResponder.t3CurrentFirstResponder = self
    return true
  }

  @discardableResult open func resignFirstResponder() -> Bool {
    if UIResponder.t3CurrentFirstResponder === self {
      UIResponder.t3CurrentFirstResponder = nil
    }
    return true
  }

  open var isFirstResponder: Bool { UIResponder.t3CurrentFirstResponder === self }
}

// MARK: - Window / screen

public final class UIScreen: NSObject {
  public final class UICoordinateSpace: NSObject {
    public var bounds: CGRect = .zero
  }

  public static let main = UIScreen()
  public var bounds: CGRect = CGRect(x: 0, y: 0, width: 402, height: 874)
  public var scale: Double = 3
  public var nativeScale: Double = 3
  public let coordinateSpace = UICoordinateSpace()
  public var nativeBounds: CGRect { CGRect(x: 0, y: 0, width: bounds.width * scale, height: bounds.height * scale) }
}

public class UIWindow: UIView {
  public var screen: UIScreen { UIScreen.main }
  public weak var rootViewController: UIViewController?
  public func makeKeyAndVisible() {
    UIApplication.t3KeyWindow = self
  }
}

// MARK: - Content mode / hierarchy

public enum UIViewContentMode: Int {
  case scaleToFill, scaleAspectFit, scaleAspectFill, redraw, center, top, bottom, left, right
}

public struct UIViewAutoresizing: OptionSet, Sendable {
  public init(rawValue: Int) { self.rawValue = rawValue }
  public let rawValue: Int
  public static let none = UIViewAutoresizing(rawValue: 0)
  public static let flexibleLeftMargin = UIViewAutoresizing(rawValue: 1 << 0)
  public static let flexibleWidth = UIViewAutoresizing(rawValue: 1 << 1)
  public static let flexibleRightMargin = UIViewAutoresizing(rawValue: 1 << 2)
  public static let flexibleTopMargin = UIViewAutoresizing(rawValue: 1 << 3)
  public static let flexibleHeight = UIViewAutoresizing(rawValue: 1 << 4)
  public static let flexibleBottomMargin = UIViewAutoresizing(rawValue: 1 << 5)
}

open class UIView: UIResponder {
  public var frame: CGRect {
    didSet {
      if oldValue.size != frame.size {
        setNeedsLayout()
        setNeedsDisplay()
      }
    }
  }

  public var bounds: CGRect {
    get { CGRect(x: 0, y: 0, width: frame.width, height: frame.height) }
    set { frame = CGRect(x: frame.origin.x, y: frame.origin.y, width: newValue.width, height: newValue.height) }
  }

  public var center: CGPoint {
    get { CGPoint(x: frame.midX, y: frame.midY) }
    set { frame.origin.x = newValue.x - frame.width / 2; frame.origin.y = newValue.y - frame.height / 2 }
  }

  public var backgroundColor: UIColor? { didSet { setNeedsDisplay() } }
  public var tintColor: UIColor?
  public var traitCollection = UITraitCollection()
  public var isHidden = false
  public var alpha: Double = 1
  public var clipsToBounds = false
  public var isUserInteractionEnabled = true
  public var isOpaque = false
  public var contentMode: UIViewContentMode = .scaleToFill
  public var contentScaleFactor: Double = UIScreen.main.scale
  public var accessibilityIdentifier: String?
  public var isAccessibilityElement = false
  public var accessibilityElementsHidden = false
  public var autoresizesSubviews = true
  public var autoresizingMask: UIViewAutoresizing = .none
  public var translatesAutoresizingMaskIntoConstraints = true

  public private(set) weak var superview: UIView?
  public private(set) var subviews: [UIView] = []
  public let layer = CALayer()

  public private(set) weak var window: UIWindow?

  /// Rendered exposure of the first-responder query without leaking the class.
  public var t3IsFirstResponder: Bool { isFirstResponder }

  public init(frame: CGRect) {
    self.frame = frame
    super.init()
    self.layer.contentsScale = contentScaleFactor
  }

  public override convenience init() { self.init(frame: .zero) }

  public required init?(coder: NSCoder) { nil }

  /// Hit-test guard the content views override (pan-vs-scroll arbitration).
  open func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool { true }

  // MARK: hierarchy

  public func addSubview(_ view: UIView) {
    insertSubview(view, at: subviews.count)
  }

  public func insertSubview(_ view: UIView, at index: Int) {
    view.removeFromSuperview()
    view.superview = self
    subviews.insert(view, at: min(index, subviews.count))
    view.didMoveToWindowIfMounted()
    setNeedsLayout()
  }

  public func removeFromSuperview() {
    guard let parent = superview else { return }
    parent.subviews.removeAll { $0 === self }
    superview = nil
    unmountTree()
    parent.setNeedsLayout()
  }

  /// The bridge mounts the root view of a module instance; mounting propagates
  /// the window association so `didMoveToWindow` fires exactly once per attach.
  public func t3Mount(in window: UIWindow) {
    self.window = window
    didMoveToWindowIfMounted()
  }

  private func unmountTree() {
    window = nil
    for subview in subviews { subview.unmountTree() }
  }

  private func didMoveToWindowIfMounted() {
    if window != nil { didMoveToWindow() }
    for subview in subviews { subview.didMoveToWindowIfMounted() }
  }

  open func didMoveToWindow() {}

  // MARK: layout

  public func setNeedsLayout() {
    T3LayoutScheduler.shared.needsLayout.insert(ObjectIdentifier(self))
    superview?.setNeedsLayout()
  }

  public func layoutIfNeeded() {
    T3LayoutScheduler.shared.runPass(root: self)
  }

  open func layoutSubviews() {}

  // MARK: drawing

  public func setNeedsDisplay() {
    layer.setNeedsDisplay()
    for subview in subviews { subview.setNeedsDisplay() }
  }

  public func setNeedsDisplay(_ rect: CGRect) { setNeedsDisplay() }

  /// Called by the bridge draw pass when the layer is dirty. The upstream diff
  /// renderer implements this; the default view just paints its background.
  open func draw(_ rect: CGRect) {
    guard let background = backgroundColor else { return }
    guard let context = CGContext.current else { return }
    context.setFillColor(background.cgColor)
    context.fill(bounds)
  }

  // MARK: gestures & hit testing

  public private(set) var gestureRecognizers: [UIGestureRecognizer] = []

  public func addGestureRecognizer(_ recognizer: UIGestureRecognizer) {
    recognizer.view = self
    gestureRecognizers.append(recognizer)
  }

  public func removeGestureRecognizer(_ recognizer: UIGestureRecognizer) {
    gestureRecognizers.removeAll { $0 === recognizer }
    recognizer.view = nil
  }

  open func hitTest(_ point: CGPoint) -> UIView? {
    guard !isHidden, isUserInteractionEnabled, self.point(inside: point) else { return nil }
    for subview in subviews.reversed() {
      let converted = CGPoint(x: point.x - subview.frame.minX, y: point.y - subview.frame.minY)
      if let hit = subview.hitTest(converted) { return hit }
    }
    return self
  }

  open func point(inside point: CGPoint) -> Bool {
    bounds.contains(point)
  }

  /// General coordinate conversion via absolute (root-space) positions —
  /// handles non-ancestor targets, which the simple ancestor-walk cannot.
  private var t3AbsoluteOrigin: CGPoint {
    var x: Double = 0
    var y: Double = 0
    var current: UIView? = self
    while let view = current {
      x += view.frame.minX
      y += view.frame.minY
      current = view.superview
    }
    return CGPoint(x: x, y: y)
  }

  open func convert(_ point: CGPoint, to view: UIView?) -> CGPoint {
    guard let view, view !== self else { return point }
    let from = t3AbsoluteOrigin
    let to = view.t3AbsoluteOrigin
    return CGPoint(x: point.x + from.x - to.x, y: point.y + from.y - to.y)
  }

  open func convert(_ point: CGPoint, from view: UIView?) -> CGPoint {
    guard let view else { return point }
    return view.convert(point, to: self)
  }

  public var t3Description: String { "\(type(of: self)) frame=\(frame)" }
}

// MARK: - Layout scheduler (internal)

final class T3LayoutScheduler {
  static let shared = T3LayoutScheduler()
  var needsLayout = Set<ObjectIdentifier>()

  func runPass(root: UIView) {
    var queue: [UIView] = []
    collect(root, into: &queue)
    for view in queue {
      view.layer.frame = view.frame
      view.layoutSubviews()
      needsLayout.remove(ObjectIdentifier(view))
    }
    NSLayoutConstraintSolver.applyPendingConstraints(around: root)
    for view in queue {
      view.layer.frame = view.frame
    }
  }

  private func collect(_ view: UIView, into queue: inout [UIView]) {
    queue.append(view)
    for subview in view.subviews { collect(subview, into: &queue) }
  }
}
