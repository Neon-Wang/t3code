import Foundation
import T3UIKit

// AVKit surface, distilled: the vendored video presentation drives a player
// controller's lifecycle and audio-session configuration. On Harmony the
// embedder fulfills playback through presentation records; the model keeps the
// upstream control flow intact.

public class AVPlayerItem: NSObject {
  @objc public enum Status: Int {
    case unknown = 0, readyToPlay = 1, failed = 2
  }

#if canImport(Darwin)
  @objc public dynamic var status: Status = .unknown
#else
  // Linux 无 ObjC KVO：observe 由本类型提供（Darwin API 形态）。
  public var status: Status = .unknown

  /// shim 的 status 不变更——仅按 .initial 语义回调一次，与模型行为一致。
  public func observe(
    _ keyPath: KeyPath<AVPlayerItem, Status>,
    options: T3UIKit.NSKeyValueObservingOptions,
    changeHandler: @escaping (AVPlayerItem, T3UIKit.NSKeyValueObservedChange<Status>) -> Void
  ) -> T3UIKit.NSKeyValueObservation {
    if options.contains(.initial) {
      changeHandler(self, T3UIKit.NSKeyValueObservedChange(newValue: self[keyPath: keyPath], oldValue: nil))
    }
    return T3UIKit.NSKeyValueObservation()
  }
#endif
  public var error: Error?
  public var externalMetadata: [AVMetadataItem] = []
  public init(url: URL) {}
}

// MARK: - Audio session

public final class AVAudioSession: NSObject {
  public struct Category: Equatable, Sendable, RawRepresentable {
    public let rawValue: String
    public init(rawValue: String) { self.rawValue = rawValue }
    public static let playback = Category(rawValue: "playback")
    public static let ambient = Category(rawValue: "ambient")
    public static let soloAmbient = Category(rawValue: "soloAmbient")
    public static let record = Category(rawValue: "record")
    public static let playAndRecord = Category(rawValue: "playAndRecord")
  }

  public struct Mode: Equatable, Sendable, RawRepresentable {
    public let rawValue: String
    public init(rawValue: String) { self.rawValue = rawValue }
    public static let `default` = Mode(rawValue: "default")
    public static let moviePlayback = Mode(rawValue: "moviePlayback")
    public static let videoRecording = Mode(rawValue: "videoRecording")
    public static let spokenAudio = Mode(rawValue: "spokenAudio")
    public static let voiceChat = Mode(rawValue: "voiceChat")
  }

  public struct CategoryOptions: OptionSet, Sendable {
    public let rawValue: UInt
    public init(rawValue: UInt) { self.rawValue = rawValue }
    public static let mixWithOthers = CategoryOptions(rawValue: 1 << 0)
    public static let duckOthers = CategoryOptions(rawValue: 1 << 1)
    public static let allowBluetooth = CategoryOptions(rawValue: 1 << 2)
  }

  public static func sharedInstance() -> AVAudioSession { AVAudioSession() }

  public private(set) var category: Category = .soloAmbient
  public private(set) var mode: Mode = .default
  public private(set) var categoryOptions: CategoryOptions = []

  public func setCategory(
    _ category: Category, mode: Mode, options: CategoryOptions = []
  ) throws {
    self.category = category
    self.mode = mode
    self.categoryOptions = options
  }

  public func setActive(_ active: Bool) throws {}
}

public enum AVMetadataIdentifier: Sendable, Hashable {
  case commonIdentifierTitle
  case commonIdentifierArtist
  case commonIdentifierDescription
  case commonIdentifierCreationDate
  case iTunesMetadataTrackName
}

public class AVMetadataItem: NSObject {}
public final class AVMutableMetadataItem: AVMetadataItem {
  public var identifier: AVMetadataIdentifier?
  public var value: Any?
  public var dataType: Any?
  public var extendedLanguageTag: String?
}

public final class AVPlayer: NSObject {
  public init(playerItem: AVPlayerItem?) {}
  public override init() {}
  public func play() {}
  public func pause() {}
  public func replaceCurrentItem(with item: AVPlayerItem?) {}
}

public protocol AVPlayerViewControllerDelegate: AnyObject {
  func playerViewController(
    _ playerViewController: AVPlayerViewController,
    willBeginFullScreenPresentationWithAnimationCoordinator coordinator: UIViewControllerTransitionCoordinator
  )
  func playerViewController(
    _ playerViewController: AVPlayerViewController,
    willEndFullScreenPresentationWithAnimationCoordinator coordinator: UIViewControllerTransitionCoordinator
  )
}

public final class AVPlayerViewController: UIViewController {
  public weak var delegate: AVPlayerViewControllerDelegate?
  public var player: AVPlayer?
  public var videoGravity = "AVLayerVideoGravityResizeAspect"
  public var showsPlaybackControls = true
  public var allowsPictureInPicturePlayback = true
  public var entersPictureInPictureOnPlaybackDisappear = false
}

/// The embedder drives transition coordination; a settled context is enough for
/// the vendored completion logic.
final class StaticTransitionCoordinator: NSObject, UIViewControllerTransitionCoordinator {
  let contextValue = StaticContext()

  final class StaticContext: NSObject, UIViewControllerTransitionCoordinatorContext {
    var isAnimated: Bool { true }
    var isCancelled: Bool { false }
    func viewController(forKey key: UITransitionContextViewControllerKey) -> UIViewController? { nil }
  }

  var context: UIViewControllerTransitionCoordinatorContext { contextValue }
  func viewController(forKey key: UITransitionContextViewControllerKey) -> UIViewController? { nil }
  func animate(
    alongsideTransition animation: ((UIViewControllerTransitionCoordinatorContext) -> Void)?,
    completion: ((UIViewControllerTransitionCoordinatorContext) -> Void)?
  ) {
    animation?(contextValue)
    completion?(contextValue)
  }
}
