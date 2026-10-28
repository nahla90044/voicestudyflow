// lib/support.ts
// وكيل الدعم في «المساعدة» (قرار نهلة ٢٨ أكتوبر): يجيب فورًا من دليل التطبيق (مجانًا، بلا خصم من الحصة)،
// وما لم يُحلّ يُحفظ رسالةً للمالكة (support_tickets) فيصلها إشعار وترد على بريد صاحبها.
import { aiAssist } from "./ai";
import { getPlan } from "./plan";
import { APP_VERSION, supabase } from "./supabase";

import { parseSupport, type SupportAnswer } from "./supportCore";
export type { SupportAnswer };

export async function askSupport(question: string): Promise<SupportAnswer> {
  const q = question.trim().slice(0, 500);
  const raw = await aiAssist("support", q, q, undefined, undefined, 30000);
  return parseSupport(raw);
}

/** «لم تُحلّ مشكلتي»: رسالة للمالكة مع السؤال وإجابة الوكيل ونسخة التطبيق والباقة */
export async function sendTicket(question: string, answer: string): Promise<"ok" | "limit" | "fail"> {
  const plan = await getPlan().catch(() => "");
  const { error } = await supabase.from("support_tickets").insert({
    question: question.trim().slice(0, 1000),
    answer: answer.slice(0, 4000),
    app_version: String(APP_VERSION).slice(0, 40),
    plan: String(plan ?? "").slice(0, 20),
  });
  if (!error) return "ok";
  return /TICKET_LIMIT/.test(error.message) ? "limit" : "fail";
}

export type Ticket = { id: number; question: string; answer: string | null; plan: string | null; app_version: string | null; status: "open" | "done"; created_at: string; email: string | null };

/** للمالكة فقط (الخادم يرفض غيرها) */
export async function ownerTickets(): Promise<Ticket[]> {
  const { data } = await supabase.rpc("owner_tickets");
  return (data as Ticket[] | null) ?? [];
}

export async function closeTicket(id: number): Promise<boolean> {
  const { data } = await supabase.rpc("owner_close_ticket", { p_id: id });
  return data === true;
}
