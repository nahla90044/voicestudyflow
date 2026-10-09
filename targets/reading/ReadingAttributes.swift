import ActivityKit
import Foundation

// يجب أن يطابق تمامًا التعريف في modules/reading-activity (ActivityKit يربطهما بالاسم)
struct ReadingAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var title: String
    var detail: String
    var progress: Double
    var rate: Double
    var playing: Bool
  }

  var bookId: String
}
