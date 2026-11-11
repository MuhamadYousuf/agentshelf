import { Suspense } from "react";
import { OrdersGrid } from "@/components/merchant/orders-grid";
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
  return <OrdersGrid initialCursor={initialCursor} initialRows={initialRows} />;
}
