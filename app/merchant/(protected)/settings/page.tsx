import { Settings2 } from "lucide-react";
import { MerchantEmptyPage } from "@/components/merchant/empty-page";

export default function MerchantSettingsPage() {
  return (
    <MerchantEmptyPage
      description="Shop policies, payment details, and account preferences will be managed here."
      emptyTitle="Your shop settings are being prepared."
      icon={Settings2}
      subtitle="Choose the boundaries that guide agent purchases."
      title="Settings"
    />
  );
}
