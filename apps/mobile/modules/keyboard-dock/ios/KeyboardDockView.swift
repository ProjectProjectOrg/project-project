import ExpoModulesCore
import UIKit

// Rides above the keyboard like a view constrained to UIKit's keyboard layout
// guide. React Native lays this view out, so it can't take that constraint
// itself: a hidden tracker takes it instead. UIKit lays the tracker out inside
// the keyboard's own animation, so the transform set from that layout pass
// moves the dock in the same animation. Nothing is predicted or sent through
// JavaScript. The tracker hangs off the root view controller's view rather
// than a screen's, so a push doesn't swap its guide halfway through the
// keyboard's animation.
public final class KeyboardDockView: ExpoView {
  private var tracker: KeyboardTracker?

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
  }

  override public func didMoveToWindow() {
    super.didMoveToWindow()
    tracker?.removeFromSuperview()
    tracker = nil
    guard let host = window?.rootViewController?.view ?? window else { return }

    let tracker = KeyboardTracker { [weak self] height in
      self?.follow(keyboardHeight: height)
    }
    host.addSubview(tracker)
    if #available(iOS 17.0, *) {
      host.keyboardLayoutGuide.usesBottomSafeArea = false
    }
    NSLayoutConstraint.activate([
      tracker.leadingAnchor.constraint(equalTo: host.leadingAnchor),
      tracker.trailingAnchor.constraint(equalTo: host.trailingAnchor),
      tracker.topAnchor.constraint(equalTo: host.keyboardLayoutGuide.topAnchor),
      tracker.bottomAnchor.constraint(equalTo: host.bottomAnchor),
    ])
    self.tracker = tracker
  }

  // The dock sits at the bottom of the screen and pads for the home
  // indicator, which the keyboard covers, so it rises by the keyboard's height
  // minus that inset and keeps its own spacing above the keyboard. Before
  // iOS 17 the guide's lowest point is the safe area, which this also cancels.
  private func follow(keyboardHeight: CGFloat) {
    let inset = window?.safeAreaInsets.bottom ?? 0
    transform = CGAffineTransform(translationX: 0, y: -max(0, keyboardHeight - inset))
  }
}

private final class KeyboardTracker: UIView {
  private let onHeight: (CGFloat) -> Void

  init(onHeight: @escaping (CGFloat) -> Void) {
    self.onHeight = onHeight
    super.init(frame: .zero)
    isHidden = true
    isUserInteractionEnabled = false
    translatesAutoresizingMaskIntoConstraints = false
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    nil
  }

  private var reportedHeight: CGFloat = -1

  override func layoutSubviews() {
    super.layoutSubviews()
    if bounds.height != reportedHeight {
      reportedHeight = bounds.height
      onHeight(bounds.height)
    }
  }
}
