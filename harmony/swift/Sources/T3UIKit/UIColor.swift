// UIKit re-exports Foundation, CoreGraphics, and QuartzCore on Apple platforms;
// the vendored sources rely on that, so the shim does the same.
@_exported import Foundation
@_exported import T3CoreGraphics
@_exported import T3QuartzCore
#if canImport(FoundationNetworking)
// swift-foundation 拆分出的网络层（URLSession 等）；Linux 侧经此再导出。
@_exported import FoundationNetworking
#endif
import T3CoreGraphics

// The UIKit shim: a retained-mode, single-threaded view tree that the vendored
// upstream view code drives exactly as it drives UIKit on iOS. The bridge owns
// the tree's lifecycle (mount, layout, draw, input); nothing here renders.

// MARK: - Colors

public final class UIColor: NSObject {
  public var t3Value: T3Color

  public init(red: Double, green: Double, blue: Double, alpha: Double) {
    self.t3Value = T3Color(red: red, green: green, blue: blue, alpha: alpha)
  }

  public init(white: Double, alpha: Double) {
    self.t3Value = T3Color(red: white, green: white, blue: white, alpha: alpha)
  }

  public init?(named name: String) {
    // Asset-catalog colors degrade to a stable palette keyed by name.
    switch name.lowercased() {
    case "black": self.t3Value = T3Color(red: 0, green: 0, blue: 0, alpha: 1)
    case "white": self.t3Value = T3Color(red: 1, green: 1, blue: 1, alpha: 1)
    case "red": self.t3Value = T3Color(red: 1, green: 0.23, blue: 0.19, alpha: 1)
    case "green": self.t3Value = T3Color(red: 0.19, green: 0.82, blue: 0.35, alpha: 1)
    case "blue": self.t3Value = T3Color(red: 0.04, green: 0.52, blue: 1, alpha: 1)
    case "gray": self.t3Value = T3Color(red: 0.56, green: 0.56, blue: 0.56, alpha: 1)
    default: return nil
    }
  }

  public convenience init(hexString: String) {
    var value = hexString.trimmingCharacters(in: .whitespacesAndNewlines)
    if value.hasPrefix("#") { value.removeFirst() }
    var rgba: UInt64 = 0
    Scanner(string: value).scanHexInt64(&rgba)
    switch value.count {
    case 6:
        self.init(
          red: Double((rgba >> 16) & 0xFF) / 255,
          green: Double((rgba >> 8) & 0xFF) / 255,
          blue: Double(rgba & 0xFF) / 255,
          alpha: 1)
    case 8:
        self.init(
          red: Double((rgba >> 24) & 0xFF) / 255,
          green: Double((rgba >> 16) & 0xFF) / 255,
          blue: Double((rgba >> 8) & 0xFF) / 255,
          alpha: Double(rgba & 0xFF) / 255)
    default:
        self.init(white: 0, alpha: 1)
    }
  }

  public var cgColor: CGColor {
    CGColor(red: t3Value.red, green: t3Value.green, blue: t3Value.blue, alpha: t3Value.alpha)
  }

  public func withAlphaComponent(_ alpha: Double) -> UIColor {
    UIColor(red: t3Value.red, green: t3Value.green, blue: t3Value.blue, alpha: alpha)
  }

  public var resolvedValue: T3Color { t3Value }

  // UIKit draws by setting colors on the current context; route both calls to
  // the active recording context.
  public func setFill() { CGContext.current?.setFillColor(cgColor) }
  public func setStroke() { CGContext.current?.setStrokeColor(cgColor) }

  public static let clear = UIColor(white: 0, alpha: 0)
  public static let black = UIColor(white: 0, alpha: 1)
  public static let white = UIColor(white: 1, alpha: 1)
  public static let red = UIColor(red: 1, green: 0.23, blue: 0.19, alpha: 1)
  public static let green = UIColor(red: 0.19, green: 0.82, blue: 0.35, alpha: 1)
  public static let blue = UIColor(red: 0.04, green: 0.52, blue: 1, alpha: 1)
  public static let gray = UIColor(white: 0.56, alpha: 1)
  public static let lightGray = UIColor(white: 0.78, alpha: 1)
  public static let darkGray = UIColor(white: 0.34, alpha: 1)
  public static let systemBackground = UIColor(white: 1, alpha: 1)
  public static let secondarySystemFill = UIColor(white: 0.86, alpha: 0.6)
  public static let tertiarySystemFill = UIColor(white: 0.86, alpha: 0.3)
  public static let separator = UIColor(white: 0.78, alpha: 1)
  public static let opaqueSeparator = UIColor(white: 0.7, alpha: 1)
  public static let systemFill = UIColor(white: 0.86, alpha: 0.5)
  public static let systemGray = UIColor(white: 0.55, alpha: 1)
  public static let systemGray2 = UIColor(white: 0.68, alpha: 1)
  public static let systemGray3 = UIColor(white: 0.8, alpha: 1)
  public static let systemGray4 = UIColor(white: 0.86, alpha: 1)
  public static let systemGray5 = UIColor(white: 0.9, alpha: 1)
  public static let systemGray6 = UIColor(white: 0.94, alpha: 1)
  public static let label = UIColor(white: 0, alpha: 1)
  public static let secondaryLabel = UIColor(white: 0, alpha: 0.6)
  public static let placeholderText = UIColor(white: 0.55, alpha: 1)
  public static let systemBlue = UIColor(red: 0.04, green: 0.52, blue: 1, alpha: 1)
  public static let systemRed = UIColor(red: 1, green: 0.23, blue: 0.19, alpha: 1)
  public static let systemGreen = UIColor(red: 0.19, green: 0.82, blue: 0.35, alpha: 1)
  public static let systemOrange = UIColor(red: 1, green: 0.58, blue: 0, alpha: 1)
  public static let systemPurple = UIColor(red: 0.69, green: 0.32, blue: 0.87, alpha: 1)
  public static let systemTeal = UIColor(red: 0, green: 0.71, blue: 0.79, alpha: 1)
  public static let systemIndigo = UIColor(red: 0.35, green: 0.34, blue: 0.84, alpha: 1)
  public static let systemMint = UIColor(red: 0, green: 0.78, blue: 0.7, alpha: 1)
  public static let secondarySystemBackground = UIColor(white: 0.95, alpha: 1)
  public static let tertiarySystemBackground = UIColor(white: 0.92, alpha: 1)
}

// MARK: - Fonts

/// Font metrics come from the embedder so measured layout matches the device's
/// text engine exactly (ArkUI measures; the host tests use a fixed table).
public protocol UIFontTextMeasuring: AnyObject {
  func width(of text: String, font: UIFont) -> Double
  func lineHeight(of font: UIFont) -> Double
  func ascent(of font: UIFont) -> Double
  func descent(of font: UIFont) -> Double
}

/// Deterministic default: monospaced advance = 0.6 em; proportional uses a
/// compact width table. Good enough for host tests; devices install a real
/// measurer through the bridge before the first frame.
public final class DefaultTextMeasurer: UIFontTextMeasuring {
  public init() {}

  public func width(of text: String, font: UIFont) -> Double {
    let scale = font.pointSize
    if font.t3Spec.monospaced {
      return Double(text.count) * 0.6 * scale
    }
    return Double(text.reduce(0) { $0 + DefaultTextMeasurer.advance(of: $1) }) * scale
  }

  public func lineHeight(of font: UIFont) -> Double { (font.t3LineHeightOverride ?? font.pointSize * 1.21) }
  public func ascent(of font: UIFont) -> Double { lineHeight(of: font) * 0.8 }
  public func descent(of font: UIFont) -> Double { lineHeight(of: font) * 0.2 }

  private static func advance(of scalar: Character) -> Double {
    switch scalar {
    case "i", "i", "j", "l", "l", ".", ",", ":", ";", "'", "|", "!", " ": return 0.28
    case "f", "f", "t", "t", "r", "r", "(", ")", "[", "]", "-": return 0.34
    case "m", "m", "w", "w", "M", "W": return 0.85
    default: return 0.5
    }
  }
}

public final class UIFont: NSObject {
  public struct Weight: Sendable, Hashable {
    public let rawValue: Double
    public init(_ rawValue: Double) { self.rawValue = rawValue }
    public static let ultraLight = Weight(100)
    public static let thin = Weight(200)
    public static let light = Weight(300)
    public static let regular = Weight(400)
    public static let medium = Weight(500)
    public static let semibold = Weight(600)
    public static let bold = Weight(700)
    public static let heavy = Weight(800)
    public static let black = Weight(900)
    public var name: String {
      switch rawValue {
      case ..<150: return "ultraLight"
      case ..<250: return "thin"
      case ..<350: return "light"
      case ..<450: return "regular"
      case ..<550: return "medium"
      case ..<650: return "semibold"
      case ..<750: return "bold"
      case ..<850: return "heavy"
      default: return "black"
      }
    }
  }

  public static var measurer: UIFontTextMeasuring = DefaultTextMeasurer()

  public var familyName: String?
  public var pointSize: Double
  public var weight: Weight
  public var isMonospaced: Bool
  var t3LineHeightOverride: Double?

  init(family: String?, size: Double, weight: Weight, monospaced: Bool) {
    self.familyName = family
    self.pointSize = size
    self.weight = weight
    self.isMonospaced = monospaced
  }

  public var fontName: String {
    "\(familyName ?? (isMonospaced ? "Mono" : "System"))-\(weight.name)"
  }

  public var t3Spec: T3FontSpec {
    T3FontSpec(family: familyName, size: pointSize, weight: weight.name, monospaced: isMonospaced)
  }

  public var lineHeight: Double { UIFont.measurer.lineHeight(of: self) }
  public var ascender: Double { UIFont.measurer.ascent(of: self) }
  public var descender: Double { -UIFont.measurer.descent(of: self) }
  public var capHeight: Double { UIFont.measurer.ascent(of: self) * 0.7 }
  public var xHeight: Double { UIFont.measurer.ascent(of: self) * 0.5 }

  /// Family-name lookup (postscript names like "DMSans-Regular" map loosely).
  public convenience init?(name: String, size: Double) {
    guard size > 0 else { return nil }
    self.init(family: name, size: size, weight: .regular, monospaced: name.lowercased().contains("mono"))
  }

  public func withSize(_ size: Double) -> UIFont {
    UIFont(family: familyName, size: size, weight: weight, monospaced: isMonospaced)
  }

  public static func systemFont(ofSize size: Double, weight: Weight = .regular) -> UIFont {
    UIFont(family: nil, size: size, weight: weight, monospaced: false)
  }

  public static func boldSystemFont(ofSize size: Double) -> UIFont {
    UIFont(family: nil, size: size, weight: .bold, monospaced: false)
  }

  public static func monospacedSystemFont(ofSize size: Double, weight: Weight = .regular) -> UIFont {
    UIFont(family: nil, size: size, weight: weight, monospaced: true)
  }

  public static func monospacedDigitSystemFont(ofSize size: Double, weight: Weight = .regular) -> UIFont {
    monospacedSystemFont(ofSize: size, weight: weight)
  }

  public func measure(_ text: String) -> Double {
    UIFont.measurer.width(of: text, font: self)
  }
}

// MARK: - Edge insets

public struct UIEdgeInsets: Sendable, Hashable {
  public var top: Double, left: Double, bottom: Double, right: Double
  public init(top: Double, left: Double, bottom: Double, right: Double) {
    self.top = top
    self.left = left
    self.bottom = bottom
    self.right = right
  }
  public static let zero = UIEdgeInsets(top: 0, left: 0, bottom: 0, right: 0)
}
