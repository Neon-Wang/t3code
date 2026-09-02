import Foundation
import T3CoreGraphics

// MARK: - Control events

public struct UIEvent: Sendable {}

open class UIControl: UIView {
  public struct Event: OptionSet, Sendable {
    public let rawValue: UInt
    public init(rawValue: UInt) { self.rawValue = rawValue }
    public static let touchDown = Event(rawValue: 1 << 0)
    public static let touchUpInside = Event(rawValue: 1 << 6)
    public static let touchUpOutside = Event(rawValue: 1 << 7)
    public static let valueChanged = Event(rawValue: 1 << 12)
    public static let editingDidBegin = Event(rawValue: 1 << 16)
    public static let editingChanged = Event(rawValue: 1 << 17)
    public static let editingDidEnd = Event(rawValue: 1 << 18)
  }

  public var isEnabled = true
  public var isSelected = false
  public var isHighlighted = false

  public typealias ActionEntry = (target: NSObject, action: Selector, event: UIControl.Event)
  var actions: [ActionEntry] = []

  public func addTarget(_ target: Any?, action: Selector, for controlEvents: UIControl.Event) {
    guard let object = target as? NSObject else { return }
    actions.append((object, action, controlEvents))
  }

  public func removeTarget(_ target: Any?, action: Selector?, for controlEvents: UIControl.Event) {
    actions.removeAll { entry in
      (action == nil || entry.action == action) && (target == nil || entry.target === target as? NSObject)
    }
  }

  public func sendActions(for controlEvents: UIControl.Event) {
    for entry in actions where entry.event.contains(controlEvents) {
      t3SendAction(entry.target, entry.action, self)
    }
  }

  public func actions(forTarget target: Any?, forControlEvent event: UIControl.Event) -> [Selector]? {
    actions.filter { $0.target === target as? NSObject && $0.event.contains(event) }.map { $0.action }
  }
}

// MARK: - Text traits (flat option enums used by the input surfaces)

public enum UITextAutocorrectionType: Int { case `default`, yes, no }
public enum UITextAutocapitalizationType: Int { case none, sentences, words, allCharacters }
public enum UITextSpellCheckingType: Int { case `default`, yes, no }
public enum UITextSmartDashesType: Int { case `default`, yes, no }
public enum UITextSmartQuotesType: Int { case `default`, yes, no }
public enum UITextSmartInsertDeleteType: Int { case `default`, yes, no }
public enum UIKeyboardType: Int { case `default`, asciiCapable, numberPad, emailAddress, URL }
public enum UIReturnKeyType: Int { case `default`, go, google, join, next, route, search, send, yahoo, done, emergencyCall }
public enum UITextContentType: String { case none, URL, emailAddress }

// MARK: - Text field

public protocol UITextFieldDelegate: AnyObject {
  func textFieldShouldBeginEditing(_ textField: UITextField) -> Bool
  func textFieldDidBeginEditing(_ textField: UITextField)
  func textFieldShouldEndEditing(_ textField: UITextField) -> Bool
  func textFieldDidEndEditing(_ textField: UITextField)
  func textField(
    _ textField: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String) -> Bool
  func textFieldShouldReturn(_ textField: UITextField) -> Bool
}

extension UITextFieldDelegate {
  public func textFieldShouldBeginEditing(_ textField: UITextField) -> Bool { true }
  public func textFieldDidBeginEditing(_ textField: UITextField) {}
  public func textFieldShouldEndEditing(_ textField: UITextField) -> Bool { true }
  public func textFieldDidEndEditing(_ textField: UITextField) {}
  public func textField(
    _ textField: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String
  ) -> Bool { true }
  public func textFieldShouldReturn(_ textField: UITextField) -> Bool { true }
}

open class UITextField: UIControl {
  public static let textDidEndEditingNotification = Notification.Name(
    "UITextFieldTextDidEndEditingNotification")
  public static let textDidBeginEditingNotification = Notification.Name(
    "UITextFieldTextDidBeginEditingNotification")

  public weak var delegate: UITextFieldDelegate?
  public var text: String?
  public var attributedText: NSAttributedString?
  public var placeholder: String?
  public var font: UIFont?
  public var textColor: UIColor?
  public var textAlignment: NSTextAlignment = .natural
  public var autocorrectionType: UITextAutocorrectionType = .default
  public var autocapitalizationType: UITextAutocapitalizationType = .sentences
  public var spellCheckingType: UITextSpellCheckingType = .default
  public var smartDashesType: UITextSmartDashesType = .default
  public var smartQuotesType: UITextSmartQuotesType = .default
  public var smartInsertDeleteType: UITextSmartInsertDeleteType = .default
  public var keyboardType: UIKeyboardType = .default
  public var returnKeyType: UIReturnKeyType = .default
  public var enablesReturnKeyAutomatically = false
  public var isSecureTextEntry = false
  public var clearsOnBeginEditing = false
  public var borderStyle = 0
  private var t3InputAccessoryView: UIView?
  open var inputAccessoryView: UIView? {
    get { t3InputAccessoryView }
    set { t3InputAccessoryView = newValue }
  }
  public var inputView: UIView?


  public override func becomeFirstResponder() -> Bool {
    let accepted = super.becomeFirstResponder()
    if accepted {
      delegate?.textFieldDidBeginEditing(self)
      sendActions(for: .editingDidBegin)
    }
    return accepted
  }

  public override func resignFirstResponder() -> Bool {
    let resigned = super.resignFirstResponder()
    if resigned {
      sendActions(for: .editingDidEnd)
    }
    return resigned
  }

  /// Text input driving: the embedder forwards keyboard input targeted at the
  /// first responder; the field runs it through the delegate exactly like
  /// UIKit's text editing pipeline.
  public func t3InsertText(_ string: String) {
    guard isFirstResponder else { return }
    let current = text ?? ""
    let range = NSRange(location: (text as NSString?)?.length ?? 0, length: 0)
    if delegate?.textField(self, shouldChangeCharactersIn: range, replacementString: string) ?? true {
      text = current + string
      sendActions(for: .editingChanged)
    }
  }

  public func t3SubmitReturn() {
    _ = delegate?.textFieldShouldReturn(self)
  }

  open func deleteBackward() {}
}

// MARK: - Label

public final class UILabel: UIView {
  public var text: String?
  public var attributedText: NSAttributedString?
  public var font: UIFont = .systemFont(ofSize: 17)
  public var textColor: UIColor = .black
  public var numberOfLines = 1
  public var textAlignment: NSTextAlignment = .natural
  public var lineBreakMode: NSLineBreakMode = .byTruncatingTail
  public var adjustsFontForContentSizeCategory = false
}

// MARK: - Refresh control

public final class UIRefreshControl: UIControl {
  public var attributedTitle: NSAttributedString?

  public func beginRefreshing() {}
  public func endRefreshing() {}
  public var isRefreshing = false
}
