import Foundation

// On Darwin, `import Foundation` surfaces the CF geometry structs but none of
// the CoreGraphics conveniences (width/minX/insetBy/…). The vendored code uses
// those members on every platform, so this file provides them here — gated so
// builds against swift-corelibs-foundation (Linux/OpenHarmony), which already
// implements them natively, do not see duplicate declarations.
#if canImport(CoreGraphics)
import CoreGraphics

extension CGPoint {
  public static let zero = CGPoint(x: 0, y: 0)

  public func applying(_ transform: CGAffineTransform) -> CGPoint { self }
}

extension CGSize {
  public static let zero = CGSize(width: 0, height: 0)
}

extension CGRect {
  public static let zero = CGRect(
    origin: CGPoint(x: 0, y: 0), size: CGSize(width: 0, height: 0))
  public static let null = CGRect(
    origin: CGPoint(x: CGFloat.infinity, y: CGFloat.infinity), size: CGSize(width: 0, height: 0))
  public static let infinite = CGRect(
    origin: CGPoint(x: -CGFloat.infinity, y: -CGFloat.infinity),
    size: CGSize(width: CGFloat.infinity, height: CGFloat.infinity))
  public var maxX: CGFloat { origin.x + size.width }
  public var maxY: CGFloat { origin.y + size.height }
  public var midX: CGFloat { origin.x + size.width / 2 }
  public var midY: CGFloat { origin.y + size.height / 2 }
  public var width: CGFloat { size.width }
  public var height: CGFloat { size.height }
  public var isOpen: Bool { isEmpty && !isNull }

  public var standardized: CGRect {
    CGRect(
      origin: CGPoint(x: Swift.min(minX, maxX), y: Swift.min(minY, maxY)),
      size: CGSize(width: abs(size.width), height: abs(size.height)))
  }

  public var integral: CGRect {
    let standard = standardized
    let x = floor(standard.minX)
    let y = floor(standard.minY)
    return CGRect(
      origin: CGPoint(x: x, y: y),
      size: CGSize(width: ceil(standard.maxX) - x, height: ceil(standard.maxY) - y))
  }

  public var isNull: Bool {
    origin.x == .infinity && origin.y == .infinity && size.width == 0 && size.height == 0
  }

  public var isEmpty: Bool { size.width <= 0 || size.height <= 0 }

  public func insetBy(dx: CGFloat, dy: CGFloat) -> CGRect {
    CGRect(
      origin: CGPoint(x: minX + dx, y: minY + dy),
      size: CGSize(width: size.width - dx * 2, height: size.height - dy * 2))
  }

  public func offsetBy(dx: CGFloat, dy: CGFloat) -> CGRect {
    CGRect(
      origin: CGPoint(x: origin.x + dx, y: origin.y + dy), size: size)
  }

  public func union(_ other: CGRect) -> CGRect {
    guard !isEmpty else { return other }
    guard !other.isEmpty else { return self }
    let x = Swift.min(minX, other.minX)
    let y = Swift.min(minY, other.minY)
    return CGRect(
      origin: CGPoint(x: x, y: y),
      size: CGSize(
        width: Swift.max(maxX, other.maxX) - x,
        height: Swift.max(maxY, other.maxY) - y))
  }

  public func intersection(_ other: CGRect) -> CGRect {
    let x = Swift.max(minX, other.minX)
    let y = Swift.max(minY, other.minY)
    let width = Swift.min(maxX, other.maxX) - x
    let height = Swift.min(maxY, other.maxY) - y
    guard width > 0, height > 0 else { return .null }
    return CGRect(origin: CGPoint(x: x, y: y), size: CGSize(width: width, height: height))
  }

  public func intersects(_ other: CGRect) -> Bool {
    !intersection(other).isNull
  }

  public func contains(_ other: CGRect) -> Bool {
    other.minX >= minX && other.maxX <= maxX && other.minY >= minY && other.maxY <= maxY
  }

  public func contains(_ point: CGPoint) -> Bool {
    point.x >= minX && point.x < maxX && point.y >= minY && point.y < maxY
  }
}

extension CGAffineTransform {
  public static var identity: CGAffineTransform { CGAffineTransform() }
}
#endif
