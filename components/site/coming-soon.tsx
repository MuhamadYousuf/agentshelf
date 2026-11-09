import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

type ComingSoonProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action: string;
  href: string;
};

export function ComingSoon({
  icon: Icon,
  title,
  description,
  action,
  href,
}: ComingSoonProps) {
  return (
    <main className="coming-soon-page">
      <section className="coming-soon-card">
        <Logo />
        <div aria-hidden="true" className="coming-soon-icon" style={{ marginTop: 34 }}>
          <Icon />
        </div>
        <h1 className="coming-soon-title">{title}</h1>
        <p className="coming-soon-copy">{description}</p>
        <p className="coming-soon-copy" style={{ marginTop: 10 }}>
          This part of AgentShelf is coming soon. The foundation is taking shape
          first.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 25 }}>
          <Button asChild>
            <Link href={href}>
              {action} <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft aria-hidden="true" /> Back to AgentShelf
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
