import { LoginForm } from "@/components/merchant/auth-forms";

export const metadata = {
  title: "Merchant sign in",
  description: "Sign in to manage your AgentShelf shop, listings, orders, and PayPal catalog sync.",
};

export default function MerchantLoginPage() {
  return <LoginForm />;
}
