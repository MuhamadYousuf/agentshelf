import { Package } from "lucide-react";
import { MerchantEmptyPage } from "@/components/merchant/empty-page";

export default function MerchantProductsPage() {
  return (
    <MerchantEmptyPage
      actionHref="/merchant/capture"
      actionLabel="Capture a product"
      description="Published items will appear here with their prices, availability, and agent-facing details."
      emptyTitle="Your published products will live here."
      icon={Package}
      subtitle="Keep drafts and published listings organized in one place."
      title="Products"
    />
  );
}
