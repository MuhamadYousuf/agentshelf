import { LayoutDashboard } from "lucide-react";
import { MerchantEmptyPage } from "@/components/merchant/empty-page";

export default function MerchantOverviewPage() {
  return (
    <MerchantEmptyPage
      actionHref="/merchant/capture"
      actionLabel="Capture a product"
      description="Start with a few product photos. Review each listing draft before it becomes visible to agents."
      emptyTitle="Your shop is ready for its first product."
      icon={LayoutDashboard}
      subtitle="A clear view of your catalog, orders, and agent activity starts here."
      title="Overview"
    />
  );
}
