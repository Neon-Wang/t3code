import Foundation

// T3CoreGraphics — pure-Swift stand-in for the CoreGraphics surface the upstream
// modules draw with. Geometry types (CGFloat/CGPoint/CGSize/CGRect) come from
// Foundation on every platform; this module owns CGContext/CGColor/CGGradient
// and turns imperative drawing into a Codable display list that the ArkUI
// canvas renderer replays verbatim on device.

// MARK: - Color

/// Device-independent RGBA color, the serialized color vocabulary of the bridge.
public struct T3Color: Codable, Sendable, Hashable {
  public var red: Double
  public var green: Double
  public var blue: Double
  public var alpha: Double

  public init(red: Double, green: Double, blue: Double, alpha: Double = 1) {
    self.red = red
    self.green = green
    self.blue = blue
    self.alpha = alpha
  }

  public var uiKitValue: String { "#\(hex)" }

  private var hex: String {
    func channel(_ value: Double) -> String {
      String(format: "%02x", Int((min(max(value, 0), 1) * 255).rounded()))
    }
    return channel(red) + channel(green) + channel(blue)
  }
}

/// Reference type so vendored code can bridge `[CGColor]` through `CFArray`,
/// matching the CoreGraphics ABI the upstream sources compile against.
public final class CGColor: NSObject, @unchecked Sendable {
  public var components: [Double]
  public init(red: Double, green: Double, blue: Double, alpha: Double) {
    components = [red, green, blue, alpha]
  }
  public var resolved: T3Color {
    T3Color(
      red: components.count > 0 ? components[0] : 0,
      green: components.count > 1 ? components[1] : 0,
      blue: components.count > 2 ? components[2] : 0,
      alpha: components.count > 3 ? components[3] : 1
    )
  }
}

public struct CGColorSpace: Sendable, Equatable {
  let name: String
  public static func deviceRGB() -> CGColorSpace { CGColorSpace(name: "deviceRGB") }
}

/// Matches the UIKit convenience used by the drawing helpers.
public func CGColorSpaceCreateDeviceRGB() -> CGColorSpace { .deviceRGB() }

// MARK: - Display list

/// A serialized rectangle in logical (point) coordinates.
public struct T3Rect: Codable, Sendable, Hashable {
  public var x: Double
  public var y: Double
  public var width: Double
  public var height: Double

  public init(x: Double, y: Double, width: Double, height: Double) {
    self.x = x
    self.y = y
    self.width = width
    self.height = height
  }

  public init(_ rect: CGRect) {
    self.init(x: rect.origin.x, y: rect.origin.y, width: rect.width, height: rect.height)
  }
}

/// Font description carried through the display list. The renderer resolves it
/// against the platform font registry; nothing here embeds font binaries.
public struct T3FontSpec: Codable, Sendable, Hashable {
  public var family: String?
  public var size: Double
  public var weight: String
  public var monospaced: Bool

  public init(family: String? = nil, size: Double, weight: String = "regular", monospaced: Bool = false) {
    self.family = family
    self.size = size
    self.weight = weight
    self.monospaced = monospaced
  }
}

public enum T3TextAlignment: String, Codable, Sendable {
  case left, center, right
}

/// A run of text positioned by the Swift layout pass. `rect` is the layout box;
/// `baselineY` is the absolute baseline the renderer should snap to.
public struct T3TextOp: Codable, Sendable, Hashable {
  public var runs: [Run]
  public var rect: T3Rect
  public var baselineY: Double
  public var alignment: T3TextAlignment
  public var lineBreakMode: String
  public var maxLines: Int

  public struct Run: Codable, Sendable, Hashable {
    public var text: String
    public var font: T3FontSpec
    public var color: T3Color
    public init(text: String, font: T3FontSpec, color: T3Color) {
      self.text = text
      self.font = font
      self.color = color
    }
  }

  public init(
    runs: [Run], rect: T3Rect, baselineY: Double, alignment: T3TextAlignment,
    lineBreakMode: String = "byTruncatingTail", maxLines: Int = 1
  ) {
    self.runs = runs
    self.rect = rect
    self.baselineY = baselineY
    self.alignment = alignment
    self.lineBreakMode = lineBreakMode
    self.maxLines = maxLines
  }
}

/// Vector path vocabulary (move/line/curve/close) — enough for chevrons,
/// checkboxes, stripes, and any stroked icon the upstream code draws.
public struct T3Path: Codable, Sendable, Hashable {
  public enum Verb: Codable, Sendable, Hashable {
    case move(Double, Double)
    case line(Double, Double)
    case quad(Double, Double, Double, Double)
    case curve(Double, Double, Double, Double, Double, Double)
    case close
  }

  public var verbs: [Verb]
  public init(verbs: [Verb] = []) { self.verbs = verbs }
}

/// One resolved drawing operation. The renderer applies ops in order; state is
/// fully captured per op (no cross-op dependencies), so replay is stateless.
public enum T3DisplayOp: Codable, Sendable, Hashable {
  case fill(rect: T3Rect, color: T3Color, cornerRadius: Double)
  case fillEllipse(rect: T3Rect, color: T3Color)
  case fillPath(path: T3Path, color: T3Color)
  case strokePath(path: T3Path, color: T3Color, lineWidth: Double, cap: String, join: String)
  case strokeEllipse(rect: T3Rect, color: T3Color, lineWidth: Double)
  case text(T3TextOp)
  case linearGradient(rect: T3Rect, colors: [T3Color], locations: [Double], startX: Double, startY: Double,
    endX: Double, endY: Double)
  case group(clip: T3Rect, ops: [T3DisplayOp])
}

/// A frame produced by one drawing pass over a view.
public struct T3DisplayList: Codable, Sendable, Hashable {
  public var ops: [T3DisplayOp]
  public init(ops: [T3DisplayOp] = []) { self.ops = ops }
  public var opCount: Int { ops.count }
}

// MARK: - Gradient

public final class CGGradient: NSObject, @unchecked Sendable {
  public var colors: [CGColor]
  public var locations: [Double]?

  public init?(colorsSpace: CGColorSpace?, colors: [CGColor], locations: [Double]?) {
    self.colors = colors
    self.locations = locations
  }

  public init(colors: [CGColor], locations: [Double]? = nil) {
    self.colors = colors
    self.locations = locations
  }

  /// The upstream code builds gradients from `[CGColor] as CFArray`; accept the
  /// bridged form directly so the vendored call sites compile verbatim.
  public convenience init?(colorsSpace: CGColorSpace?, colors: CFArray?, locations: [Double]?) {
    let bridged = (colors as NSArray?) ?? []
    self.init(colors: bridged.compactMap { $0 as? CGColor }, locations: locations)
  }
}

public struct CGGradientDrawingOptions: OptionSet, Sendable {
  public let rawValue: Int
  public init(rawValue: Int) { self.rawValue = rawValue }
  public static let drawsBeforeStartLocation = CGGradientDrawingOptions(rawValue: 1 << 0)
  public static let drawsAfterEndLocation = CGGradientDrawingOptions(rawValue: 1 << 1)
}

public enum CGLineCap: String, Sendable {
  case butt, round, square
}

public enum CGLineJoin: String, Sendable {
  case miter, round, bevel
}

// MARK: - Recording context

/// Records drawing into a display list. The bridge sets `current` for the
/// duration of a view's draw pass; `UIGraphicsGetCurrentContext()` returns it.
/// The render pipeline is single-threaded by contract (one bridge thread drives
/// layout, drawing, and input), so a plain static current is sufficient.
public final class CGContext {
  public private(set) var ops: [T3DisplayOp] = []
  public static var current: CGContext?

  private struct State {
    var fill: T3Color = T3Color(red: 0, green: 0, blue: 0, alpha: 1)
    var stroke: T3Color = T3Color(red: 0, green: 0, blue: 0, alpha: 1)
    var lineWidth: Double = 1
    var lineCap: CGLineCap = .butt
    var lineJoin: CGLineJoin = .miter
    var clip: T3Rect?
  }

  private var state = State()
  private var stateStack: [State] = []

  /// Path under construction (move/addLine/…), consumed by fillPath()/strokePath().
  private var pendingPath = T3Path()

  public init() {}

  public func saveGState() { stateStack.append(state) }
  public func restoreGState() {
    if let restored = stateStack.popLast() { state = restored }
  }

  public func setFillColor(_ color: CGColor) { state.fill = color.resolved }
  public func setFillColor(red: Double, green: Double, blue: Double, alpha: Double) {
    state.fill = T3Color(red: red, green: green, blue: blue, alpha: alpha)
  }
  public func setFillColor(gray: Double, alpha: Double) {
    state.fill = T3Color(red: gray, green: gray, blue: gray, alpha: alpha)
  }
  public func setStrokeColor(_ color: CGColor) { state.stroke = color.resolved }
  public func setStrokeColor(red: Double, green: Double, blue: Double, alpha: Double) {
    state.stroke = T3Color(red: red, green: green, blue: blue, alpha: alpha)
  }
  public func setLineWidth(_ width: Double) { state.lineWidth = width }
  public func setLineCap(_ cap: CGLineCap) { state.lineCap = cap }
  public func setLineJoin(_ join: CGLineJoin) { state.lineJoin = join }
  public func setBlendMode(_ mode: Int) {}
  public func setAllowsAntialiasing(_ allows: Bool) {}
  public func setShouldAntialias(_ should: Bool) {}
  public func setAlpha(_ alpha: Double) {}

  // MARK: fills

  public func fill(_ rect: CGRect) {
    append(T3DisplayOp.fill(rect: clipped(T3Rect(rect)), color: state.fill, cornerRadius: 0))
  }

  public func fillEllipse(in rect: CGRect) {
    append(T3DisplayOp.fillEllipse(rect: clipped(T3Rect(rect)), color: state.fill))
  }

  public func fillPath() {
    guard !pendingPath.verbs.isEmpty else { return }
    append(T3DisplayOp.fillPath(path: pendingPath, color: state.fill))
    pendingPath = T3Path()
  }

  public func strokePath() {
    guard !pendingPath.verbs.isEmpty else { return }
    append(
      T3DisplayOp.strokePath(
        path: pendingPath, color: state.stroke, lineWidth: state.lineWidth,
        cap: state.lineCap.rawValue, join: state.lineJoin.rawValue))
    pendingPath = T3Path()
  }

  public func strokeEllipse(in rect: CGRect) {
    append(
      T3DisplayOp.strokeEllipse(rect: clipped(T3Rect(rect)), color: state.stroke, lineWidth: state.lineWidth))
  }

  // MARK: paths

  public func move(to point: CGPoint) { pendingPath.verbs.append(.move(point.x, point.y)) }
  public func addLine(to point: CGPoint) { pendingPath.verbs.append(.line(point.x, point.y)) }
  public func addLines(between points: [CGPoint]) {
    guard let first = points.first else { return }
    pendingPath.verbs.append(.move(first.x, first.y))
    for point in points.dropFirst() { pendingPath.verbs.append(.line(point.x, point.y)) }
  }
  public func addQuadCurve(to point: CGPoint, control: CGPoint) {
    pendingPath.verbs.append(.quad(control.x, control.y, point.x, point.y))
  }
  public func addCurve(to point: CGPoint, control1: CGPoint, control2: CGPoint) {
    pendingPath.verbs.append(.curve(control1.x, control1.y, control2.x, control2.y, point.x, point.y))
  }
  public func closePath() { pendingPath.verbs.append(.close) }

  // MARK: clipping

  public func clip(to rect: CGRect) { state.clip = T3Rect(rect) }
  public func clip() {
    // Clip to the pending path's bounding box — the upstream code only clips to
    // rectangles; recording the bounds keeps replay exact for that case.
    guard let bounds = pathBounds(pendingPath) else { return }
    state.clip = bounds
    pendingPath = T3Path()
  }

  // MARK: gradients

  public func drawLinearGradient(
    _ gradient: CGGradient, start: CGPoint, end: CGPoint, options: CGGradientDrawingOptions = []
  ) {
    let rect = state.clip ?? T3Rect(x: 0, y: 0, width: 0, height: 0)
    append(
      .linearGradient(
        rect: rect,
        colors: gradient.colors.map { $0.resolved },
        locations: gradient.locations ?? gradient.colors.indices.map { Double($0) / Double(max(gradient.colors.count - 1, 1)) },
        startX: start.x, startY: start.y, endX: end.x, endY: end.y))
  }

  // MARK: text (called by the UIKit drawing shims)

  public func recordText(_ op: T3TextOp) {
    guard let clip = state.clip else {
      append(.text(op))
      return
    }
    append(.group(clip: clip, ops: [.text(op)]))
  }

  // MARK: output

  public func takeDisplayList() -> T3DisplayList {
    T3DisplayList(ops: ops)
  }

  // MARK: private

  private func append(_ op: T3DisplayOp) {
    guard let clip = state.clip else {
      ops.append(op)
      return
    }
    ops.append(.group(clip: clip, ops: [op]))
  }

  private func clipped(_ rect: T3Rect) -> T3Rect { rect }

  private func pathBounds(_ path: T3Path) -> T3Rect? {
    var minX = Double.infinity, minY = Double.infinity, maxX = -Double.infinity, maxY = -Double.infinity
    func include(_ x: Double, _ y: Double) {
      minX = min(minX, x); minY = min(minY, y); maxX = max(maxX, x); maxY = max(maxY, y)
    }
    for verb in path.verbs {
      switch verb {
      case .move(let x, let y), .line(let x, let y): include(x, y)
      case .quad(let cx, let cy, let x, let y), .curve(let cx, let cy, _, _, let x, let y):
        include(cx, cy); include(x, y)
      case .close: break
      }
    }
    guard minX.isFinite else { return nil }
    return T3Rect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
  }
}
