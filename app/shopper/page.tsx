import type { Metadata } from "next";
import { ShopperExperience } from "@/components/shopper/shopper-experience";

export const metadata: Metadata = {
  title: "Shop with your agent",
  description: "Give your Shopper Agent a budget, watch it negotiate, and choose how to pay.",
};

export default function ShopperPage() {
  return <ShopperExperience />;
}
