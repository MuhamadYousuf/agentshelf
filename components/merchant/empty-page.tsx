import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type MerchantEmptyPageProps = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  emptyTitle: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
};

export function MerchantEmptyPage({
  title,
  subtitle,
  icon: Icon,
  emptyTitle,
  description,
  actionLabel,
  actionHref,
}: MerchantEmptyPageProps) {
  return (
    <>
      <header>
        <h1 className="merchant-page-title">{title}</h1>
        <p className="merchant-page-subtitle">{subtitle}</p>
      </header>
      <section aria-label={title} className="merchant-empty-card">
        <div className="merchant-empty-copy">
          <h2 className="merchant-empty-title">{emptyTitle}</h2>
          <p className="merchant-empty-description">{description}</p>
          {actionLabel && actionHref ? (
            <Button asChild className="merchant-empty-action" size="sm">
              <Link href={actionHref}>
                {actionLabel} <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
        </div>
        <div aria-hidden="true" className="merchant-empty-icon">
          <Icon />
        </div>
      </section>
    </>
  );
}
