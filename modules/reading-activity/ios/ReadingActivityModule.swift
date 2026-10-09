import ActivityKit
import ExpoModulesCore
import Foundation

// يجب أن يطابق تمامًا targets/reading/ReadingAttributes.swift (ActivityKit يربطهما بالاسم)
@available(iOS 16.1, *)
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

struct ReadingStateRecord: Record {
  @Field var bookId: String = ""
  @Field var title: String = ""
  @Field var detail: String = ""
  @Field var progress: Double = 0
  @Field var rate: Double = 1
  @Field var playing: Bool = true
}

public class ReadingActivityModule: Module {
  private var observer: NSObjectProtocol?
  private var listening = false
  private var pending: String?

  public func definition() -> ModuleDefinition {
    Name("ReadingActivity")
    Events("onAction")

    // نراقب أوامر البطاقة منذ إنشاء الوحدة (لا عند أول مستمع فقط)، وما يصل قبل جاهزية
    // جافاسكربت يُحفظ ويُسلَّم فور بدء الاستماع — فلا يضيع ضغط زر والجوال مقفل.
    OnCreate {
      self.observer = NotificationCenter.default.addObserver(
        forName: Notification.Name("VSFReadingAction"), object: nil, queue: .main
      ) { [weak self] note in
        guard let self = self else { return }
        let action = note.userInfo?["action"] as? String ?? ""
        if self.listening {
          self.sendEvent("onAction", ["action": action])
        } else {
          self.pending = action
        }
      }
    }

    OnDestroy {
      if let o = self.observer { NotificationCenter.default.removeObserver(o) }
      self.observer = nil
    }

    OnStartObserving {
      self.listening = true
      if let a = self.pending {
        self.pending = nil
        self.sendEvent("onAction", ["action": a])
      }
    }

    OnStopObserving {
      self.listening = false
    }

    Function("isSupported") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    // يبدأ البطاقة أو يحدّثها إن كانت قائمة لنفس الكتاب (كتاب آخر → ننهي القديمة ونبدأ جديدة)
    AsyncFunction("show") { (rec: ReadingStateRecord) in
      guard #available(iOS 16.2, *) else { return }
      let state = ReadingAttributes.ContentState(
        title: rec.title, detail: rec.detail, progress: rec.progress, rate: rec.rate, playing: rec.playing)
      let content = ActivityContent(state: state, staleDate: nil)
      let all = Activity<ReadingAttributes>.activities
      if let current = all.first(where: { $0.attributes.bookId == rec.bookId }) {
        await current.update(content)
        for other in all where other.id != current.id {
          await other.end(nil, dismissalPolicy: .immediate)
        }
        return
      }
      for other in all { await other.end(nil, dismissalPolicy: .immediate) }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
      _ = try? Activity.request(attributes: ReadingAttributes(bookId: rec.bookId), content: content, pushType: nil)
    }

    AsyncFunction("end") { () in
      guard #available(iOS 16.2, *) else { return }
      for a in Activity<ReadingAttributes>.activities {
        await a.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}
