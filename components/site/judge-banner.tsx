"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { X } from "lucide-react";

export function JudgeBanner() {
  const [dismissed, setDismissed] = useState(false);
  const pathname = usePathname();
  if (process.env.NEXT_PUBLIC_JUDGE_MODE !== "true" || dismissed || pathname.startsWith("/merchant") || pathname.startsWith("/api")) {
    return null;
  }
  return (
    <aside className="judge-banner" aria-label="Judge mode notice">
      <span className="judge-banner-dot" aria-hidden="true" />
      <p><strong>Judge mode</strong><span>PayPal sandbox only. No real money.</span></p>
      <Link href="/tour">Try the 3-minute tour <span aria-hidden="true">↗</span></Link>
      <button aria-label="Dismiss judge mode notice" className="judge-banner-close" onClick={() => setDismissed(true)} type="button"><X size={15} /></button>
    </aside>
  );
}
