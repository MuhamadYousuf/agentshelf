import { ArrowLeft, SearchX } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <main className="coming-soon-page">
      <section className="coming-soon-card">
        <Logo />
        <div aria-hidden="true" className="coming-soon-icon" style={{ marginTop: 34 }}>
          <SearchX />
        </div>
        <h1 className="coming-soon-title">We couldn&apos;t find that shop.</h1>
        <p className="coming-soon-copy">
          The address may have changed, or the shop is not published yet.
        </p>
        <Button asChild style={{ marginTop: 24 }} variant="outline">
          <Link href="/">
            <ArrowLeft aria-hidden="true" /> Back to AgentShelf
          </Link>
        </Button>
      </section>
    </main>
  );
}
