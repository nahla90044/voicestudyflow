// metro.config.js
// إعداد Metro الافتراضي من Expo + منع ملفات .env من دخول حزمة التطبيق.
// السبب: ملف مفاتيح محلي (.env.voicetest.local) كان يُقرأ كأنه كود فيفشل البناء،
// والأهم: لا يجوز أبدًا أن تدخل مفاتيح سرّية في حزمة تُشحن للمستخدمين.
// (متغيّرات EXPO_PUBLIC_ تبقى تعمل — Expo يقرأ .env بنفسه خارج Metro.)
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const envFiles = /(^|[\\/])\.env(\..*)?$/;
const existing = config.resolver.blockList;
config.resolver.blockList = existing
  ? [].concat(existing instanceof RegExp ? [existing] : existing, envFiles)
  : envFiles;

module.exports = config;
