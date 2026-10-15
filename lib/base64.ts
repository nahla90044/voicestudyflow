// lib/base64.ts
// فكّ base64 إلى بايتات بجدول بحث (حرف ← قيمته مباشرة).
// النسخة السابقة كانت تبحث عن كل حرف داخل نص الأبجدية (indexOf) فتأخذ ثواني لصورة صفحة
// كبيرة، وتجمّد واجهة التطبيق كلها أثناء ذلك (القلم والأزرار والتمرير).
const LOOKUP = (() => {
  const t = new Uint8Array(256).fill(255);
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let i = 0; i < abc.length; i++) t[abc.charCodeAt(i)] = i;
  // صيغة الروابط (-_) تُقبل أيضًا
  t["-".charCodeAt(0)] = 62;
  t["_".charCodeAt(0)] = 63;
  return t;
})();

export function base64ToBytes(b64: string): Uint8Array {
  // نتجاهل أي حرف خارج الأبجدية (مسافات، أسطر، =)
  const vals = new Uint8Array(b64.length);
  let n = 0;
  for (let i = 0; i < b64.length; i++) {
    const v = LOOKUP[b64.charCodeAt(i) & 255];
    if (v !== 255 && b64.charCodeAt(i) < 256) vals[n++] = v;
  }
  const outLen = Math.floor((n * 3) / 4);
  const out = new Uint8Array(outLen);
  let p = 0;
  let i = 0;
  for (; i + 3 < n; i += 4) {
    const x = (vals[i] << 18) | (vals[i + 1] << 12) | (vals[i + 2] << 6) | vals[i + 3];
    out[p++] = (x >> 16) & 255;
    out[p++] = (x >> 8) & 255;
    out[p++] = x & 255;
  }
  // البقية (٢ أو ٣ أحرف بلا حشو)
  const rest = n - i;
  if (rest >= 2) {
    const x = (vals[i] << 18) | (vals[i + 1] << 12) | ((rest > 2 ? vals[i + 2] : 0) << 6);
    out[p++] = (x >> 16) & 255;
    if (rest > 2) out[p++] = (x >> 8) & 255;
  }
  return p === outLen ? out : out.subarray(0, p);
}
