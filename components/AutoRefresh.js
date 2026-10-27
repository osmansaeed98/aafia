"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Reloads the page's data every few seconds (new bookings appear on the
// reception screen without pressing anything).
export default function AutoRefresh({ seconds = 30 }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
