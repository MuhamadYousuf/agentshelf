import { MessageSquareText } from "lucide-react";
import { MerchantEmptyPage } from "@/components/merchant/empty-page";

export default function MerchantNegotiationsPage() {
  return (
    <MerchantEmptyPage
      description="Negotiation threads will show each agent request, your shop's limits, and any quote waiting for a decision."
      emptyTitle="Your conversations will appear here."
      icon={MessageSquareText}
      subtitle="Keep agent offers inside the terms you set for your shop."
      title="Negotiations"
    />
  );
}
