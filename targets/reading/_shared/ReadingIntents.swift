import AppIntents
import Foundation

// أزرار بطاقة القراءة. تعمل داخل التطبيق نفسه (لا داخل الويدجت)، فترسل الأمر للقارئ
// عبر NotificationCenter، ويلتقطه modules/reading-activity ويوصله لجافاسكربت.
let readingActionNotification = Notification.Name("VSFReadingAction")

@available(iOS 17.0, *)
struct ToggleReadingIntent: AudioPlaybackIntent {
  static var title: LocalizedStringResource = "Play or pause reading"
  static var isDiscoverable: Bool = false

  init() {}

  func perform() async throws -> some IntentResult {
    NotificationCenter.default.post(name: readingActionNotification, object: nil, userInfo: ["action": "toggle"])
    return .result()
  }
}

@available(iOS 17.0, *)
struct SpeedReadingIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Change reading speed"
  static var isDiscoverable: Bool = false

  init() {}

  func perform() async throws -> some IntentResult {
    NotificationCenter.default.post(name: readingActionNotification, object: nil, userInfo: ["action": "speed"])
    return .result()
  }
}
