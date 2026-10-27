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

// Posts one message to Meta; throws with Meta's reason if refused.
async function postMessage(body, { env, fetchImpl }) {
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
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(4000),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = result?.error ?? {};
    throw new Error(`WhatsApp refused the message (${res.status} ${e.code ?? ""}): ${e.message ?? "unknown"}`);
  }
  return result;
}

export function sendWhatsAppCode(to, code, { env = process.env, fetchImpl = fetch } = {}) {
  return postMessage(codeMessage(to, code, env), { env, fetchImpl });
}

// Any other approved template with simple text parameters (used for
// booking messages, which are switched off for now).
export function sendWhatsAppTemplate(to, name, params, { env = process.env, fetchImpl = fetch } = {}) {
  return postMessage(
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: String(to).replace(/^\+/, ""),
      type: "template",
      template: {
        name,
        language: { code: env.WHATSAPP_TEMPLATE_LANG || "ar" },
        components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
      },
    },
    { env, fetchImpl },
  );
}
