"use client";

import { useEffect, useMemo, useState } from "react";

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

function nextMinuteDelay() {
  return 60_000 - (Date.now() % 60_000) + 20;
}

export function WorkspaceClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    let interval: number | undefined;
    const timeout = window.setTimeout(() => {
      setNow(new Date());
      interval = window.setInterval(() => setNow(new Date()), 60_000);
    }, nextMinuteDelay());
    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, []);

  const values = useMemo(
    () =>
      now
        ? { date: DATE_FORMAT.format(now), time: TIME_FORMAT.format(now) }
        : { date: "Current date", time: "--:--" },
    [now]
  );

  return (
    <div>
      <div style={{ color: "var(--app-text-strong)", fontWeight: 680 }}>
        {values.date}
      </div>
      <div className="app-muted" style={{ marginTop: 2, fontSize: 13 }}>
        {values.time}
      </div>
    </div>
  );
}
