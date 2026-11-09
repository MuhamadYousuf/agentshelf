import { ShoppingBag } from "lucide-react";
import { MerchantEmptyPage } from "@/components/merchant/empty-page";

export default function MerchantOrdersPage() {
  return (
    <MerchantEmptyPage
      description="When an agent places an order, its payment status, items, and next steps will be available here."
      emptyTitle="No agent orders yet."
      icon={ShoppingBag}
      subtitle="Review payments and fulfillment details for your agent sales."
      title="Orders"
    />
  );
}
