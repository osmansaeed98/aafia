import { randomUUID } from "node:crypto";

// Kept under the server's 4 MB form limit (the storage bucket allows 4 MB).
export const MAX_MEDICAL_FILE = 3 * 1024 * 1024;
const TYPES = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const RECORD_KINDS = ["lab_result", "prescription", "report", "other"];

// Uploads the form's "file" into a private folder of the "medical-files"
// bucket. Returns the stored path, or null if the file isn't acceptable.
export async function uploadMedicalFile(supabase, form, folder) {
  const file = form.get("file");
  if (!file || typeof file !== "object" || file.size === 0) return null;
  const ext = TYPES[file.type];
  if (!ext || file.size > MAX_MEDICAL_FILE) return null;
  const path = `${folder}/${randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("medical-files").upload(path, file, { contentType: file.type });
  return error ? null : path;
}

// Title and note from the form, trimmed to what the database accepts.
export function recordFields(form) {
  const kind = String(form.get("kind"));
  return {
    p_kind: RECORD_KINDS.includes(kind) ? kind : "other",
    p_title: String(form.get("title") ?? "").trim().slice(0, 120),
    p_notes: String(form.get("notes") ?? "").trim().slice(0, 500) || null,
  };
}
