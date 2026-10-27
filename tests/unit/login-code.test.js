import assert from "node:assert/strict";
import { test } from "node:test";
import { Webhook } from "standardwebhooks";
import { formatSudanPhone, normalizeSudanPhone } from "../../lib/phone.js";
import { handleSendCodeHook } from "../../lib/send-code-hook.js";
import { codeMessage, sendWhatsAppCode } from "../../lib/whatsapp.js";

test("Sudanese numbers are understood however they're typed", () => {
  for (const typed of ["0912345678", "0912 345 678", "912345678", "+249 912 345 678", "00249912345678", "249912345678", "٠٩١٢٣٤٥٦٧٨", "091-234-5678"]) {
    assert.equal(normalizeSudanPhone(typed), "+249912345678", typed);
  }
  assert.equal(normalizeSudanPhone("0123456789"), "+249123456789");
  assert.equal(formatSudanPhone("249912345678"), "0912 345 678");
});

test("non-Sudanese and non-mobile numbers are refused", () => {
  for (const typed of ["", "12345", "+447700900123", "+201001234567", "0512345678", "09123456789", "+249812345678"]) {
    assert.equal(normalizeSudanPhone(typed), null, typed);
  }
});

const env = {
  WHATSAPP_TOKEN: "test-token",
  WHATSAPP_PHONE_NUMBER_ID: "1234567890",
  SEND_CODE_HOOK_SECRET: `v1,whsec_${Buffer.from("a-test-secret-of-32-bytes-length!").toString("base64")}`,
};

test("the WhatsApp message uses the approved login-code template", () => {
  const message = codeMessage("+249912345678", "123456", env);
  assert.equal(message.to, "249912345678");
  assert.equal(message.type, "template");
  assert.equal(message.template.name, "aafia_login_code");
  assert.equal(message.template.language.code, "ar");
  assert.deepEqual(message.template.components[0].parameters, [{ type: "text", text: "123456" }]);
  assert.equal(message.template.components[1].sub_type, "url");
});

test("sending calls Meta with the token, and reports Meta's refusals", async () => {
  let call;
  const ok = async (url, init) => {
    call = { url, init };
    return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 });
  };
  await sendWhatsAppCode("+249912345678", "123456", { env, fetchImpl: ok });
  assert.equal(call.url, "https://graph.facebook.com/v23.0/1234567890/messages");
  assert.equal(call.init.headers.Authorization, "Bearer test-token");

  const refused = async () => new Response(JSON.stringify({ error: { code: 131030, message: "Recipient not allowed" } }), { status: 400 });
  await assert.rejects(sendWhatsAppCode("+249912345678", "123456", { env, fetchImpl: refused }), /131030/);
  await assert.rejects(sendWhatsAppCode("+249912345678", "1", { env: {} }), /not set up/);
});

function signedRequest(body, secret = env.SEND_CODE_HOOK_SECRET) {
  const payload = JSON.stringify(body);
  const wh = new Webhook(secret.replace("v1,whsec_", ""));
  const id = "msg_test";
  const now = new Date();
  return new Request("http://localhost/api/auth/send-code", {
    method: "POST",
    headers: {
      "webhook-id": id,
      "webhook-timestamp": String(Math.floor(now.getTime() / 1000)),
      "webhook-signature": wh.sign(id, now, payload),
      "content-type": "application/json",
    },
    body: payload,
  });
}

test("the hook sends the code only for genuine Supabase requests to Sudanese numbers", async () => {
  const sent = [];
  const send = async (to, code) => sent.push({ to, code });
  const body = { user: { phone: "249912345678" }, sms: { otp: "654321" } };

  const good = await handleSendCodeHook(signedRequest(body), { env, send });
  assert.equal(good.status, 200);
  assert.deepEqual(await good.json(), {});
  assert.deepEqual(sent, [{ to: "+249912345678", code: "654321" }]);

  const otherSecret = `v1,whsec_${Buffer.from("another-secret-another-secret-32b").toString("base64")}`;
  assert.equal((await handleSendCodeHook(signedRequest(body, otherSecret), { env, send })).status, 401);

  const foreign = { user: { phone: "+447700900123" }, sms: { otp: "654321" } };
  assert.equal((await handleSendCodeHook(signedRequest(foreign), { env, send })).status, 400);
  assert.equal(sent.length, 1, "nothing sent for refused requests");

  const failing = async () => { throw new Error("Meta down"); };
  const res = await handleSendCodeHook(signedRequest(body), { env, send: failing });
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error.http_code, 502);

  assert.equal((await handleSendCodeHook(signedRequest(body), { env: {}, send })).status, 500);
});

test("numbers written with both +249 and the leading 0 are understood", () => {
  assert.equal(normalizeSudanPhone("+249 0912 345 678"), "+249912345678");
  assert.equal(normalizeSudanPhone("002490912345678"), "+249912345678");
});
