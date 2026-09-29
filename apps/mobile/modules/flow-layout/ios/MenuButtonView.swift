import ExpoModulesCore
import ExpoUI
import SwiftUI
import UIKit

public final class MenuButtonItem: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  @Field var systemImage: String?
  @Field var checked: Bool = false
  @Field var destructive: Bool = false
  @Field var keepsMenuOpen: Bool = false

  public required init() {}
}

public final class MenuButtonSection: Record {
  @Field var title: String?
  @Field var items: [MenuButtonItem] = []

  public required init() {}
}

public final class MenuButtonViewProps: UIBaseViewProps {
  @Field var title: String = ""
  @Field var systemImage: String = "circle"
  @Field var imageColor: UIColor?
  @Field var imageLevel: Double?
  @Field var textColor: UIColor?
  @Field var fillColor: UIColor?
  @Field var fontFamily: String = "Geist-Medium"
  @Field var fontSize: Double = 13
  @Field var sections: [MenuButtonSection] = []
  @Field var menuAccessibilityLabel: String?
  var onSelect = EventDispatcher()
}

public struct MenuButtonView: ExpoSwiftUI.View {
  @ObservedObject public var props: MenuButtonViewProps

  public init(props: MenuButtonViewProps) {
    self.props = props
  }

  public var body: some View {
    MenuButtonRepresentable(props: props)
      .frame(height: 28)
  }
}

struct MenuButtonRepresentable: UIViewRepresentable {
  @ObservedObject var props: MenuButtonViewProps

  func makeUIView(context: Context) -> DeferredMenuButton {
    let button = DeferredMenuButton(type: .system)
    button.showsMenuAsPrimaryAction = true
    button.setContentHuggingPriority(.required, for: .horizontal)
    button.setContentCompressionResistancePriority(.required, for: .horizontal)
    return button
  }

  func updateUIView(_ button: DeferredMenuButton, context: Context) {
    button.onSelect = { id in props.onSelect(["id": id]) }
    button.accessibilityLabel = props.menuAccessibilityLabel
    button.menu = makeMenu(button)
    let configuration = makeConfiguration()
    if context.transaction.animation != nil {
      UIView.transition(
        with: button,
        duration: 0.15,
        options: [.transitionCrossDissolve, .allowUserInteraction, .beginFromCurrentState]
      ) {
        button.configuration = configuration
      }
    } else {
      button.configuration = configuration
    }
  }

  func sizeThatFits(_ proposal: ProposedViewSize, uiView: DeferredMenuButton, context: Context) -> CGSize? {
    let size = uiView.systemLayoutSizeFitting(
      CGSize(width: UIView.layoutFittingCompressedSize.width, height: 28),
      withHorizontalFittingPriority: .fittingSizeLevel,
      verticalFittingPriority: .required
    )
    return CGSize(width: ceil(size.width), height: 28)
  }

  private func makeConfiguration() -> UIButton.Configuration {
    var configuration = UIButton.Configuration.filled()
    configuration.cornerStyle = .capsule
    configuration.baseBackgroundColor = props.fillColor ?? .secondarySystemFill
    configuration.baseForegroundColor = props.textColor ?? .label
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 10, bottom: 0, trailing: 10)
    configuration.imagePadding = 5
    configuration.imagePlacement = .leading

    let font = UIFont(name: props.fontFamily, size: props.fontSize) ?? .systemFont(ofSize: props.fontSize, weight: .medium)
    var title = AttributedString(props.title)
    title.font = font
    configuration.attributedTitle = title

    let symbolConfiguration = UIImage.SymbolConfiguration(pointSize: 12, weight: .regular)
    let image: UIImage? = if let level = props.imageLevel {
      UIImage(systemName: props.systemImage, variableValue: level, configuration: symbolConfiguration)
    } else {
      UIImage(systemName: props.systemImage, withConfiguration: symbolConfiguration)
    }
    if let color = props.imageColor {
      configuration.image = image?.withTintColor(color, renderingMode: .alwaysOriginal)
    } else {
      configuration.image = image?.withTintColor(.secondaryLabel, renderingMode: .alwaysOriginal)
    }
    return configuration
  }

  private func makeMenu(_ button: DeferredMenuButton) -> UIMenu {
    let sections: [UIMenuElement] = props.sections.map { section in
      let actions: [UIMenuElement] = section.items.map { item in
        let action = UIAction(
          title: item.title,
          image: item.systemImage.flatMap { UIImage(systemName: $0) },
          attributes: item.destructive ? [.destructive] : [],
          state: item.checked ? .on : .off
        ) { [weak button] _ in
          button?.select(item.id)
        }
        if item.keepsMenuOpen, #available(iOS 16.0, *) {
          action.attributes.insert(.keepsMenuPresented)
        }
        return action
      }
      return UIMenu(title: section.title ?? "", options: .displayInline, children: actions)
    }
    return UIMenu(children: sections)
  }
}

final class DeferredMenuButton: UIButton {
  var onSelect: ((String) -> Void)?
  private var presenting = false
  private var pending: [String] = []

  func select(_ id: String) {
    if presenting {
      pending.append(id)
    } else {
      onSelect?(id)
    }
  }

  override func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    willDisplayMenuFor configuration: UIContextMenuConfiguration,
    animator: (any UIContextMenuInteractionAnimating)?
  ) {
    super.contextMenuInteraction(interaction, willDisplayMenuFor: configuration, animator: animator)
    presenting = true
  }

  override func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    willEndFor configuration: UIContextMenuConfiguration,
    animator: (any UIContextMenuInteractionAnimating)?
  ) {
    super.contextMenuInteraction(interaction, willEndFor: configuration, animator: animator)
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.presenting = false
      let selections = self.pending
      self.pending = []
      selections.forEach { self.onSelect?($0) }
    }
  }
}
