// بطاقة القراءة الحيّة (Live Activity): تظهر في الجزيرة العائمة وشاشة القفل أثناء
// الاستماع — اسم الكتاب، الصفحة، التقدّم، وزرّا الإيقاف/الإكمال والتسريع.
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "widget",
  name: "ReadingActivity",
  displayName: "VoiceStudyFlow",
  deploymentTarget: "16.2",
  bundleIdentifier: ".reading",
  frameworks: ["SwiftUI", "WidgetKit", "ActivityKit", "AppIntents"],
  colors: {
    $accent: "#F6D58A",
    $widgetBackground: "#0B0E26",
    gold: "#F6D58A",
    night: "#0B0E26",
    nightSoft: "#1A2257",
  },
};
