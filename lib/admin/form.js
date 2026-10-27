import { normalizeDigits } from "../format.js";
import { isSafePath } from "../safe-path.js";

export class InvalidInput extends Error {}

export function text(form, name, { required = true } = {}) {
  const value = form.get(name);
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (required && !trimmed) throw new InvalidInput(name);
  return trimmed || null;
}

export function number(form, name, { required = false, min, max, integer = false } = {}) {
  const raw = normalizeDigits(text(form, name, { required }) ?? "").replace(/[,\s]/g, "");
  if (raw === "") return null;
  const value = Number(raw);
  if (
    !Number.isFinite(value) ||
    (integer && !Number.isInteger(value)) ||
    (min !== undefined && value < min) ||
    (max !== undefined && value > max)
  ) {
    throw new InvalidInput(name);
  }
  return value;
}

export function checkbox(form, name) {
  return form.get(name) === "on";
}

export function phone(form, name, { required = false } = {}) {
  const raw = text(form, name, { required });
  if (raw === null) return null;
  const value = normalizeDigits(raw).replace(/[-()]/g, " ").replace(/\s+/g, " ").trim();
  if (!/^\+?[0-9 ]{3,20}$/.test(value)) throw new InvalidInput(name);
  return value;
}

export function time(form, name) {
  const value = normalizeDigits(text(form, name));
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new InvalidInput(name);
  return value;
}

// Latitude and longitude come as a pair or not at all.
export function coordinates(form) {
  const latitude = number(form, "latitude", { min: -90, max: 90 });
  const longitude = number(form, "longitude", { min: -180, max: 180 });
  if ((latitude === null) !== (longitude === null)) throw new InvalidInput("latitude");
  return { latitude, longitude };
}

// Where to go after saving: only admin pages.
export function returnPath(form, fallback = "/admin") {
  const value = form.get("back");
  return isSafePath(value) && value.startsWith("/admin")
    ? value
    : fallback;
}

export function withParam(path, key, value) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.delete("ok");
  params.delete("error");
  params.set(key, value);
  return `${base}?${params}`;
}
