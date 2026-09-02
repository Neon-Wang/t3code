import Foundation

// ImageIO surface, distilled: image-source sniffing used by file previews.

public final class CGImageSource: NSObject {}

public func CGImageSourceCreateWithURL(_ url: CFURL?, _ options: CFDictionary?) -> CGImageSource? { nil }
public func CGImageSourceGetCount(_ source: CGImageSource) -> Int { 0 }
public func CGImageSourceGetType(_ source: CGImageSource) -> CFString? { nil }
public func CGImageSourceCopyTypeIdentifiers() -> [CFString] { [] }

public func CGPDFDocument(_ url: CFURL?) -> AnyObject? { nil }
