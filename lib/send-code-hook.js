import { Webhook } from "standardwebhooks";
import { isSudanMobile } from "./phone.js";
import { sendWhatsAppCode } from "./whatsapp.js";

// Supabase's "Send SMS hook": called whenever a patient asks for a
// login code; we deliver it by WhatsApp instead of SMS.
// SEND_CODE_HOOK_SECRET is the secret Supabase shows when the hook is
// set up ("v1,whsec_..."). Requests without a valid signature are refused.

function reply(status, message) {
  const body = status === 200 ? {} : { error: { http_code: status, message } };
  return Response.json(body, { status });
}

export async function handleSendCodeHook(request, { env = process.env, send = sendWhatsAppCode } = {}) {
  const secret = env.SEND_CODE_HOOK_SECRET;
  if (!secret) return reply(500, "Login codes are not set up yet");

  const payload = await request.text();
  let data;
  try {
    data = new Webhook(secret.replace("v1,whsec_", "")).verify(payload, Object.fromEntries(request.headers));
  } catch {
    return reply(401, "Invalid signature");
  }

  const phone = String(data?.user?.phone ?? "");
  const e164 = phone.startsWith("+") ? phone : `+${phone}`;
  const code = String(data?.sms?.otp ?? "");
  if (!isSudanMobile(e164)) return reply(400, "Only Sudanese mobile numbers are supported");
  if (!/^\d{4,10}$/.test(code)) return reply(400, "Missing code");

  try {
    await send(e164, code, { env });
    return reply(200);
  } catch (error) {
    // Logged without the code itself.
    console.error("Login code not sent:", error.message);
    return reply(502, "Could not send the code by WhatsApp");
  }
}
