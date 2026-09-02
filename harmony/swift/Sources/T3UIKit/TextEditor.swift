import Foundation
import T3CoreGraphics

// The text editor shim models an editable attributed document. On device the
// *rendered* editor is the platform text component (ArkTS RichEditor); this
// model runs the vendored editor logic — controlled-document protocol, chip
// attachments, serialization, delegate decisions — and the bridge keeps both
// sides synchronized.

// MARK: - Attachments

open class NSTextAttachment: NSObject {
  public var bounds: CGRect = .zero
  public var image: UIImage?
  public var attachmentCell: AnyObject?

  public required init?(coder: NSCoder) {
    super.init()
  }

  /// 占位构造（Linux corelibs 的 designated init 需要 string/coder；shim
  /// 附件不参与真实编码——同步工具把上游 super.init(data:ofType:) 改写到这里）。
  public init(attachmentPlaceholder: Void) {
    super.init()
  }
}

/// TextKit storage, distilled: an attributed string the editor mutates.
/// NSAttributedString is a class cluster on Darwin — a subclass must own its
/// storage and implement the two mutation primitives plus attribute reads.
public class NSTextStorage: NSMutableAttributedString {
  private var backing = NSAttributedString(string: "")

  public required init?(coder: NSCoder) {
    super.init(coder: coder)
  }

  override public init(string str: String) {
    super.init(string: str)
    backing = NSAttributedString(string: str)
  }

#if canImport(Darwin)
  public override convenience init() {
    self.init(string: "")
  }
#endif

  override public var length: Int { backing.length }
  override public var string: String { backing.string }

  override public func attributes(
    at location: Int, effectiveRange range: NSRangePointer?
  ) -> [NSAttributedString.Key: Any] {
    backing.attributes(at: location, effectiveRange: range)
  }

  override public func replaceCharacters(in range: NSRange, with attrString: NSAttributedString) {
    let mutable = NSMutableAttributedString(attributedString: backing)
    mutable.replaceCharacters(in: range, with: attrString)
    backing = mutable
  }

  override public func replaceCharacters(in range: NSRange, with str: String) {
    replaceCharacters(in: range, with: NSAttributedString(string: str))
  }

  override public func setAttributes(_ attrs: [NSAttributedString.Key: Any]?, range: NSRange) {
    let mutable = NSMutableAttributedString(attributedString: backing)
    mutable.setAttributes(attrs, range: range)
    backing = mutable
  }
}

/// TextKit container, distilled to the layout knobs the composer touches.
public class NSTextContainer: NSObject {
  public var lineFragmentPadding: Double = 5
  public var size: CGSize = .zero
  public var maximumNumberOfLines = 0
}

// MARK: - Text drop vocabulary

public protocol UITextDroppable: AnyObject {}

public enum UITextDropOperation: Int {
  case cancel, forbidden, copy, move
}

public enum UITextDropAction: Int {
  case cancel, insert, replaceAll
}

public enum UITextDropPerformer: Int {
  case view, delegate
}

public final class UIDragItem: NSObject {
  public let itemProvider = NSItemProvider()
}

public final class UIDropSession: NSObject {
  public var items: [UIDragItem] { [] }
}

// MARK: - Delegate

/// Inherits the scroll delegate so a single `delegate` property serves both
/// roles (UIKit achieves this via ObjC property covariance).
public protocol UITextViewDelegate: UIScrollViewDelegate, NSObjectProtocol {
  func textViewShouldBeginEditing(_ textView: UITextView) -> Bool
  func textViewDidBeginEditing(_ textView: UITextView)
  func textViewShouldEndEditing(_ textView: UITextView) -> Bool
  func textViewDidEndEditing(_ textView: UITextView)
  func textViewDidChange(_ textView: UITextView)
  func textViewDidChangeSelection(_ textView: UITextView)
  func textView(
    _ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool
  func textView(
    _ textView: UITextView, shouldInteractWith URL: URL, in characterRange: NSRange,
    interaction: Int) -> Bool
}

extension UITextViewDelegate {
  public func textViewShouldBeginEditing(_ textView: UITextView) -> Bool { true }
  public func textViewDidBeginEditing(_ textView: UITextView) {}
  public func textViewShouldEndEditing(_ textView: UITextView) -> Bool { true }
  public func textViewDidEndEditing(_ textView: UITextView) {}
  public func textViewDidChange(_ textView: UITextView) {}
  public func textViewDidChangeSelection(_ textView: UITextView) {}
  public func textView(
    _ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String
  ) -> Bool { true }
  public func textView(
    _ textView: UITextView, shouldInteractWith URL: URL, in characterRange: NSRange, interaction: Int
  ) -> Bool { true }
}

// MARK: - Text view

open class UITextView: UIScrollView {
  public static let textDidEndEditingNotification = Notification.Name(
    "UITextViewTextDidEndEditingNotification")
  public static let textDidBeginEditingNotification = Notification.Name(
    "UITextViewTextDidBeginEditingNotification")

  /// The scroll delegate property is reused; text-specific callbacks cast.
  public var textViewDelegate: UITextViewDelegate? {
    get { delegate as? UITextViewDelegate }
    set { delegate = newValue }
  }

  /// Backing store. `attributedText` is a non-optional window onto it, exactly
  /// like UIKit's implicitly-unwrapped property.
  public let textStorage = NSTextStorage(string: "")

  public var text: String {
    get { attributedText.string }
    set { attributedText = NSAttributedString(string: newValue) }
  }
  public var attributedText: NSAttributedString {
    get { textStorage }
    set {
      textStorage.replaceCharacters(
        in: NSRange(location: 0, length: textStorage.length), with: newValue)
      contentSize = CGSize(
        width: bounds.width,
        height: UIFont.measurer.lineHeight(of: font ?? .systemFont(ofSize: 14)))
    }
  }
  public var font: UIFont? = .systemFont(ofSize: 14)
  public var textColor: UIColor?
  public var textAlignment: NSTextAlignment = .natural
  public var isEditable = true
  public var isSelectable = true
  public var textContainerInset: UIEdgeInsets = UIEdgeInsets(top: 8, left: 0, bottom: 8, right: 0)
  public var textContainerLineFragmentPadding: Double = 5
  public var lineFragmentPadding: Double = 0
  public var selectedRange = NSRange(location: 0, length: 0)
  public var typingAttributes: [NSAttributedString.Key: Any] = [:]
  public var clearsOnInsertion = false
  private var t3InputAccessoryView: UIView?
  open var inputAccessoryView: UIView? {
    get { t3InputAccessoryView }
    set { t3InputAccessoryView = newValue }
  }
  public var inputView: UIView?
  public let textContainer = NSTextContainer()
  public var textDropDelegate: UITextDropDelegate?
  public var adjustsFontForContentSizeCategory = false
  public var returnKeyType: UIReturnKeyType = .default
  public var autocorrectionType: UITextAutocorrectionType = .default
  public var autocapitalizationType: UITextAutocapitalizationType = .sentences
  public var spellCheckingType: UITextSpellCheckingType = .default
  public var smartDashesType: UITextSmartDashesType = .default
  public var smartQuotesType: UITextSmartQuotesType = .default
  public var keyboardType: UIKeyboardType = .default

  public override func becomeFirstResponder() -> Bool {
    let accepted = textViewDelegate?.textViewShouldBeginEditing(self) ?? true
    guard accepted, super.becomeFirstResponder() else { return false }
    textViewDelegate?.textViewDidBeginEditing(self)
    return true
  }

  public override func resignFirstResponder() -> Bool {
    guard let delegate = textViewDelegate else { return super.resignFirstResponder() }
    guard delegate.textViewShouldEndEditing(self) else { return false }
    guard super.resignFirstResponder() else { return false }
    delegate.textViewDidEndEditing(self)
    return true
  }

  // MARK: UITextInput surface (opaque integer positions over UTF-16 storage)

  public final class UITextPosition: NSObject {
    let offset: Int
    init(offset: Int) { self.offset = offset }
  }

  public final class UITextRange: NSObject {
    let range: NSRange
    init(range: NSRange) { self.range = range }
  }

  open var markedTextRange: UITextRange? { nil }
  open var beginningOfDocument: UITextPosition { UITextPosition(offset: 0) }
  open var endOfDocument: UITextPosition { UITextPosition(offset: textStorage.length) }

  open func position(from position: UITextPosition, offset: Int) -> UITextPosition? {
    let target = position.offset + offset
    guard target >= 0, target <= textStorage.length else { return nil }
    return UITextPosition(offset: target)
  }

  open func textRange(from: UITextPosition, to: UITextPosition) -> UITextRange? {
    guard from.offset <= to.offset else { return nil }
    return UITextRange(range: NSRange(location: from.offset, length: to.offset - from.offset))
  }

  open func replace(_ range: UITextRange, withText text: String) {
    textStorage.replaceCharacters(in: range.range, with: text)
    selectedRange = NSRange(location: range.range.location + (text as NSString).length, length: 0)
    textViewDelegate?.textViewDidChange(self)
  }

  open func offset(from: UITextPosition, to: UITextPosition) -> Int {
    to.offset - from.offset
  }

  // MARK: input driving (bridge → vendored logic)

  public func t3Replace(range: NSRange, with replacement: String) {
    let accepted = textViewDelegate?.textView(self, shouldChangeTextIn: range, replacementText: replacement) ?? true
    guard accepted else { return }
    insertText(replacement)
  }

  open func insertText(_ text: String) {
    let current = attributedText
    let mutable = NSMutableAttributedString(attributedString: current)
    let location = min(selectedRange.location, mutable.length)
    let length = min(selectedRange.length, mutable.length - location)
    mutable.replaceCharacters(in: NSRange(location: location, length: length), with: text)
    attributedText = mutable
    selectedRange = NSRange(location: location + (text as NSString).length, length: 0)
    textViewDelegate?.textViewDidChange(self)
  }

  open func deleteBackward() {
    guard selectedRange.length > 0 || selectedRange.location > 0 else { return }
    let mutable = NSMutableAttributedString(attributedString: attributedText)
    var range = selectedRange
    if range.length == 0 {
      range = NSRange(location: max(range.location - 1, 0), length: 1)
    }
    mutable.deleteCharacters(in: range)
    attributedText = mutable
    selectedRange = NSRange(location: range.location, length: 0)
    textViewDelegate?.textViewDidChange(self)
  }

  open func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool { false }

  open func paste(_ sender: Any?) {}
  open func copy(_ sender: Any?) {}
  open func cut(_ sender: Any?) {}
  open func selectAll(_ sender: Any?) {}

  public func scrollRangeToVisible(_ range: NSRange) {}
}

// MARK: - Text drop surface (composer enables drops; device decides)

public protocol UITextDropDelegate: AnyObject {
  func textDroppableView(
    _ textDroppableView: UIView & UITextDroppable, proposalForDrop drop: UITextDropRequest
  ) -> UITextDropProposal
  func textDroppableView(
    _ textDroppableView: UIView & UITextDroppable, willPerformDrop drop: UITextDropRequest
  )
}

public final class UITextDropRequest: NSObject {
  public var droppedText: String?
  public var suggestedProposal = UITextDropProposal(operation: .copy)
  public var dropSession = UIDropSession()
}

public final class UITextDropProposal: NSObject {
  public var operation: UITextDropOperation
  public var useFastSameViewOperations = false
  public var dropAction: UITextDropAction = .insert
  public var dropPerformer: UITextDropPerformer = .view

  public init(operation: UITextDropOperation) {
    self.operation = operation
  }
}

extension UITextView {
  @discardableResult
  public func addInteraction(_ interaction: Any) -> Bool { false }
}

extension UITextView: UITextDroppable {}
