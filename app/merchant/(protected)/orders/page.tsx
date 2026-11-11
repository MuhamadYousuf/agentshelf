import { OrdersGrid } from "@/components/merchant/orders-grid";
import { requireMerchant } from "@/lib/auth/session";
import { listMerchantOrders } from "@/lib/merchant/orders-feed";

export default async function MerchantOrdersPage() {
  const merchant = await requireMerchant();
  const initialCursor = new Date().toISOString();
  const initialRows = await listMerchantOrders(merchant.id);
  return <OrdersGrid initialCursor={initialCursor} initialRows={initialRows} />;
}
