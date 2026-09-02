import Foundation
import T3CoreGraphics

// Drawing entry points. All UIKit text/shape drawing funnels into the recording
// CGContext as display ops; measurement goes through the injectable font
// measurer so device layout matches the platform text engine exactly.

// MARK: - Current context

public func UIGraphicsGetCurrentContext() -> CGContext? { CGContext.current }

// MARK: - Attributed string keys (UIKit values inside Foundation strings)

extension NSAttributedString.Key {
  public static var font: NSAttributedString.Key { NSAttributedString.Key(rawValue: "NSFont") }
  public static var foregroundColor: NSAttributedString.Key { NSAttributedString.Key(rawValue: "NSColor") }
  public static var paragraphStyle: NSAttributedString.Key { NSAttributedString.Key(rawValue: "NSParagraphStyle") }
  public static var kern: NSAttributedString.Key { NSAttributedString.Key(rawValue: "NSKern") }
  public static var baselineOffset: NSAttributedString.Key { NSAttributedString.Key(rawValue: "NSBaselineOffset") }
  public static var attachment: NSAttributedString.Key { NSAttributedString.Key(rawValue: "NSAttachment") }
  public static var obliqueness: NSAttributedString.Key { NSAttributedString.Key(rawValue: "NSObliqueness") }
  public static var ligature: NSAttributedString.Key { NSAttributedString.Key(rawValue: "NSLigature") }
  public static var expansion: NSAttributedString.Key { NSAttributedString.Key(rawValue: "NSExpansion") }
}

// MARK: - Layout resolution (shared by String/NSAttributedString drawing)

enum T3TextLayout {
  /// Split an attributed string into style runs (font/color pairs).
  struct StyleRun {
    var range: NSRange
    var font: UIFont
    var color: T3Color
    var text: String
  }

  static func styleRuns(of attributed: NSAttributedString, defaultFont: UIFont, defaultColor: T3Color) -> [StyleRun] {
    var runs: [StyleRun] = []
    let whole = NSRange(location: 0, length: attributed.length)
    attributed.enumerateAttributes(in: whole) { attributes, range, _ in
      let font = (attributes[.font] as? UIFont) ?? defaultFont
      let color = (attributes[.foregroundColor] as? UIColor)?.t3Value ?? defaultColor
      runs.append(
        StyleRun(
          range: range, font: font, color: color,
          text: (attributed.string as NSString).substring(with: range)))
    }
    return runs
  }

  static func alignment(of attributed: NSAttributedString) -> T3TextAlignment {
    guard attributed.length > 0 else { return .left }
    let style = attributed.attribute(.paragraphStyle, at: 0, effectiveRange: nil) as? NSParagraphStyle
    switch style?.alignment ?? .natural {
    case .center: return .center
    case .right, .justified: return .right
    default: return .left
    }
  }

  static func lineBreakMode(of attributed: NSAttributedString) -> String {
    guard attributed.length > 0 else { return "byTruncatingTail" }
    let style = attributed.attribute(.paragraphStyle, at: 0, effectiveRange: nil) as? NSParagraphStyle
    switch style?.lineBreakMode ?? .byTruncatingTail {
    case .byWordWrapping, .byCharWrapping: return "byWordWrapping"
    case .byTruncatingHead: return "byTruncatingHead"
    case .byTruncatingMiddle: return "byTruncatingMiddle"
    default: return "byTruncatingTail"
    }
  }

  /// Record a text op; `rect` is the layout box the caller computed.
  static func record(_ attributed: NSAttributedString, in rect: CGRect) {
    guard let context = CGContext.current, rect.width > 0, rect.height > 0 else { return }
    guard attributed.length > 0 else { return }
    let runs = styleRuns(
      of: attributed, defaultFont: .systemFont(ofSize: UIFont.systemFontSize),
      defaultColor: T3Color(red: 0, green: 0, blue: 0, alpha: 1))
    let lineCount = maxLines(in: rect, runs: runs)
    let lineHeight = runs.first.map { UIFont.measurer.lineHeight(of: $0.font) } ?? UIFont.systemFontSize * 1.2
    let visibleLines = min(lineCount, max(1, Int(rect.height / lineHeight)))
    var textRuns: [T3TextOp.Run] = []
    for run in runs {
      textRuns.append(T3TextOp.Run(text: run.text, font: run.font.t3Spec, color: run.color))
    }
    let baseline = rect.minY + lineHeight * 0.8
    context.recordText(
      T3TextOp(
        runs: textRuns, rect: T3Rect(rect), baselineY: baseline,
        alignment: alignment(of: attributed), lineBreakMode: lineBreakMode(of: attributed),
        maxLines: visibleLines))
  }

  private static func maxLines(in rect: CGRect, runs: [StyleRun]) -> Int {
    let lineHeight = runs.first.map { UIFont.measurer.lineHeight(of: $0.font) } ?? UIFont.systemFontSize * 1.2
    return max(1, Int(rect.height / max(lineHeight, 1)))
  }

  static func size(of attributed: NSAttributedString) -> CGSize {
    guard attributed.length > 0 else { return .zero }
    let runs = styleRuns(
      of: attributed, defaultFont: .systemFont(ofSize: UIFont.systemFontSize),
      defaultColor: T3Color(red: 0, green: 0, blue: 0, alpha: 1))
    let lineHeight = runs.first.map { UIFont.measurer.lineHeight(of: $0.font) } ?? UIFont.systemFontSize * 1.2
    let width = runs.reduce(0) { $0 + UIFont.measurer.width(of: $1.text, font: $1.font) }
    return CGSize(width: ceil(width), height: ceil(lineHeight))
  }
}

// MARK: - String drawing

extension String {
  public func draw(in rect: CGRect, withAttributes attributes: [NSAttributedString.Key: Any] = [:]) {
    T3TextLayout.record(NSAttributedString(string: self, attributes: attributes), in: rect)
  }

  public func draw(at point: CGPoint, withAttributes attributes: [NSAttributedString.Key: Any] = [:]) {
    let size = size(withAttributes: attributes)
    draw(
      in: CGRect(origin: point, size: size), withAttributes: attributes)
  }

  public func size(withAttributes attributes: [NSAttributedString.Key: Any] = [:]) -> CGSize {
    T3TextLayout.size(of: NSAttributedString(string: self, attributes: attributes))
  }

  public func boundingRect(
    with size: CGSize, options: Int = 0, attributes: [NSAttributedString.Key: Any] = [:],
    context: AnyObject? = nil
  ) -> CGRect {
    let measured = self.size(withAttributes: attributes)
    return CGRect(
      origin: .zero,
      size: CGSize(
        width: min(measured.width, size.width == 0 ? .infinity : size.width),
        height: min(measured.height, size.height == 0 ? .infinity : size.height)))
  }
}

extension NSString {
  public func draw(in rect: CGRect, withAttributes attributes: [NSAttributedString.Key: Any] = [:]) {
    (self as String).draw(in: rect, withAttributes: attributes)
  }

  public func draw(at point: CGPoint, withAttributes attributes: [NSAttributedString.Key: Any] = [:]) {
    (self as String).draw(at: point, withAttributes: attributes)
  }

  public func size(withAttributes attributes: [NSAttributedString.Key: Any] = [:]) -> CGSize {
    (self as String).size(withAttributes: attributes)
  }
}

extension NSAttributedString {
  public func draw(in rect: CGRect) { T3TextLayout.record(self, in: rect) }
  public func draw(at point: CGPoint) { draw(in: CGRect(origin: point, size: size())) }
  public func draw(at point: CGPoint, withAttributes attributes: [NSAttributedString.Key: Any] = [:]) {
    draw(at: point)
  }
  public func size() -> CGSize { T3TextLayout.size(of: self) }
  public func boundingRect(
    with size: CGSize, options: Int = 0, context: AnyObject? = nil
  ) -> CGRect {
    let measured = self.size()
    return CGRect(
      origin: .zero,
      size: CGSize(
        width: min(measured.width, size.width == 0 ? .infinity : size.width),
        height: min(measured.height, size.height == 0 ? .infinity : size.height)))
  }

}

extension NSAttributedString {
  public static var attachmentCharacter: String { "\u{FFFC}" }
}

extension NSMutableAttributedString {
  public convenience init(attachment: NSTextAttachment) {
    let string = NSMutableAttributedString(string: NSAttributedString.attachmentCharacter)
    string.addAttribute(
      .attachment, value: attachment, range: NSRange(location: 0, length: string.length))
    self.init(attributedString: string)
  }
}

// MARK: - Bezier paths

public final class UIBezierPath: NSObject {
  public var path = T3Path()
  public var lineWidth: Double = 1
  public var lineCapStyle: CGLineCap = .butt
  public var lineJoinStyle: CGLineJoin = .miter
  public var miterLimit: Double = 10
  public var usesEvenOddFillRule = false
  public var lineDashPhase: Double = 0
  public var lineDashPattern: [Double]?

  public override init() { super.init() }

  public convenience init(rect: CGRect) {
    self.init()
    move(to: rect.origin)
    addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
    addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
    addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
    close()
  }

  public convenience init(roundedRect rect: CGRect, cornerRadius: Double) {
    self.init(rect: rect)
  }

  public convenience init(ovalIn rect: CGRect) {
    self.init()
    // Approximate with four quad curves through the edge midpoints.
    let midX = rect.midX
    let midY = rect.midY
    move(to: CGPoint(x: rect.minX, y: midY))
    addQuadCurve(to: CGPoint(x: midX, y: rect.minY), controlPoint: CGPoint(x: rect.minX, y: rect.minY))
    addQuadCurve(to: CGPoint(x: rect.maxX, y: midY), controlPoint: CGPoint(x: rect.maxX, y: rect.minY))
    addQuadCurve(to: CGPoint(x: midX, y: rect.maxY), controlPoint: CGPoint(x: rect.maxX, y: rect.maxY))
    addQuadCurve(to: CGPoint(x: rect.minX, y: midY), controlPoint: CGPoint(x: rect.minX, y: rect.maxY))
    close()
  }

  public func move(to point: CGPoint) { path.verbs.append(.move(point.x, point.y)) }
  public func addLine(to point: CGPoint) { path.verbs.append(.line(point.x, point.y)) }
  public func addQuadCurve(to point: CGPoint, controlPoint: CGPoint) {
    path.verbs.append(.quad(controlPoint.x, controlPoint.y, point.x, point.y))
  }
  public func addCurve(to point: CGPoint, controlPoint1: CGPoint, controlPoint2: CGPoint) {
    path.verbs.append(.curve(controlPoint1.x, controlPoint1.y, controlPoint2.x, controlPoint2.y, point.x, point.y))
  }
  public func addArc(
    withCenter center: CGPoint, radius: Double, startAngle: Double, endAngle: Double, clockwise: Bool
  ) {
    // Eight-segment arc approximation.
    let segments = 8
    var angle = startAngle
    let delta = (endAngle - startAngle) / Double(segments)
    move(to: CGPoint(x: center.x + radius * cos(angle), y: center.y + radius * sin(angle)))
    for _ in 0..<segments {
      angle += delta
      addLine(to: CGPoint(x: center.x + radius * cos(angle), y: center.y + radius * sin(angle)))
    }
  }
  public func close() { path.verbs.append(.close) }
  public func append(_ other: UIBezierPath) { path.verbs.append(contentsOf: other.path.verbs) }
  public var isEmpty: Bool { path.verbs.isEmpty }
  public var bounds: CGRect { .zero }

  public func fill() {
    guard let context = CGContext.current else { return }
    replay(into: context)
    context.fillPath()
  }

  public func stroke() {
    guard let context = CGContext.current else { return }
    context.setLineWidth(lineWidth)
    context.setLineCap(lineCapStyle)
    context.setLineJoin(lineJoinStyle)
    replay(into: context)
    context.strokePath()
  }

  public func addClip() {
    guard let context = CGContext.current else { return }
    replay(into: context)
    context.clip()
  }

  private func replay(into context: CGContext) {
    for verb in path.verbs {
      switch verb {
      case .move(let x, let y): context.move(to: CGPoint(x: x, y: y))
      case .line(let x, let y): context.addLine(to: CGPoint(x: x, y: y))
      case .quad(let cx, let cy, let x, let y):
        context.addQuadCurve(to: CGPoint(x: x, y: y), control: CGPoint(x: cx, y: cy))
      case .curve(let c1x, let c1y, let c2x, let c2y, let x, let y):
        context.addCurve(
          to: CGPoint(x: x, y: y), control1: CGPoint(x: c1x, y: c1y), control2: CGPoint(x: c2x, y: c2y))
      case .close: context.closePath()
      }
    }
  }
}

// MARK: - Image renderer (host-side paste path compiles; devices deliver files)

public class UIGraphicsImageRendererFormat: NSObject {
  public var scale: Double = 1
  public var opaque = false
  public static func preferred() -> UIGraphicsImageRendererFormat {
    UIGraphicsImageRendererFormat()
  }
}

public final class UIGraphicsImageRendererContext {
  public let cgContext: CGContext
  public var isCancelled: Bool { false }
  init(context: CGContext) { self.cgContext = context }
}

public final class UIGraphicsImageRenderer: NSObject {
  public let size: CGSize
  public init(size: CGSize, format: UIGraphicsImageRendererFormat = UIGraphicsImageRendererFormat()) {
    self.size = size
  }

  public func image(_ actions: (UIGraphicsImageRendererContext) -> Void) -> UIImage {
    let context = CGContext()
    let previous = CGContext.current
    CGContext.current = context
    actions(UIGraphicsImageRendererContext(context: context))
    CGContext.current = previous
    return UIImage(size: size)
  }
}
