import ExpoModulesCore
import ExpoUI
import SwiftUI

public final class FlowLayoutViewProps: UIBaseViewProps {
  @Field var spacing: Double = 8
  @Field var lineSpacing: Double = 8
  @Field var duration: Double = 0.15
}

public struct FlowLayoutView: ExpoSwiftUI.View {
  @ObservedObject public var props: FlowLayoutViewProps
  @State private var settled = false

  public init(props: FlowLayoutViewProps) {
    self.props = props
  }

  public var body: some View {
    WrappingLayout(spacing: props.spacing, lineSpacing: props.lineSpacing) {
      Children()
    }
    .transaction { transaction in
      if settled {
        transaction.disablesAnimations = false
        transaction.animation = .timingCurve(0.22, 1, 0.36, 1, duration: props.duration)
      } else {
        transaction.animation = nil
      }
    }
    .onAppear {
      DispatchQueue.main.async { settled = true }
    }
  }
}

struct WrappingLayout: Layout {
  let spacing: CGFloat
  let lineSpacing: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let lines = arrange(subviews, within: proposal.width ?? .infinity)
    let width = lines.map(\.width).max() ?? 0
    let height = lines.map(\.height).reduce(0, +) + lineSpacing * CGFloat(max(lines.count - 1, 0))
    return CGSize(width: proposal.width ?? width, height: height)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var y = bounds.minY
    for line in arrange(subviews, within: bounds.width) {
      var x = bounds.minX
      for (index, size) in zip(line.indices, line.sizes) {
        subviews[index].place(
          at: CGPoint(x: x, y: y + (line.height - size.height) / 2),
          proposal: ProposedViewSize(size)
        )
        x += size.width + spacing
      }
      y += line.height + lineSpacing
    }
  }

  private struct Line {
    var indices: [Int] = []
    var sizes: [CGSize] = []
    var width: CGFloat = 0
    var height: CGFloat = 0
  }

  private func arrange(_ subviews: Subviews, within maxWidth: CGFloat) -> [Line] {
    var lines: [Line] = []
    var line = Line()
    for index in subviews.indices {
      let size = subviews[index].sizeThatFits(.unspecified)
      let next = line.indices.isEmpty ? size.width : line.width + spacing + size.width
      if !line.indices.isEmpty && next > maxWidth {
        lines.append(line)
        line = Line()
      }
      line.width = line.indices.isEmpty ? size.width : line.width + spacing + size.width
      line.height = max(line.height, size.height)
      line.indices.append(index)
      line.sizes.append(size)
    }
    if !line.indices.isEmpty {
      lines.append(line)
    }
    return lines
  }
}
