"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main className="friendly-error-shell">
    <span className="friendly-error-mark">✳</span>
    <p className="friendly-error-eyebrow">A small pause</p>
    <h1>That didn’t go as planned.</h1>
    <p>Your shop and payment details are safe. Try again, or head back to the shelf.</p>
    <div><Button onClick={retry}>Try again</Button><Button asChild variant="outline"><Link href="/">Back to AgentShelf</Link></Button></div>
  </main>;
}
