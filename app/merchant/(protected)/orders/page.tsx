import { Suspense } from "react";
import { LazyOrdersGrid } from "@/components/merchant/lazy-orders-grid";
import { MerchantOrdersSkeleton } from "@/components/merchant/page-skeletons";
import { requireMerchant } from "@/lib/auth/session";
import { listMerchantOrders } from "@/lib/merchant/orders-feed";

export default function MerchantOrdersPage() {
  return <Suspense fallback={<MerchantOrdersSkeleton />}><MerchantOrdersContent /></Suspense>;
}

async function MerchantOrdersContent() {
  const merchant = await requireMerchant();
  const initialCursor = new Date().toISOString();
  const initialRows = await listMerchantOrders(merchant.id);
  return <LazyOrdersGrid initialCursor={initialCursor} initialRows={initialRows} />;
}
