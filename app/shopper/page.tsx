import { Bot } from "lucide-react";
import { ComingSoon } from "@/components/site/coming-soon";

export const metadata = { title: "Agent shopping" };

export default function ShopperPage() {
  return (
    <ComingSoon
      action="Open a merchant shop"
      description="Explore the buying experience for an AI assistant: product discovery, merchant-set rules, clear quotes, and payment with buyer permission."
      href="/merchant/signup"
      icon={Bot}
      title="An agent can shop with clear boundaries."
    />
  );
}
