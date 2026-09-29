import ExpoModulesCore
import ExpoUI

public final class FlowLayoutModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FlowLayout")

    ExpoUIView(FlowLayoutView.self)
    ExpoUIView(MenuButtonView.self)
  }
}
