import Foundation
import T3CoreGraphics

// A deliberately small constraint model: the vendored views express layout as
// "attribute = attribute * multiplier + constant" equalities (edge pinning plus
// fixed sizes). The solver resolves those with seeded iteration — no auto
// layout engine, no priorities, no ambiguity resolution beyond last-write-wins.

// MARK: - Attributes

public enum NSLayoutAttribute: Int {
  case left, right, top, bottom, leading, trailing
  case width, height
  case centerX, centerY
}

public enum NSLayoutRelation: Int {
  case equal, lessThanOrEqual, greaterThanOrEqual
}

// MARK: - Anchors

public class NSLayoutAnchor<AnchorType> {
  weak var item: NSObject?
  let attribute: NSLayoutAttribute

  init(item: NSObject, attribute: NSLayoutAttribute) {
    self.item = item
    self.attribute = attribute
  }

  public func constraint(equalTo anchor: NSLayoutAnchor<AnchorType>) -> NSLayoutConstraint {
    constraint(equalTo: anchor, constant: 0)
  }

  public func constraint(equalTo anchor: NSLayoutAnchor<AnchorType>, constant c: Double) -> NSLayoutConstraint {
    NSLayoutConstraint(item: item, attribute: attribute, relatedBy: .equal, toItem: anchor.item, attribute: anchor.attribute, multiplier: 1, constant: c)
  }

  public func constraint(greaterThanOrEqualTo anchor: NSLayoutAnchor<AnchorType>) -> NSLayoutConstraint {
    NSLayoutConstraint(item: item, attribute: attribute, relatedBy: .greaterThanOrEqual, toItem: anchor.item, attribute: anchor.attribute, multiplier: 1, constant: 0)
  }

  public func constraint(lessThanOrEqualTo anchor: NSLayoutAnchor<AnchorType>, constant c: Double = 0) -> NSLayoutConstraint {
    NSLayoutConstraint(item: item, attribute: attribute, relatedBy: .lessThanOrEqual, toItem: anchor.item, attribute: anchor.attribute, multiplier: 1, constant: c)
  }
}

public final class NSLayoutXAxisAnchor: NSLayoutAnchor<AnyObject> {}
public final class NSLayoutYAxisAnchor: NSLayoutAnchor<AnyObject> {}

public final class NSLayoutDimension: NSLayoutAnchor<AnyObject> {
  public func constraint(equalToConstant c: Double) -> NSLayoutConstraint {
    NSLayoutConstraint(item: item, attribute: attribute, relatedBy: .equal, toItem: nil, attribute: .width, multiplier: 1, constant: c)
  }

  public func constraint(equalTo anchor: NSLayoutDimension, multiplier m: Double) -> NSLayoutConstraint {
    NSLayoutConstraint(item: item, attribute: attribute, relatedBy: .equal, toItem: anchor.item, attribute: anchor.attribute, multiplier: m, constant: 0)
  }
}

// MARK: - Constraint

public final class NSLayoutConstraint: NSObject {
  public static var activeConstraints: [NSLayoutConstraint] = []

  public let firstItem: NSObject?
  public let firstAttribute: NSLayoutAttribute
  public let relation: NSLayoutRelation
  public let secondItem: NSObject?
  public let secondAttribute: NSLayoutAttribute
  public let multiplier: Double
  public var constant: Double
  public var isActive = false

  init(
    item: NSObject?, attribute: NSLayoutAttribute, relatedBy: NSLayoutRelation,
    toItem: NSObject?, attribute toAttribute: NSLayoutAttribute,
    multiplier: Double, constant: Double
  ) {
    self.firstItem = item
    self.firstAttribute = attribute
    self.relation = relatedBy
    self.secondItem = toItem
    self.secondAttribute = toAttribute
    self.multiplier = multiplier
    self.constant = constant
  }

  public static func activate(_ constraints: [NSLayoutConstraint]) {
    for constraint in constraints {
      constraint.isActive = true
      activeConstraints.append(constraint)
    }
  }

  public static func deactivate(_ constraints: [NSLayoutConstraint]) {
    for constraint in constraints {
      constraint.isActive = false
      activeConstraints.removeAll { $0 === constraint }
    }
  }
}

// MARK: - Solver

enum NSLayoutConstraintSolver {
  /// Resolve every active equality touching views in `root`'s tree. Values are
  /// seeded from current frames so unconstrained attributes keep their value;
  /// each pass applies active equalities until a fixed point.
  static func applyPendingConstraints(around root: UIView) {
    let tree = ObjectIdentifier(root)
    var members: Set<ObjectIdentifier> = []
    var queue = [root]
    while let view = queue.popLast() {
      members.insert(ObjectIdentifier(view))
      queue.append(contentsOf: view.subviews)
    }
    _ = tree

    let constraints = NSLayoutConstraint.activeConstraints.filter { constraint in
      constraint.relation == .equal && constraint.isActive
    }
    guard constraints.contains(where: { constraint in
      (constraint.firstItem as? UIView).map { members.contains(ObjectIdentifier($0)) } == true
        || (constraint.secondItem as? UIView).map { members.contains(ObjectIdentifier($0)) } == true
    }) else { return }

    // attribute slot keyed by (view, attribute)
    func key(_ object: NSObject?, _ attribute: NSLayoutAttribute) -> (ObjectIdentifier, Int) {
      (ObjectIdentifier(object ?? NSObject()), attribute.rawValue)
    }

    var values: [ObjectIdentifier: [Int: Double]] = [:]
    func seed(_ view: UIView) {
      let id = ObjectIdentifier(view)
      values[id] = [
        NSLayoutAttribute.left.rawValue: view.frame.minX,
        NSLayoutAttribute.right.rawValue: view.frame.maxX,
        NSLayoutAttribute.leading.rawValue: view.frame.minX,
        NSLayoutAttribute.trailing.rawValue: view.frame.maxX,
        NSLayoutAttribute.top.rawValue: view.frame.minY,
        NSLayoutAttribute.bottom.rawValue: view.frame.maxY,
        NSLayoutAttribute.width.rawValue: view.frame.width,
        NSLayoutAttribute.height.rawValue: view.frame.height,
        NSLayoutAttribute.centerX.rawValue: view.frame.midX,
        NSLayoutAttribute.centerY.rawValue: view.frame.midY,
      ]
    }
    var all: [UIView] = []
    var walkQueue = [root]
    while let view = walkQueue.popLast() {
      all.append(view)
      walkQueue.append(contentsOf: view.subviews)
    }
    all.forEach(seed)

    func read(_ object: NSObject?, _ attribute: NSLayoutAttribute) -> Double? {
      guard let id = object.map({ ObjectIdentifier($0) }) else { return nil }
      return values[id]?[attribute.rawValue]
    }

    func write(_ object: NSObject?, _ attribute: NSLayoutAttribute, _ value: Double) {
      guard let id = object.map({ ObjectIdentifier($0) }) else { return }
      values[id, default: [:]][attribute.rawValue] = value
    }

    for _ in 0..<4 {
      for constraint in constraints {
        guard constraint.firstItem != nil else { continue }
        if constraint.secondItem != nil {
          guard let rhs = read(constraint.secondItem, constraint.secondAttribute) else { continue }
          let value = rhs * constraint.multiplier + constraint.constant
          write(constraint.firstItem, constraint.firstAttribute, value)
          // Keep width/height consistent with the edges we just wrote.
          if let view = constraint.firstItem as? UIView {
            syncDerived(view: view)
          }
        } else {
          write(constraint.firstItem, constraint.firstAttribute, constraint.constant)
          if let view = constraint.firstItem as? UIView {
            syncDerived(view: view)
          }
        }
      }
    }

    func syncDerived(view: UIView) {
      let id = ObjectIdentifier(view)
      guard var slots = values[id] else { return }
      let left = slots[NSLayoutAttribute.left.rawValue]
      let right = slots[NSLayoutAttribute.right.rawValue]
      let top = slots[NSLayoutAttribute.top.rawValue]
      let bottom = slots[NSLayoutAttribute.bottom.rawValue]
      if let left, let right {
        slots[NSLayoutAttribute.width.rawValue] = right - left
        slots[NSLayoutAttribute.leading.rawValue] = left
        slots[NSLayoutAttribute.trailing.rawValue] = right
      }
      if let top, let bottom {
        slots[NSLayoutAttribute.height.rawValue] = bottom - top
      }
      values[id] = slots
    }

    // Write solved frames back.
    for view in all {
      let id = ObjectIdentifier(view)
      guard let slots = values[id] else { continue }
      let width = slots[NSLayoutAttribute.width.rawValue] ?? view.frame.width
      let height = slots[NSLayoutAttribute.height.rawValue] ?? view.frame.height
      let x = slots[NSLayoutAttribute.left.rawValue] ?? view.frame.minX
      let y = slots[NSLayoutAttribute.top.rawValue] ?? view.frame.minY
      view.frame = CGRect(x: x, y: y, width: max(width, 0), height: max(height, 0))
    }
  }
}

// MARK: - UIView anchor surface

extension UIView {
  public var leadingAnchor: NSLayoutXAxisAnchor { NSLayoutXAxisAnchor(item: self, attribute: .leading) }
  public var trailingAnchor: NSLayoutXAxisAnchor { NSLayoutXAxisAnchor(item: self, attribute: .trailing) }
  public var leftAnchor: NSLayoutXAxisAnchor { NSLayoutXAxisAnchor(item: self, attribute: .left) }
  public var rightAnchor: NSLayoutXAxisAnchor { NSLayoutXAxisAnchor(item: self, attribute: .right) }
  public var topAnchor: NSLayoutYAxisAnchor { NSLayoutYAxisAnchor(item: self, attribute: .top) }
  public var bottomAnchor: NSLayoutYAxisAnchor { NSLayoutYAxisAnchor(item: self, attribute: .bottom) }
  public var centerXAnchor: NSLayoutXAxisAnchor { NSLayoutXAxisAnchor(item: self, attribute: .centerX) }
  public var centerYAnchor: NSLayoutYAxisAnchor { NSLayoutYAxisAnchor(item: self, attribute: .centerY) }
  public var widthAnchor: NSLayoutDimension { NSLayoutDimension(item: self, attribute: .width) }
  public var heightAnchor: NSLayoutDimension { NSLayoutDimension(item: self, attribute: .height) }
}
