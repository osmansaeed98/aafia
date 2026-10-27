"use client";

import { useEffect, useState } from "react";
import { fill, queueState } from "@/lib/booking";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

// The patient's place in the queue. Updates the moment reception calls
// the next number (live connection), and also checks every 30 seconds
// in case the connection is weak.
export default function LiveQueue({ bookingId, sessionId, number, bookingStatus: initialStatus, minutesPerPatient, initialSession, lang, t }) {
  const [session, setSession] = useState(initialSession);
  const [bookingStatus, setBookingStatus] = useState(initialStatus);
  const [offlineSince, setOfflineSince] = useState(null);

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    let stopped = false;

    // The session (public) and this booking's own status (seen, missed…).
    async function refresh() {
      const [{ data, error }, { data: booking }] = await Promise.all([
        supabase.from("sessions").select("status, now_serving, delay_minutes, notice").eq("id", sessionId).maybeSingle(),
        supabase.from("bookings").select("status").eq("id", bookingId).maybeSingle(),
      ]);
      if (stopped) return;
      if (error || !data) {
        setOfflineSince((since) => since ?? new Date());
      } else {
        setSession(data);
        if (booking) setBookingStatus(booking.status);
        setOfflineSince(null);
      }
    }

    const channel = supabase
      .channel(`session-${sessionId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` }, (change) => {
        setSession((s) => ({ ...s, ...change.new }));
        setOfflineSince(null);
        refresh();
      })
      .subscribe();
    const timer = setInterval(refresh, 30000);
    return () => {
      stopped = true;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [sessionId, bookingId]);

  const state = queueState({ number, bookingStatus, session, minutesPerPatient });
  const headline = {
    cancelled: t.cancelledSession,
    closed: t.closedSession,
    yourTurn: t.yourTurn,
    passed: t.passed,
    seen: t.statuses.seen,
    bookingCancelled: t.statuses.cancelled,
  }[state.kind];

  return (
    <section className="queue-card" aria-live="polite">
      <div className="queue-numbers">
        <div>
          <span className="queue-label">{t.yourNumber}</span>
          <strong className="queue-big">{number}</strong>
        </div>
        <div>
          <span className="queue-label">{t.nowServing}</span>
          <strong className="queue-big queue-serving" data-testid="now-serving">
            {session.now_serving > 0 ? session.now_serving : "–"}
          </strong>
        </div>
      </div>
      {headline ? (
        <p className={`queue-headline ${state.kind === "yourTurn" ? "queue-turn" : ""}`}>{headline}</p>
      ) : (
        <p className="queue-headline">
          {state.kind === "notStarted" && <>{t.notStarted} · </>}
          {fill(t.ahead, { n: state.ahead })} · {fill(t.wait, { n: state.wait })}
        </p>
      )}
      {session.status === "delayed" && session.delay_minutes > 0 && (
        <p className="queue-delay">{fill(t.delayed, { n: session.delay_minutes })}</p>
      )}
      {session.notice && <p className="queue-notice">{session.notice}</p>}
      <p className="footnote">
        {offlineSince
          ? `${t.offline} ${offlineSince.toLocaleTimeString(lang === "en" ? "en-GB-u-nu-latn" : "ar-SD-u-nu-latn", { hour: "numeric", minute: "2-digit" })}`
          : t.live}
      </p>
    </section>
  );
}
