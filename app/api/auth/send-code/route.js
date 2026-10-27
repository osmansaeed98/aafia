import { handleSendCodeHook } from "@/lib/send-code-hook";

export async function POST(request) {
  return handleSendCodeHook(request);
}
