"use client";

import { usePathname } from "next/navigation";

// A plain link so it also works before (or without) JavaScript loading.
export default function LanguageSwitch({ label, to }) {
  const pathname = usePathname() ?? "/";
  const href = `/lang?to=${to}&next=${encodeURIComponent(pathname)}`;

  return (
    <a href={href} className="lang-switch" lang={to} hrefLang={to}>
      {label}
    </a>
  );
}
