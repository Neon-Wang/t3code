import Foundation
import T3CoreGraphics

// UIScrollView: a scroll *model*. The embedder owns native scrolling (ArkUI
// Scroller) and drives contentOffset through the bridge; the vendored view's
// delegate callbacks, visible-range bookkeeping, and programmatic offset
// changes all run here on top of that single source of truth.

public protocol UIScrollViewDelegate: AnyObject {
  func scrollViewDidScroll(_ scrollView: UIScrollView)
  func scrollViewWillBeginDragging(_ scrollView: UIScrollView)
  func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool)
  func scrollViewDidEndDecelerating(_ scrollView: UIScrollView)
  func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView)
  func scrollViewShouldScrollToTop(_ scrollView: UIScrollView) -> Bool
  func scrollViewDidScrollToTop(_ scrollView: UIScrollView)
  func viewForZooming(in scrollView: UIScrollView) -> UIView?
  func scrollViewWillEndDragging(_ scrollView: UIScrollView, withVelocity velocity: CGPoint, targetContentOffset: UnsafeMutablePointer<CGPoint>)
}

extension UIScrollViewDelegate {
  public func scrollViewDidScroll(_ scrollView: UIScrollView) {}
  public func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {}
  public func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {}
  public func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {}
  public func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {}
  public func scrollViewShouldScrollToTop(_ scrollView: UIScrollView) -> Bool { true }
  public func scrollViewDidScrollToTop(_ scrollView: UIScrollView) {}
  public func viewForZooming(in scrollView: UIScrollView) -> UIView? { nil }
  public func scrollViewWillEndDragging(
    _ scrollView: UIScrollView, withVelocity velocity: CGPoint, targetContentOffset: UnsafeMutablePointer<CGPoint>
  ) {}
}

public enum UIScrollViewKeyboardDismissMode: Int {
  case none, onDrag, interactive, onDragWithAccessory
}

public enum UIScrollViewContentInsetAdjustmentBehavior: Int {
  case automatic, scrollableAxes, never, always
}

extension UIScrollView {
  public struct DecelerationRate: Sendable, Hashable {
    public let rawValue: Double
    public init(rawValue: Double) { self.rawValue = rawValue }
    public static let normal = DecelerationRate(rawValue: 0.998)
    public static let fast = DecelerationRate(rawValue: 0.99)
    public static let immediate = DecelerationRate(rawValue: 1.0)
  }
}

open class UIScrollView: UIView {
  public weak var delegate: UIScrollViewDelegate?
  public var contentOffset: CGPoint = .zero { didSet { delegate?.scrollViewDidScroll(self) } }
  public var contentSize: CGSize = .zero
  public var contentInset: UIEdgeInsets = .zero
  public var adjustedContentInset: UIEdgeInsets { contentInset }
  public var horizontalScrollIndicatorInsets: UIEdgeInsets = .zero
  public var verticalScrollIndicatorInsets: UIEdgeInsets = .zero
  public var showsHorizontalScrollIndicator = true
  public var showsVerticalScrollIndicator = true
  public var alwaysBounceVertical = false
  public var alwaysBounceHorizontal = false
  public var bounces = true
  public var isScrollEnabled = true
  public var isDirectionalLockEnabled = false
  public var decelerationRate: Double = 0.998
  public var refreshControl: UIRefreshControl?
  public var maximumZoomScale: Double = 1
  public var minimumZoomScale: Double = 1
  public var keyboardDismissMode: UIScrollViewKeyboardDismissMode = .none
  public var contentInsetAdjustmentBehavior: UIScrollViewContentInsetAdjustmentBehavior = .automatic
  public var isTracking = false
  public var isDragging = false
  public var isDecelerating = false

  public func setContentOffset(_ contentOffset: CGPoint, animated: Bool) {
    self.contentOffset = contentOffset
    if animated {
      delegate?.scrollViewDidEndScrollingAnimation(self)
    }
  }

  /// Embedder driving: user drag started (native gesture recognized).
  public func t3BeginDragging() {
    delegate?.scrollViewWillBeginDragging(self)
  }

  public func t3EndDragging(willDecelerate: Bool) {
    delegate?.scrollViewDidEndDragging(self, willDecelerate: willDecelerate)
    if !willDecelerate { t3FinishScrolling() }
  }

  public func t3EndDecelerating() {
    delegate?.scrollViewDidEndDecelerating(self)
    t3FinishScrolling()
  }

  public func t3FinishScrolling() {
    delegate?.scrollViewDidEndScrollingAnimation(self)
  }

  public var visibleRect: CGRect {
    CGRect(origin: contentOffset, size: bounds.size)
  }
}
