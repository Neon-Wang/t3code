import Foundation

// UniformTypeIdentifiers 蒸馏：文件呈现路径用 UTType 做类型嗅探/扩展名映射。
// shim 以「标识符字符串」为载体——上游只读它的身份与 preferredFilenameExtension。

public class UTType: NSObject, @unchecked Sendable {
  public let identifier: String

  /// Darwin UTType(_:) 为 failable（未知标识符返回 nil）；上游以
  /// `if let t = UTType(...)` 与 `UTType(filenameExtension:)` 两种形态调用。
  public init?(_ identifier: String) {
    self.identifier = identifier
  }

  /// 常用类型（呈现路径判定 fallback 用）。
  public static let text = UTType("public.text")!
  public static let plainText = UTType("public.plain-text")!
  public static let json = UTType("public.json")!
  public static let image = UTType("public.image")!
  public static let png = UTType("public.png")!
  public static let jpeg = UTType("public.jpeg")!
  public static let pdf = UTType("com.adobe.pdf")!
  public static let data = UTType("public.data")!
  public static let item = UTType("public.item")!

  public var preferredFilenameExtension: String? {
    switch identifier {
    case "public.plain-text": return "txt"
    case "public.json": return "json"
    case "public.png": return "png"
    case "public.jpeg": return "jpg"
    case "com.adobe.pdf": return "pdf"
    default: return nil
    }
  }

  public var isDynamic: Bool { false }

  /// Darwin 形态：`UTType(filenameExtension:)` failable 初始化器。
  public convenience init?(filenameExtension ext: String, conformingTo: UTType? = nil) {
    let mapped: UTType?
    switch ext.lowercased() {
    case "txt", "md", "log": mapped = UTType.plainText
    case "json": mapped = UTType.json
    case "png": mapped = UTType.png
    case "jpg", "jpeg": mapped = UTType.jpeg
    case "pdf": mapped = UTType.pdf
    default: mapped = nil
    }
    guard let resolved = mapped else { return nil }
    self.init(resolved.identifier)
  }
}