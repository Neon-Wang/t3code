import Foundation

// Linux/OpenHarmony 兼容面（核心）：Selector 与动作分发。
//
// Darwin 上 Selector 来自 Foundation（ObjC runtime）；corelibs 没有——
// 非 Darwin 在此提供同名类型。配合同步工具的 #selector → Selector("…")
// 重写与生成的 t3Perform 动作表，target-action 全链路无 ObjC runtime。
// 放在 T3CoreGraphics：是 QuartzCore/UIKit 共同的最底层依赖。

#if canImport(Darwin)
// Darwin：Selector 来自 Foundation（ObjC runtime），直接对位。
public typealias Selector = Foundation.Selector
#else
/// corelibs 无 Selector：纯字符串载体对位。
public struct Selector: Hashable, Sendable, RawRepresentable, CustomStringConvertible {
  public let rawValue: String

  public init(_ rawValue: String) {
    self.rawValue = rawValue
  }

  public init(rawValue: String) {
    self.rawValue = rawValue
  }

  public var description: String { rawValue }
}
#endif

/// 由同步工具为每个含 @objc 动作方法的类生成的分发表遵循此协议；
/// target-action 的派发点（手势/控件/DisplayLink/通知）经它调用。
public protocol T3ActionPerformable: AnyObject {
  func t3Perform(_ action: Selector, _ argument: Any?)
}

#if canImport(Darwin)
extension Selector {
  /// Darwin Selector 无 rawValue 成员；字面量构造即存储名。
  public var t3Name: String { description }
}
#else
extension Selector {
  public var t3Name: String { rawValue }
}
#endif

@discardableResult
public func t3SendAction(_ target: AnyObject?, _ action: Selector, _ argument: Any?) -> Bool {
  guard let performable = target as? any T3ActionPerformable else {
    return false
  }
  performable.t3Perform(action, argument)
  return true
}
