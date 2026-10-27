import { cookies } from "next/headers";

// The number waiting for its code, kept in a short-lived cookie rather
// than the address bar, so it doesn't end up in browser history.
export const PHONE_COOKIE = "aafia_login_phone";

export async function phoneWaitingForCode() {
  return (await cookies()).get(PHONE_COOKIE)?.value ?? null;
}
