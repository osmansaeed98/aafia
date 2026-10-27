// A same-site path ("/account"), never another website. Rejects "//x"
// and backslashes, which browsers can treat as "//x" (another site).
export function isSafePath(value) {
  return typeof value === "string" && /^\/(?!\/)[^\\\s]*$/.test(value);
}
