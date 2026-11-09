import { Camera } from "lucide-react";
import { MerchantEmptyPage } from "@/components/merchant/empty-page";

export default function MerchantCapturePage() {
  return (
    <MerchantEmptyPage
      description="The capture flow will help you photograph an item, review its drafted details, and decide when it is ready to publish."
      emptyTitle="Product capture is coming in the next build."
      icon={Camera}
      subtitle="Bring a product photo and turn it into a listing you control."
      title="Capture"
    />
  );
}
