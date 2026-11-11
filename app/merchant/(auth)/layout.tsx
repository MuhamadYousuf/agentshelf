import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { PublicFooter } from "@/components/site/public-footer";

export const metadata: Metadata = {
  title: "Merchant account",
};

export default function MerchantAuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <header className="auth-topbar">
        <Logo />
        <Link className="auth-back-link" href="/">
          Back to AgentShelf
        </Link>
      </header>
      <main className="auth-main">{children}</main>
      <PublicFooter />
    </div>
  );
}
