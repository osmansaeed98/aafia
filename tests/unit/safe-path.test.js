import assert from "node:assert/strict";
import { test } from "node:test";
import { isSafePath } from "../../lib/safe-path.js";

test("after signing in, people only ever go to a page on this site", () => {
  for (const ok of ["/", "/account", "/admin/places/3?ok=saved"]) assert.ok(isSafePath(ok), ok);
  for (const bad of ["//evil.com", "/\\evil.com", "/\\/evil.com", "https://evil.com", "evil.com", "", null, "/ok\nLocation: x"]) {
    assert.ok(!isSafePath(bad), String(bad));
  }
});
