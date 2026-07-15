// Email sending abstraction. INERT by default — only sends when RESEND_API_KEY is set.
// Security: reset/verify links go out by email only; callers must NEVER return the
// link or delivery status to the HTTP client (prevents account-takeover + enumeration).
//
// Enable later (no code change): set env RESEND_API_KEY (https://resend.com, free tier).
//   Optional: MAIL_FROM = "Onshelf <no-reply@yourdomain>" (default = Resend test sender).

export function mailerConfigured() {
  return !!process.env.RESEND_API_KEY;
}

// Returns { ok, delivered } — ok=logic succeeded, delivered=an email actually left.
// Without a key: ok:true, delivered:false (flow proceeds, nothing is sent).
export async function sendMail({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || "Onshelf <onboarding@resend.dev>";
  if (!key) {
    // 미설정: 실제 발송 없이 서버 로그로만. 링크/토큰은 로그에도 남기지 않는다(운영자 콘솔 유출 방지).
    console.log(`[mailer] skipped (no RESEND_API_KEY) → to=${to} subject=${JSON.stringify(subject)}`);
    return { ok: true, delivered: false };
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error(`[mailer] Resend ${r.status}: ${t.slice(0, 300)}`);
      return { ok: false, delivered: false, error: `이메일 발송 실패 (${r.status})` };
    }
    return { ok: true, delivered: true };
  } catch (e) {
    console.error("[mailer] error:", e && e.message);
    return { ok: false, delivered: false, error: "이메일 발송 중 오류가 발생했습니다." };
  }
}
