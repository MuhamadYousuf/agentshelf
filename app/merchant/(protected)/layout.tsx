import type { ReactNode } from "react";
import { Suspense } from "react";
import { MerchantMobileMenu, MerchantSidebar } from "@/components/merchant/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { requireMerchant } from "@/lib/auth/session";

export const instant = false;

function MerchantLoading() {
  return (
    <main aria-busy="true" className="merchant-content">
      <Skeleton className="h-12 w-56" />
      <Skeleton className="mt-4 h-5 w-96 max-w-full" />
      <Skeleton className="mt-9 h-64 w-full rounded-2xl" />
    </main>
  );
}

async function MerchantArea({ children }: { children: ReactNode }) {
  const merchant = await requireMerchant();

  return (
    <div className="merchant-shell">
      <MerchantSidebar merchantName={merchant.name} />
      <div className="merchant-main">
        <header className="merchant-topbar">
          <div className="merchant-topbar-left">
            <MerchantMobileMenu merchantName={merchant.name} />
            <span className="merchant-topbar-label">Merchant workspace</span>
          </div>
          <span className="merchant-topbar-shop">{merchant.name}</span>
        </header>
        <main className="merchant-content">{children}</main>
      </div>
    </div>
  );
}

export default function ProtectedMerchantLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<MerchantLoading />}>
      <MerchantArea>{children}</MerchantArea>
    </Suspense>
  );
}
