// plugins/withXcode26Fixes.js
// إصلاحات البناء مع Xcode 26 — كانت يدوية في مجلد ios المحلي فقط، فتضيع عند أي
// prebuild نظيف (مثل بناء EAS). هنا تُطبَّق تلقائيًا في كل بناء:
//  1) مكتبة fmt تفشل بخاصية consteval في C++20 → نبنيها بـ C++17.
//  2) بناء React Native من المصدر (المكتبات المبنية مسبقًا لا تتوافق مع Xcode 26).
const { withPodfile, withPodfileProperties } = require("expo/config-plugins");

const MARK = "# vsf: fmt C++17 (Xcode 26)";

module.exports = function withXcode26Fixes(config) {
  config = withPodfileProperties(config, (c) => {
    c.modResults["ios.buildReactNativeFromSource"] = "true";
    return c;
  });
  config = withPodfile(config, (c) => {
    if (c.modResults.contents.includes(MARK)) return c;
    c.modResults.contents = c.modResults.contents.replace(
      /post_install do \|installer\|\n/,
      `post_install do |installer|
    ${MARK}
    installer.pods_project.targets.each do |target|
      if target.name == 'fmt'
        target.build_configurations.each do |cfg|
          cfg.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
        end
      end
    end
`
    );
    return c;
  });
  return config;
};
