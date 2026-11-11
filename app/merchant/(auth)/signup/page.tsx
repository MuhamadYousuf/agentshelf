import { SignupForm } from "@/components/merchant/auth-forms";

export const metadata = {
  title: "Create a merchant shop",
  description: "Set up an AgentShelf shop for product listings, agent discovery, and PayPal checkout.",
};

export default function MerchantSignupPage() {
  return <SignupForm />;
}
