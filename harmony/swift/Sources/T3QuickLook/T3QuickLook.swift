import Foundation
import T3UIKit

#if !canImport(Darwin)
/// Linux 无 Autoreleasing 指针：语义等价别名（非释放语义）。
public typealias AutoreleasingUnsafeMutablePointer<T> = UnsafeMutablePointer<T>
#endif

// Quick Look surface, distilled: preview item data + controller delegation.
// The embedder renders previews; this shim preserves the upstream lifecycle.

public protocol QLPreviewItem: NSObjectProtocol {
  var previewItemURL: URL? { get }
  var previewItemTitle: String? { get }
}

public protocol QLPreviewControllerDataSource: AnyObject {
  func numberOfPreviewItems(in controller: QLPreviewController) -> Int
  func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem
}

public protocol QLPreviewControllerDelegate: AnyObject {
  func previewController(
    _ controller: QLPreviewController, transitionViewFor item: QLPreviewItem) -> UIView?
  func previewController(
    _ controller: QLPreviewController, frameFor item: QLPreviewItem,
    inSourceView view: AutoreleasingUnsafeMutablePointer<UIView?>) -> CGRect
  func previewControllerDidDismiss(_ controller: QLPreviewController)
}

open class QLPreviewController: UIViewController {
  public weak var dataSource: QLPreviewControllerDataSource?
  public weak var delegate: QLPreviewControllerDelegate?
  public var currentItem: QLPreviewItem? { nil }
  public func reloadData() {}
}
