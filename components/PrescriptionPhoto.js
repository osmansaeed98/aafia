"use client";

import { useRef, useState } from "react";

// Photo field that shrinks the picture on the phone before it's sent
// (a 4 MB camera photo becomes about 150–300 KB), saving the patient's
// data. Without JavaScript the original photo is sent; the server then
// explains if it's too big. Also used for medical files, where PDFs are
// sent as they are.
export default function PrescriptionPhoto({
  label,
  hint,
  readyLabel,
  tooBigLabel,
  name = "photo",
  accept = "image/*",
  maxBytes = 1024 * 1024, // the prescriptions storage limit
  required = false,
  // Lab reports need more detail than a prescription to stay readable.
  maxSide = 1280,
  quality = 0.7,
}) {
  const input = useRef(null);
  const [preview, setPreview] = useState(null);
  const [tooBig, setTooBig] = useState(false);

  // A photo this phone couldn't shrink and that is still too big: clear
  // it and say so, rather than sending megabytes that will be refused.
  function rejectIfTooBig() {
    const file = input.current.files?.[0];
    const big = Boolean(file && file.size > maxBytes);
    if (big) input.current.value = "";
    setTooBig(big);
  }

  async function shrink(event) {
    setTooBig(false);
    setPreview(null);
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return rejectIfTooBig();
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) return rejectIfTooBig();
      const small = new File([blob], "prescription.jpg", { type: "image/jpeg" });
      const files = new DataTransfer();
      files.items.add(small);
      input.current.files = files.files;
      setPreview({ url: URL.createObjectURL(blob), kb: Math.round(blob.size / 1024) });
      rejectIfTooBig();
    } catch {
      // This phone can't shrink it: keep the original if it's small enough.
      rejectIfTooBig();
    }
  }

  return (
    <label className="field">
      <span>{label}</span>
      <input
        ref={input}
        type="file"
        name={name}
        accept={accept}
        capture={accept === "image/*" ? "environment" : undefined}
        required={required}
        onChange={shrink}
      />
      <small className="hint">{hint}</small>
      {tooBig && (
        <small className="alert alert-error" role="alert">
          {tooBigLabel}
        </small>
      )}
      {preview && (
        <span className="photo-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.url} alt="" />
          <small>
            {readyLabel} · {preview.kb} KB
          </small>
        </span>
      )}
    </label>
  );
}
