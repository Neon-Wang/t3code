import Foundation

// Paragraph-style vocabulary for attributed strings. Both Darwin-with-only-
// Foundation and swift-foundation (Linux/OpenHarmony) lack these AppKit types,
// so the shim declares them on every platform. Redefinition is avoided because
// no imported module here exports them.

public enum NSTextAlignment: Int, Sendable {
  case left = 0
  case right = 1
  case center = 2
  case justified = 3
  case natural = 4
}

public enum NSLineBreakMode: Int, Sendable {
  case byWordWrapping = 0
  case byCharWrapping = 1
  case byClipping = 2
  case byTruncatingHead = 3
  case byTruncatingTail = 4
  case byTruncatingMiddle = 5
}

public class NSParagraphStyle: NSObject, NSCopying, NSMutableCopying {
  public var alignment: NSTextAlignment = .natural
  public var lineBreakMode: NSLineBreakMode = .byTruncatingTail
  public var lineSpacing: Double = 0
  public var paragraphSpacing: Double = 0
  public var firstLineHeadIndent: Double = 0
  public var headIndent: Double = 0
  public var tailIndent: Double = 0
  public var minimumLineHeight: Double = 0
  public var maximumLineHeight: Double = 0
  public var lineHeightMultiple: Double = 0
  public var baseWritingDirection = 0

  public override init() { super.init() }

  public static let `default` = NSParagraphStyle()

  public func copy(with zone: NSZone? = nil) -> Any {
    let copy = NSParagraphStyle()
    assign(to: copy)
    return copy
  }

  public func mutableCopy(with zone: NSZone? = nil) -> Any {
    let copy = NSMutableParagraphStyle()
    assign(to: copy)
    return copy
  }

  func assign(to other: NSParagraphStyle) {
    other.alignment = alignment
    other.lineBreakMode = lineBreakMode
    other.lineSpacing = lineSpacing
    other.paragraphSpacing = paragraphSpacing
    other.firstLineHeadIndent = firstLineHeadIndent
    other.headIndent = headIndent
    other.tailIndent = tailIndent
    other.minimumLineHeight = minimumLineHeight
    other.maximumLineHeight = maximumLineHeight
    other.lineHeightMultiple = lineHeightMultiple
  }
}

public final class NSMutableParagraphStyle: NSParagraphStyle {}
