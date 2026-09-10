import Foundation

// Linux/OpenHarmony 兼容面：Selector 与 ObjC runtime 语义的纯 Swift 替身。
//
// Darwin 上 Selector/KVO 来自 Foundation（ObjC runtime）；corelibs 两者皆无。
// shim 在非 Darwin 提供同名类型，配合同步工具的 #selector → Selector("…")
// 重写与生成的 t3Perform 动作表，target-action 全链路无 ObjC runtime。

#if !canImport(Darwin)

// MARK: - Selector 见 T3CoreGraphics/Compatibility.swift（QuartzCore 也需要）

// MARK: - NotificationCenter selector 版

extension NotificationCenter {
  /// corelibs 只有 block 版；selector 版经动作表转发（弱引用观察者，
  /// 与 ObjC unsafe-unretained 语义对齐——观察者释放后不再回调）。
  public func addObserver(
    _ observer: NSObject, selector aSelector: Selector, name: Notification.Name?,
    object anObject: Any?
  ) {
    addObserver(forName: name, object: anObject, queue: nil) { [weak observer] note in
      guard let observer else { return }
      if let performable = observer as? T3ActionPerformable {
        performable.t3Perform(aSelector, note)
      }
    }
  }
}

// MARK: - KVO-lite

public struct NSKeyValueObservingOptions: OptionSet, Sendable {
  public let rawValue: UInt
  public init(rawValue: UInt) { self.rawValue = rawValue }
  public static let initial = NSKeyValueObservingOptions(rawValue: 1 << 0)
  public static let new = NSKeyValueObservingOptions(rawValue: 1 << 1)
  public static let old = NSKeyValueObservingOptions(rawValue: 1 << 2)
  public static let prior = NSKeyValueObservingOptions(rawValue: 1 << 3)
}

public struct NSKeyValueObservedChange<Value> {
  public let newValue: Value?
  public let oldValue: Value?

  public init(newValue: Value?, oldValue: Value?) {
    self.newValue = newValue
    self.oldValue = oldValue
  }
}

public struct NSKeyValueObservation {
  public init() {}
  public func cancel() {}
  public func invalidate() {}
}

/// 纯 Swift keypath 观察。shim 模型（AVPlayerItem.status 等）在本层不
/// 变更——观察即为按 .initial 语义的一次性回调，与模型行为一致。
/// （Linux 上 Self 泛型受限，用显式 Root 参数；Darwin 走 Foundation KVO。）
public func t3Observe<Root: NSObject, Value>(
  _ object: Root,
  _ keyPath: KeyPath<Root, Value>,
  options: NSKeyValueObservingOptions = [],
  changeHandler: @escaping (Root, NSKeyValueObservedChange<Value>) -> Void
) -> NSKeyValueObservation {
  if options.contains(.initial) {
    changeHandler(object, NSKeyValueObservedChange(newValue: object[keyPath: keyPath], oldValue: nil))
  }
  return NSKeyValueObservation()
}

// MARK: - 杂项对位

extension NSCoder {
  /// shim 附件的占位解码器（不参与真实编码；Linux corelibs 的 NSCoder() 可用，
  /// 此处显式声明确保双平台形态一致）。
  public convenience init(placeholder: Void) {
    self.init()
  }
}

public func NSSelectorFromString(_ string: String) -> Selector { Selector(string) }

public func NSStringFromSelector(_ selector: Selector) -> String { selector.rawValue }

#endif
