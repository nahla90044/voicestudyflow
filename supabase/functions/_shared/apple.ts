// supabase/functions/_shared/apple.ts
// التحقّق من مشتريات Apple مباشرة (StoreKit 2) بمكتبة Apple الرسمية:
// كل معاملة/إشعار يصل موقّعًا (JWS) بسلسلة شهادات تنتهي بجذر Apple — نتحقّق من
// السلسلة والتوقيع ومعرّف التطبيق، فلا يستطيع أحد تزوير اشتراك.
import { Buffer } from "node:buffer";
import type {
  JWSRenewalInfoDecodedPayload,
  JWSTransactionDecodedPayload,
  ResponseBodyV2DecodedPayload,
} from "npm:@apple/app-store-server-library@3.1.0";
import * as x509 from "npm:@peculiar/x509@1.12.3";

// مكتبة Apple الرسمية تعتمد على X509Certificate.verify/checkIssued من node:crypto وهي «غير مطبّقة»
// في Deno (بيئة دوال Supabase) — فكان التحقق يفشل لكل شراء ولا يُسجَّل أي اشتراك (اكتُشف ١٥ أكتوبر).
// هنا نفس فحوص Apple بمكتبة شهادات تعمل بـ WebCrypto: سلسلة الشهادات حتى جذر Apple، وعلامات Apple
// على الشهادات، وصلاحيتها وقت التوقيع، وتوقيع ES256 نفسه، ومعرّف التطبيق.
x509.cryptoProvider.set(crypto);

export const BUNDLE_ID = "io.nahlah.voicestudyflow";
export const APP_APPLE_ID = 6785257689;

// جذور Apple العامة (من apple.com/certificateauthority) — G3 بصمته SHA-256:
// 63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179
const ROOTS = [
  Buffer.from("MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==", "base64"),
  Buffer.from("MIIFkjCCA3qgAwIBAgIIAeDltYNno+AwDQYJKoZIhvcNAQEMBQAwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEcyMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxMDA5WhcNMzkwNDMwMTgxMDA5WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzIxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBANgREkhI2imKScUcx+xuM23+TfvgHN6sXuI2pyT5f1BrTM65MFQn5bPW7SXmMLYFN14UIhHF6Kob0vuy0gmVOKTvKkmMXT5xZgM4+xb1hYjkWpIMBDLyyED7Ul+f9sDx47pFoFDVEovy3d6RhiPw9bZyLgHaC/YuOQhfGaFjQQscp5TBhsRTL3b2CtcM0YM/GlMZ81fVJ3/8E7j4ko380yhDPLVoACVdJ2LT3VXdRCCQgzWTxb+4Gftr49wIQuavbfqeQMpOhYV4SbHXw8EwOTKrfl+q04tvny0aIWhwZ7Oj8ZhBbZF8+NfbqOdfIRqMM78xdLe40fTgIvS/cjTf94FNcX1RoeKz8NMoFnNvzcytN31O661A4T+B/fc9Cj6i8b0xlilZ3MIZgIxbdMYs0xBTJh0UT8TUgWY8h2czJxQI6bR3hDRSj4n4aJgXv8O7qhOTH11UL6jHfPsNFL4VPSQ08prcdUFmIrQB1guvkJ4M6mL4m1k8COKWNORj3rw31OsMiANDC1CvoDTdUE0V+1ok2Az6DGOeHwOx4e7hqkP0ZmUoNwIx7wHHHtHMn23KVDpA287PT0aLSmWaasZobNfMmRtHsHLDd4/E92GcdB/O/WuhwpyUgquUoue9G7q5cDmVF8Up8zlYNPXEpMZ7YLlmQ1A/bmH8DvmGqmAMQ0uVAgMBAAGjQjBAMB0GA1UdDgQWBBTEmRNsGAPCe8CjoA1/coB6HHcmjTAPBgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBBjANBgkqhkiG9w0BAQwFAAOCAgEAUabz4vS4PZO/Lc4Pu1vhVRROTtHlznldgX/+tvCHM/jvlOV+3Gp5pxy+8JS3ptEwnMgNCnWefZKVfhidfsJxaXwU6s+DDuQUQp50DhDNqxq6EWGBeNjxtUVAeKuowM77fWM3aPbn+6/Gw0vsHzYmE1SGlHKy6gLti23kDKaQwFd1z4xCfVzmMX3zybKSaUYOiPjjLUKyOKimGY3xn83uamW8GrAlvacp/fQ+onVJv57byfenHmOZ4VxG/5IFjPoeIPmGlFYl5bRXOJ3riGQUIUkhOb9iZqmxospvPyFgxYnURTbImHy99v6ZSYA7LNKmp4gDBDEZt7Y6YUX6yfIjyGNzv1aJMbDZfGKnexWoiIqrOEDCzBL/FePwN983csvMmOa/orz6JopxVtfnJBtIRD6e/J/JzBrsQzwBvDR4yGn1xuZW7AYJNpDrFEobXsmII9oDMJELuDY++ee1KG++P+w8j2Ud5cAeh6Squpj9kuNsJnfdBrRkBof0Tta6SqoWqPQFZ2aWuuJVecMsXUmPgEkrihLHdoBR37q9ZV0+N0djMenl9MU/S60EinpxLK8JQzcPqOMyT/RFtm2XNuyE9QoB6he7hY1Ck3DDUOUUi78/w0EP3SIEIwiKum1xRKtzCTrJ+VKACd+66eYWyi4uTLLT3OUEVLLUNIAytbwPF+E=", "base64"),
];

const ROOT_DER = ROOTS.map((b) => new Uint8Array(b));

// علامات Apple على شهادات التوقيع (كما تفحصها مكتبة Apple)
const OID_LEAF = "1.2.840.113635.100.6.11.1"; // شهادة توقيع App Store
const OID_INTERMEDIATE = "1.2.840.113635.100.6.2.1"; // شهادة Apple الوسيطة

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const raw = Buffer.from(b64, "base64");
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  out.set(raw);
  return out;
}
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** يتحقّق من JWS موقّع من Apple ويُرجع محتواه. يرمي إن كان مزوّرًا أو بسلسلة غير Apple.
 *  trustedRoots للاختبار فقط (الافتراضي: جذور Apple الحقيقية). */
export async function verifyAppleJws<T>(jws: string, trustedRoots: Uint8Array[] = ROOT_DER): Promise<T> {
  const parts = String(jws).split(".");
  if (parts.length !== 3) throw new Error("jws: bad format");
  const [h, p, sig] = parts;
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
  if (header.alg !== "ES256") throw new Error(`jws: alg ${header.alg}`);
  const chain: string[] = header.x5c ?? [];
  if (chain.length !== 3) throw new Error(`jws: x5c length ${chain.length}`);
  const [leaf, inter, root] = chain.map((c) => new x509.X509Certificate(c));

  // ١) الجذر = جذر Apple نفسه (مطابقة بايت ببايت)
  if (!trustedRoots.some((r) => sameBytes(r, new Uint8Array(root.rawData)))) throw new Error("jws: untrusted root");
  // ٢) علامات Apple على الشهادتين
  if (!leaf.getExtension(OID_LEAF)) throw new Error("jws: leaf missing Apple OID");
  if (!inter.getExtension(OID_INTERMEDIATE)) throw new Error("jws: intermediate missing Apple OID");
  // ٣) كل شهادة موقّعة من التي فوقها
  if (!(await inter.verify({ publicKey: root.publicKey, signatureOnly: true }))) throw new Error("jws: intermediate not signed by root");
  if (!(await leaf.verify({ publicKey: inter.publicKey, signatureOnly: true }))) throw new Error("jws: leaf not signed by intermediate");

  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  // ٤) صلاحية الشهادات وقت التوقيع
  const at = new Date(Number(payload.signedDate) || Date.now());
  for (const c of [leaf, inter, root]) {
    if (at < c.notBefore || at > c.notAfter) throw new Error("jws: certificate expired at signing time");
  }
  // ٥) توقيع ES256 بمفتاح الشهادة الطرفية (التوقيع r||s كما يتوقعه WebCrypto)
  const key = await crypto.subtle.importKey("spki", leaf.publicKey.rawData, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error("jws: bad signature");
  return payload as T;
}

// معرّفات المنتجات في App Store Connect → خطة السيرفر
export const PRODUCT_PLAN: Record<string, string> = {
  vsf_plus_month: "plus_month",
  vsf_plus_year: "plus_year",
  vsf_pro_month: "pro_month",
  vsf_pro_year: "pro_year",
  vsf_premium_month: "premium_month",
  vsf_premium_year: "premium_year",
};

// الصفحات الإضافية (شراء استهلاكي) → عدد الصفحات المضافة للرصيد
export const PAGE_PACKS: Record<string, number> = { vsf_pages_50: 50 };

/** يتحقّق من معاملة موقّعة (من التطبيق أو داخل إشعار). يرمي إن كانت مزوّرة أو لتطبيق آخر. */
export async function verifyTransaction(jws: string): Promise<JWSTransactionDecodedPayload> {
  const t = await verifyAppleJws<JWSTransactionDecodedPayload>(jws);
  if (t.bundleId !== BUNDLE_ID) throw new Error(`jws: bundle ${t.bundleId}`);
  return t;
}

/** معلومات التجديد الموقّعة (داخل الإشعار) — فيها مهلة الدفع gracePeriodExpiresDate. */
export async function verifyRenewalInfo(jws: string): Promise<JWSRenewalInfoDecodedPayload> {
  return await verifyAppleJws<JWSRenewalInfoDecodedPayload>(jws);
}

/** يتحقّق من إشعار App Store Server Notifications V2. */
export async function verifyNotification(signedPayload: string): Promise<ResponseBodyV2DecodedPayload> {
  const n = await verifyAppleJws<ResponseBodyV2DecodedPayload>(signedPayload);
  const bundle = n.data?.bundleId ?? n.summary?.bundleId;
  if (bundle && bundle !== BUNDLE_ID) throw new Error(`notification: bundle ${bundle}`);
  return n;
}

/** هل هذه المعاملة تمنح اشتراكًا الآن؟ (لم تنتهِ ولم تُسترجع) */
/** أسبوع التجربة المجانية (عرض تمهيدي مجاني): حدوده صغيرة حتى يبدأ الدفع */
export function isTrial(t: JWSTransactionDecodedPayload): boolean {
  const x = t as unknown as { offerType?: number; offerDiscountType?: string; price?: number };
  return x.offerType === 1 && (x.offerDiscountType === "FREE_TRIAL" || x.price === 0);
}

export function isActive(t: JWSTransactionDecodedPayload): boolean {
  return !!t.expiresDate && t.expiresDate > Date.now() && !t.revocationDate;
}
