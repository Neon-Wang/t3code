import Foundation
import T3CoreGraphics

// Presentation & system-surface shims. Presentation here is *recorded*: calls
// like "present video" become PresentationRequest records on the view's bridge
// state, and the ArkTS layer fulfills them with native components. This keeps
// the upstream control flow intact without pretending to own a window server.

// MARK: - Image

public final class UIImage: NSObject {
  public struct SymbolConfiguration: Sendable, Hashable {
    public var pointSize: Double
    public var weight: UIFont.Weight
    public init(pointSize: Double, weight: UIFont.Weight = .regular) {
      self.pointSize = pointSize
      self.weight = weight
    }
  }

  public var size: CGSize
  public var scale: Double = 1
  public var cgImage: AnyObject? { nil }
  public var imageRenderingMode = 0

  public init(size: CGSize) { self.size = size }
  public convenience init?(named name: String) { self.init(size: .zero) }
  public convenience init?(data: Data) { self.init(size: .zero) }
  public convenience init?(contentsOfFile path: String) { self.init(size: .zero) }
  public convenience init?(
    systemName name: String, withConfiguration configuration: SymbolConfiguration? = nil
  ) { self.init(size: .zero) }

  public enum RenderingMode: Int {
    case automatic, alwaysOriginal, alwaysTemplate
  }

  public func jpegData(compressionQuality: Double) -> Data? { nil }
  public func pngData() -> Data? { nil }
  public func withRenderingMode(_ mode: RenderingMode) -> UIImage { self }
  public func withTintColor(_ color: UIColor, renderingMode: RenderingMode = .automatic) -> UIImage { self }

  public func draw(in rect: CGRect) {}
  public func draw(in rect: CGRect, blendMode: Int = 0, alpha: Double = 1) {}
  public func draw(at point: CGPoint) {}
}

extension UIFont {
  public static var systemFontSize: Double { 14 }
  public static var smallSystemFontSize: Double { 12 }
  public static var labelFontSize: Double { 17 }
  public static var buttonFontSize: Double { 15 }
}

// MARK: - Hardware keys

public struct UIKeyModifierFlags: OptionSet, Sendable {
  public let rawValue: Int
  public init(rawValue: Int) { self.rawValue = rawValue }
  public static let alphaShift = UIKeyModifierFlags(rawValue: 1 << 16)
  public static let shift = UIKeyModifierFlags(rawValue: 1 << 17)
  public static let control = UIKeyModifierFlags(rawValue: 1 << 18)
  public static let alternate = UIKeyModifierFlags(rawValue: 1 << 19)
  public static let command = UIKeyModifierFlags(rawValue: 1 << 20)
  public static let numericPad = UIKeyModifierFlags(rawValue: 1 << 21)
}

public final class UIKeyCommand: NSObject {
  public static let inputEscape = "\u{1B}"
  public static let inputUpArrow = "\u{1E}"
  public static let inputDownArrow = "\u{1F}"
  public static let inputLeftArrow = "\u{1C}"
  public static let inputRightArrow = "\u{1D}"

  public var input: String?
  public var modifierFlags: UIKeyModifierFlags
  public var action: Selector?
  public var discoverabilityTitle: String?
  public var propertyList: Any?
  public var wantsPriorityOverSystemBehavior = false

  public init(
    input: String?, modifierFlags: UIKeyModifierFlags, action: Selector?,
    discoverabilityTitle: String? = nil
  ) {
    self.input = input
    self.modifierFlags = modifierFlags
    self.action = action
    self.discoverabilityTitle = discoverabilityTitle
  }

  public convenience init(
    input: String?, modifierFlags: UIKeyModifierFlags, action: Selector?, title: String?
  ) {
    self.init(
      input: input, modifierFlags: modifierFlags, action: action, discoverabilityTitle: title)
  }

  public static func action(_ selector: Selector) -> UIKeyCommand {
    UIKeyCommand(input: nil, modifierFlags: [], action: selector)
  }
}

// MARK: - Application / view controllers

public final class UIApplication: NSObject {
  public enum State: Int {
    case active, inactive, background
  }

  public static let shared = UIApplication()
  public var keyWindow: UIWindow? { UIApplication.t3KeyWindow }
  public static weak var t3KeyWindow: UIWindow?
  public var applicationState: State = .active
  public var connectedScenes: [AnyObject] = []
  public var windows: [UIWindow] = []
  public var screen: UIScreen { UIScreen.main }

  public static let didEnterBackgroundNotification = Notification.Name(
    "UIApplicationDidEnterBackgroundNotification")
  public static let willEnterForegroundNotification = Notification.Name(
    "UIApplicationWillEnterForegroundNotification")
  public static let didBecomeActiveNotification = Notification.Name(
    "UIApplicationDidBecomeActiveNotification")
}

open class UIViewController: UIResponder {
  open var view: UIView! {
    get { t3LoadedView }
  }
  lazy var t3LoadedView: UIView! = { loadViewIfNeededImpl(); return t3View }()
  var t3View = UIView()
  public var isViewLoaded = false
  public var modalPresentationStyle: UIModalPresentationStyle = .automatic
  public var transitioningDelegate: AnyObject?
  public var presentationController: UIPresentationController? { nil }
  public var isBeingPresented = false
  public var isBeingDismissed = false
  public var overrideUserInterfaceStyle = UIUserInterfaceStyle.unspecified
  public var traitCollection = UITraitCollection()
  public var modalPresentationStyleValue: UIModalPresentationStyle = .automatic

  public func addChild(_ child: UIViewController) {}
  public func removeFromParent() {}
  public func setNeedsUpdateOfSupportedInterfaceOrientations() {}

  /// Linux 无 ObjC runtime：responds 恒 false，上游回退到 present 路径
  /// （托管呈现由 ArkTS 层实现，等价覆盖同一用户可见行为）。
  #if canImport(Darwin)
  public override func responds(to aSelector: Selector) -> Bool { false }
  #else
  public func responds(to aSelector: Selector) -> Bool { false }
  #endif
  @discardableResult
  public func perform(
    _ aSelector: Selector, with object: Any? = nil, with anotherObject: Any? = nil
  ) -> Any? { nil }
  public func willMove(toParent parent: UIViewController?) {}
  public func didMove(toParent parent: UIViewController?) {}
  public var transitionCoordinator: UIViewControllerTransitionCoordinator? { nil }

  public init(nibName: String?, bundle: Any?) {}
  public override init() { super.init() }

  public func loadViewIfNeeded() { loadViewIfNeededImpl() }
  private func loadViewIfNeededImpl() { isViewLoaded = true; viewDidLoad() }
  open func viewDidLoad() {}
  open func viewWillAppear(_ animated: Bool) {}
  open func viewDidAppear(_ animated: Bool) {}
  open func viewWillDisappear(_ animated: Bool) {}
  open func viewDidDisappear(_ animated: Bool) {}

  open func present(_ viewControllerToPresent: UIViewController, animated: Bool, completion: (() -> Void)? = nil) {
    T3PresentationCenter.shared.record(.init(kind: "presentViewController", description: "\(type(of: viewControllerToPresent))"))
    completion?()
  }

  open func dismiss(animated: Bool, completion: (() -> Void)? = nil) {
    completion?()
  }
}

public final class UIWindowScene: NSObject {
  public final class GeometryPreferences: NSObject {
    public var interfaceOrientations: UIInterfaceOrientationMask

    public static func iOS(interfaceOrientations: UIInterfaceOrientationMask) -> GeometryPreferences {
      GeometryPreferences(interfaceOrientations: interfaceOrientations)
    }

    public init(interfaceOrientations: UIInterfaceOrientationMask) {
      self.interfaceOrientations = interfaceOrientations
    }
  }

  public var windows: [UIWindow] = []
  public var screen: UIScreen { UIScreen.main }

  public func requestGeometryUpdate(
    _ geometryPreferences: GeometryPreferences, errorHandler: ((Error) -> Void)? = nil
  ) {}
}
public final class UIPresentationController: NSObject {
  public weak var delegate: UIAdaptivePresentationControllerDelegate?
}

extension UIViewController {
  public var popoverPresentationController: UIPopoverPresentationController? {
    UIPopoverPresentationController()
  }
}
public protocol UIAdaptivePresentationControllerDelegate: AnyObject {}
public enum UITransitionContextViewControllerKey: String {
  case from, to
}

extension UIViewControllerTransitionCoordinatorContext {
  public var isAnimated: Bool { true }
  public var isCancelled: Bool { false }
}

public protocol UIViewControllerTransitionCoordinatorContext: NSObjectProtocol {
  var isAnimated: Bool { get }
  var isCancelled: Bool { get }
  func viewController(forKey key: UITransitionContextViewControllerKey) -> UIViewController?
}

public protocol UIViewControllerTransitionCoordinator: UIViewControllerTransitionCoordinatorContext {
  var context: UIViewControllerTransitionCoordinatorContext { get }
  func viewController(forKey key: UITransitionContextViewControllerKey) -> UIViewController?
  func animate(
    alongsideTransition animation: ((UIViewControllerTransitionCoordinatorContext) -> Void)?,
    completion: ((UIViewControllerTransitionCoordinatorContext) -> Void)?)
}

extension UIViewControllerTransitionCoordinator {
  public func animate(
    alongsideTransition animation: (() -> Void)?, completion: (() -> Void)?
  ) {
    animate(
      alongsideTransition: { _ in animation?() },
      completion: { _ in completion?() })
  }
}
public enum UIUserInterfaceStyle: Int, Sendable {
  case unspecified, light, dark
}

public enum UIModalPresentationStyle: Int {
  case fullScreen, pageSheet, formSheet, currentContext, custom, overFullScreen,
    overCurrentContext, popover, automatic, none
}

public final class UITraitCollection: NSObject {
  public var userInterfaceStyle: UIUserInterfaceStyle = .unspecified
  public var displayScale: Double = 3
}

public final class UIPopoverPresentationController: NSObject {
  public weak var sourceView: UIView?
  public var sourceRect: CGRect = .zero
  public weak var delegate: UIAdaptivePresentationControllerDelegate?
}

public struct UIInterfaceOrientationMask: OptionSet, Sendable {
  public init(rawValue: Int) { self.rawValue = rawValue }
  public let rawValue: Int
  public static let portrait = UIInterfaceOrientationMask(rawValue: 1 << 1)
  public static let landscapeLeft = UIInterfaceOrientationMask(rawValue: 1 << 4)
  public static let landscapeRight = UIInterfaceOrientationMask(rawValue: 1 << 3)
  public static let portraitUpsideDown = UIInterfaceOrientationMask(rawValue: 1 << 2)
  public static let landscape: UIInterfaceOrientationMask = [.landscapeLeft, .landscapeRight]
  public static let allButUpsideDown: UIInterfaceOrientationMask = [.portrait, .landscape]
  public static let all: UIInterfaceOrientationMask = [
    .portrait, .portraitUpsideDown, .landscape,
  ]
}

public final class UIActivityViewController: UIViewController {
  public var title: String?
  public var completionWithItemsHandler: ((Any, Bool, [Any]?, Error?) -> Void)?
  public init(activityItems: [Any], applicationActivities: [Any]?) {
    super.init()
  }
}

// MARK: - Pasteboard & item providers

public final class UIPasteboard: NSObject {
  public static let general = UIPasteboard()
  public var string: String?
  public var hasStrings: Bool { string != nil }
  public var images: [UIImage] { [] }
  public var hasImages: Bool { false }
  public var itemProviders: [NSItemProvider] { [] }
  public func clear() { string = nil }
}

// NSItemProvider comes from Foundation on Darwin; declared only for
// corelibs-foundation builds where the name does not exist.
#if !canImport(Darwin)
public final class NSItemProvider: NSObject {
  public init?(contentsOf url: URL?) { super.init() }
  public override init() { super.init() }
  public var suggestedName: String?
  public func hasItemConformingToTypeIdentifier(_ identifier: String) -> Bool { false }
  public func canLoadObject<T>(_ type: T.Type) -> Bool { false }
  public func canLoadObject<T: AnyObject>(ofClass type: T.Type) -> Bool { false }
  public func loadObject<T>(
    of type: T.Type, completionHandler: @escaping (T?, Error?) -> Void
  ) -> Progress {
    completionHandler(nil, nil)
    return Progress(totalUnitCount: 0)
  }
  public func loadObject<T: AnyObject>(
    ofClass type: T.Type, completionHandler: @escaping (T?, Error?) -> Void
  ) -> Progress {
    completionHandler(nil, nil)
    return Progress(totalUnitCount: 0)
  }
  public func loadDataRepresentation(
    forTypeIdentifier identifier: String, completionHandler: @escaping (Data?, Error?) -> Void
  ) {}
}
#endif

// MARK: - Item provider bridging (Darwin Foundation interop)

#if canImport(Darwin)
// Darwin Foundation's NSItemProvider generics require ObjC-bridged reading
// types; the shim image bridges to itself so `canLoadObject(ofClass:)` and
// `loadObject(ofClass:)` resolve exactly like the iOS path.
extension UIImage: _ObjectiveCBridgeable {
  public typealias _ObjectiveCType = UIImage
  public func _bridgeToObjectiveC() -> UIImage { self }
  public static func _forceBridgeFromObjectiveC(_ source: UIImage, result: inout UIImage?) {
    result = source
  }
  public static func _conditionallyBridgeFromObjectiveC(_ source: UIImage, result: inout UIImage?) -> Bool {
    result = source
    return true
  }
  public static func _unconditionallyBridgeFromObjectiveC(_ source: UIImage?) -> UIImage {
    source ?? UIImage(size: .zero)
  }
}

@objc extension UIImage: NSItemProviderReading {
  public static var readableTypeIdentifiersForItemProvider: [String] { [] }
  public static func object(withItemProviderData data: Data, typeIdentifier: String) throws -> UIImage {
    UIImage(size: .zero)
  }
}
#endif

// MARK: - Accessibility

public enum UIAccessibility: Sendable {
  public static func post(notification: Int, argument: Any?) {}
  public static var isReduceMotionEnabled: Bool { false }
  public static var isVoiceOverRunning: Bool { false }
}

// MARK: - Presentation records

public struct T3PresentationRequest: Sendable, Hashable {
  public var kind: String
  public var description: String
}

public final class T3PresentationCenter {
  public static let shared = T3PresentationCenter()
  public private(set) var requests: [T3PresentationRequest] = []
  func record(_ request: T3PresentationRequest) { requests.append(request) }
  public func drain() -> [T3PresentationRequest] {
    defer { requests.removeAll() }
    return requests
  }
}
