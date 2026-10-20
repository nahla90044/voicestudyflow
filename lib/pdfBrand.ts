// lib/pdfBrand.ts
// ختم كل ملفات PDF المصدَّرة من التطبيق: في البداية شريط بالشعار واسم التطبيق وصاحب الملف، وفي النهاية
// بطاقة فيها الشعار ورمز QR لصفحة التطبيق في App Store وتنبيه الحقوق باسم صاحب الملف ورقم حسابه.
// الغرض: من يصله الملف يعرف أنه من تطبيق ويستطيع تنزيله، والملف المنتشر يُعرف صاحبه (رقم الحساب يربطه بحسابه).
// كل الطباعة والمشاركة تمر من printBranded / shareBranded فلا يخرج ملف بلا ختم.
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { getDisplayName } from "./auth";
import { APP_LOGO_PNG_BASE64, APP_STORE_QR_SVG } from "./pdfBrandAssets";
import { getCurrentLang } from "./i18n";
import { supabase } from "./supabase";

export type PdfOwner = { name: string; account: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** صاحب الملف: الاسم المعروض، ورقم حساب قصير (أول ٨ خانات من معرّف الحساب) */
export async function pdfOwner(): Promise<PdfOwner> {
  const [name, account] = await Promise.all([
    getDisplayName().catch(() => ""),
    supabase.auth
      .getSession()
      .then(({ data }) => (data.session?.user.id ?? "").slice(0, 8).toUpperCase())
      .catch(() => ""),
  ]);
  return { name, account };
}

function labels(rtl: boolean) {
  return rtl
    ? {
        app: "VoiceStudyFlow",
        tag: "تطبيق للمذاكرة بالاستماع: قراءة الكتب بصوت، وملخصات، واختبارات، وخرائط ذهنية",
        madeFor: "أُعدّ هذا الملف لـ",
        account: "رقم الحساب",
        get: "حمّل التطبيق من App Store",
        scan: "امسح الرمز بكاميرا الجوال",
        rights: "هذا الملف خاص بصاحبه أعلاه وأُنشئ بتطبيق VoiceStudyFlow. يُمنع نسخه أو نشره أو بيعه أو مشاركته علنًا دون إذن، وأي نشر يُنسب لصاحب الحساب المذكور.",
        copy: "جميع الحقوق محفوظة",
      }
    : {
        app: "VoiceStudyFlow",
        tag: "A study app: listen to books, with summaries, quizzes and mind maps",
        madeFor: "Prepared for",
        account: "Account",
        get: "Get the app on the App Store",
        scan: "Scan with your phone camera",
        rights: "This file belongs to the person named above and was created with VoiceStudyFlow. Copying, publishing, selling or sharing it publicly without permission is prohibited; any distribution is attributed to this account.",
        copy: "All rights reserved",
      };
}

const CSS = `
  .vsf-brand { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: -apple-system, 'SF Arabic', 'Geeza Pro', sans-serif; color: #1F2937; }
  .vsf-head { display: flex; align-items: center; gap: 10px; border: 1px solid #E5E7EB; background: #F9FAFB; border-radius: 12px; padding: 8px 12px; margin: 0 0 14px; break-inside: avoid; page-break-inside: avoid; }
  .vsf-head img { width: 34px; height: 34px; border-radius: 8px; flex: none; }
  .vsf-head .t { flex: 1; min-width: 0; }
  .vsf-head .n { font-weight: 900; font-size: 13px; color: #312E81; }
  .vsf-head .s { font-size: 10.5px; color: #6B7280; line-height: 1.5; }
  .vsf-head .o { font-size: 11px; color: #374151; text-align: end; line-height: 1.5; flex: none; }
  .vsf-head .o b { color: #111827; }
  .vsf-end { display: flex; align-items: center; gap: 16px; border: 1.5px solid #C7D2FE; background: #EEF2FF; border-radius: 16px; padding: 14px 16px; margin: 22px 0 0; break-inside: avoid; page-break-inside: avoid; }
  .vsf-end .qr { width: 92px; height: 92px; flex: none; background: #fff; border-radius: 8px; padding: 4px; }
  .vsf-end .qr svg { width: 100%; height: 100%; display: block; }
  .vsf-end .t { flex: 1; min-width: 0; }
  .vsf-end .row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .vsf-end img { width: 28px; height: 28px; border-radius: 7px; }
  .vsf-end .n { font-weight: 900; font-size: 14px; color: #312E81; }
  .vsf-end .g { font-weight: 800; font-size: 12.5px; color: #4338CA; }
  .vsf-end .sc { font-size: 10.5px; color: #6B7280; }
  .vsf-end .r { font-size: 10.5px; line-height: 1.7; color: #374151; margin-top: 6px; }
  .vsf-end .c { font-size: 10px; color: #6B7280; margin-top: 2px; }
  .vsf-page.vsf-first { page-break-before: auto; break-before: auto; page-break-after: always; break-after: page; }
  .vsf-page { page-break-before: always; break-before: page; display: flex; flex-direction: column; justify-content: center; min-height: 90vh; padding: 24px; box-sizing: border-box; }
`;

/** يضيف شريط البداية وبطاقة النهاية إلى صفحة HTML كاملة. العروض الأفقية (deck) تأخذ البطاقة في صفحة مستقلة. */
export function brandHtml(html: string, owner: PdfOwner, rtl = getCurrentLang() === "ar"): string {
  if (html.includes('class="vsf-brand')) return html; // مختوم مسبقًا
  const L = labels(rtl);
  const logo = `<img src="data:image/png;base64,${APP_LOGO_PNG_BASE64}" alt="">`;
  const who = owner.name ? esc(owner.name) : "—";
  const acc = owner.account ? `<br>${L.account}: <b>${esc(owner.account)}</b>` : "";
  const head = `<div class="vsf-brand vsf-head" dir="${rtl ? "rtl" : "ltr"}">${logo}<div class="t"><div class="n">${L.app}</div><div class="s">${L.tag}</div></div><div class="o">${L.madeFor}: <b>${who}</b>${acc}</div></div>`;
  const endCard = `<div class="vsf-brand vsf-end" dir="${rtl ? "rtl" : "ltr"}"><div class="qr">${APP_STORE_QR_SVG}</div><div class="t"><div class="row">${logo}<span class="n">${L.app}</span></div><div class="g">${L.get}</div><div class="sc">${L.scan}</div><div class="r">${L.madeFor}: <b>${who}</b>${owner.account ? ` · ${L.account}: <b>${esc(owner.account)}</b>` : ""}<br>${L.rights}</div><div class="c">© ${new Date().getFullYear()} VoiceStudyFlow · ${L.copy}</div></div></div>`;
  const deck = html.includes('data-deck="1"');
  // العروض: صفحة ختم كاملة في أولها وآخرها (لا يُقحم شيء داخل الشرائح فيختل مقاسها)
  const end = deck ? `<div class="vsf-page">${head}${endCard}</div>` : endCard;
  const start = deck ? `<div class="vsf-page vsf-first">${head}${endCard}</div>` : head;

  let out = html.includes("</head>") ? html.replace("</head>", `<style>${CSS}</style></head>`) : `<style>${CSS}</style>${html}`;
  const body = out.match(/<body[^>]*>/i);
  out = body ? out.replace(body[0], `${body[0]}${start}`) : `${start}${out}`;
  const close = out.lastIndexOf("</body>");
  return close >= 0 ? out.slice(0, close) + end + out.slice(close) : out + end;
}

/** يختم الصفحة بصاحب الملف الحالي */
export async function brandForCurrentUser(html: string): Promise<string> {
  return brandHtml(html, await pdfOwner());
}

/** طباعة مباشرة (نافذة الطباعة) بعد الختم */
export async function printBranded(html: string): Promise<void> {
  await Print.printAsync({ html: await brandForCurrentUser(html) });
}

/** ملف PDF مختوم ثم نافذة المشاركة (حفظ، إرسال، طباعة). page: مقاس الصفحة للعروض الأفقية */
export async function shareBranded(html: string, title: string, page?: { width: number; height: number }): Promise<void> {
  const branded = await brandForCurrentUser(html);
  const { uri } = await Print.printToFileAsync(page ? { html: branded, ...page } : { html: branded });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: title });
  else await Print.printAsync({ uri });
}
