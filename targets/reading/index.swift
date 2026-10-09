import ActivityKit
import SwiftUI
import WidgetKit

@main
struct ReadingBundle: WidgetBundle {
  var body: some Widget {
    ReadingLiveActivity()
  }
}

private let gold = Color("gold")
private let night = Color("night")
private let nightSoft = Color("nightSoft")

private func rateLabel(_ r: Double) -> String {
  let s = r.truncatingRemainder(dividingBy: 1) == 0 ? String(format: "%.0f", r) : String(format: "%g", r)
  return "\(s)×"
}

/// زر التشغيل/الإيقاف (تفاعلي من iOS 17؛ قبلها يفتح التطبيق)
struct PlayButton: View {
  let playing: Bool
  var size: CGFloat = 44

  var body: some View {
    let icon = Image(systemName: playing ? "pause.fill" : "play.fill")
      .font(.system(size: size * 0.4, weight: .bold))
      .foregroundStyle(night)
      .frame(width: size, height: size)
      .background(Circle().fill(gold))
    if #available(iOS 17.0, *) {
      Button(intent: ToggleReadingIntent()) { icon }.buttonStyle(.plain)
    } else {
      icon
    }
  }
}

/// زر السرعة: كل ضغطة تنقل للسرعة التالية (٠٫٧٥ → ١ → ١٫٢٥ → ١٫٥ → ٢)
struct SpeedButton: View {
  let rate: Double

  var body: some View {
    let label = Text(rateLabel(rate))
      .font(.system(size: 14, weight: .heavy, design: .rounded))
      .foregroundStyle(.white)
      .padding(.horizontal, 12)
      .frame(height: 34)
      .background(Capsule().fill(Color.white.opacity(0.14)))
    if #available(iOS 17.0, *) {
      Button(intent: SpeedReadingIntent()) { label }.buttonStyle(.plain)
    } else {
      label
    }
  }
}

struct ProgressLine: View {
  let value: Double

  var body: some View {
    GeometryReader { g in
      ZStack(alignment: .leading) {
        Capsule().fill(Color.white.opacity(0.16))
        Capsule().fill(gold).frame(width: max(4, g.size.width * min(1, max(0, value))))
      }
    }
    .frame(height: 4)
    .environment(\.layoutDirection, .leftToRight)
  }
}

struct LockScreenView: View {
  let state: ReadingAttributes.ContentState

  var body: some View {
    VStack(spacing: 10) {
      HStack(spacing: 12) {
        Image(systemName: "book.closed.fill")
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(gold)
          .frame(width: 40, height: 40)
          .background(RoundedRectangle(cornerRadius: 12).fill(gold.opacity(0.16)))
        VStack(alignment: .leading, spacing: 2) {
          Text(state.title).font(.system(size: 15, weight: .bold)).foregroundStyle(.white).lineLimit(1)
          Text(state.detail).font(.system(size: 12)).foregroundStyle(.white.opacity(0.65)).lineLimit(1)
        }
        Spacer(minLength: 6)
        SpeedButton(rate: state.rate)
        PlayButton(playing: state.playing)
      }
      ProgressLine(value: state.progress)
    }
    .padding(16)
    .activityBackgroundTint(night)
    .activitySystemActionForegroundColor(gold)
  }
}

struct ReadingLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: ReadingAttributes.self) { context in
      LockScreenView(state: context.state)
        .widgetURL(URL(string: "voicestudyflow://listening/\(context.attributes.bookId)"))
    } dynamicIsland: { context in
      let s = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Image(systemName: "book.closed.fill")
            .font(.system(size: 20, weight: .semibold))
            .foregroundStyle(gold)
            .frame(width: 44, height: 44)
            .background(RoundedRectangle(cornerRadius: 13).fill(gold.opacity(0.16)))
        }
        DynamicIslandExpandedRegion(.trailing) {
          PlayButton(playing: s.playing, size: 44)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(alignment: .leading, spacing: 2) {
            Text(s.title).font(.system(size: 15, weight: .bold)).foregroundStyle(.white).lineLimit(1)
            Text(s.detail).font(.system(size: 12)).foregroundStyle(.white.opacity(0.65)).lineLimit(1)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack(spacing: 12) {
            ProgressLine(value: s.progress)
            SpeedButton(rate: s.rate)
          }
          .padding(.top, 4)
        }
      } compactLeading: {
        Image(systemName: "book.closed.fill").foregroundStyle(gold)
      } compactTrailing: {
        if s.playing {
          Image(systemName: "waveform").foregroundStyle(gold)
        } else {
          Image(systemName: "pause.fill").foregroundStyle(.white.opacity(0.7))
        }
      } minimal: {
        Image(systemName: s.playing ? "waveform" : "book.closed.fill").foregroundStyle(gold)
      }
      .keylineTint(gold)
      .widgetURL(URL(string: "voicestudyflow://listening/\(context.attributes.bookId)"))
    }
  }
}
