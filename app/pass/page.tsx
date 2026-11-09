import { WalletCards } from "lucide-react";
import { ComingSoon } from "@/components/site/coming-soon";

export const metadata = { title: "Agent Pass" };

export default function PassPage() {
  return (
    <ComingSoon
      action="Explore AgentShelf"
      description="Agent Pass is a buyer-issued spending mandate that lets an agent pay within a per-order limit, a total budget, a category list, and an expiry."
      href="/"
      icon={WalletCards}
      title="Give your agent room to buy on your terms."
    />
  );
}
