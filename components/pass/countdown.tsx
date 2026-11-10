"use client";

import { useEffect, useState } from "react";

export function PassCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setRemaining(Date.parse(expiresAt) - Date.now());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  let label = "Calculating time left";
  if (remaining !== null) {
    if (!Number.isFinite(remaining) || remaining <= 0) label = "Expired";
    else {
      const days = Math.floor(remaining / 86_400_000);
      const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
      label = days > 0 ? days + (days === 1 ? " day left" : " days left")
        : hours > 0 ? hours + (hours === 1 ? " hour left" : " hours left")
          : Math.max(1, Math.ceil(remaining / 60_000)) + " minutes left";
    }
  }

  return <span className="pass-countdown" aria-live="off">{label}</span>;
}
