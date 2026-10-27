// Sends the login code through Meta's WhatsApp Business Platform, using
// an approved "authentication" template with a copy-code button.
// Settings (Vercel → Environment Variables, never in code):
//   WHATSAPP_TOKEN            access token of the Meta system user
//   WHATSAPP_PHONE_NUMBER_ID  the sender number's ID in Meta
//   WHATSAPP_TEMPLATE_NAME    default "aafia_login_code"
//   WHATSAPP_TEMPLATE_LANG    default "ar"
//   WHATSAPP_API_VERSION      default "v23.0"

export function whatsappConfigured(env = process.env) {
  return Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

export function codeMessage(to, code, env = process.env) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to.replace(/^\+/, ""),
    type: "template",
    template: {
      name: env.WHATSAPP_TEMPLATE_NAME || "aafia_login_code",
      language: { code: env.WHATSAPP_TEMPLATE_LANG || "ar" },
      components: [
        { type: "body", parameters: [{ type: "text", text: code }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
      ],
    },
  };
}

export async function sendWhatsAppCode(to, code, { env = process.env, fetchImpl = fetch } = {}) {
  if (!whatsappConfigured(env)) {
    throw new Error("WhatsApp is not set up yet (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID missing)");
  }
  const version = env.WHATSAPP_API_VERSION || "v23.0";
  const res = await fetchImpl(`https://graph.facebook.com/${version}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(codeMessage(to, code, env)),
    signal: AbortSignal.timeout(4000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new Error(`WhatsApp refused the message (${res.status} ${e.code ?? ""}): ${e.message ?? "unknown"}`);
  }
  return body;
}
