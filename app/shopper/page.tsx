import type { Metadata } from "next";
import { Suspense } from "react";
import { ShopperExperience } from "@/components/shopper/shopper-experience";

export const metadata: Metadata = {
  title: "Shop with your agent",
  description: "Give your Shopper Agent a budget, watch it negotiate, and choose how to pay.",
};

type ShopperPageProps = { searchParams: Promise<{ goal?: string; budget?: string }> };

export default function ShopperPage({ searchParams }: ShopperPageProps) {
  return <Suspense fallback={<main className="shopper-page-loading">Preparing your shopping run…</main>}><ShopperContent searchParams={searchParams} /></Suspense>;
}

async function ShopperContent({ searchParams }: ShopperPageProps) {
  const query = await searchParams;
  const goal = typeof query.goal === "string" ? query.goal.slice(0, 300) : undefined;
  const budget = typeof query.budget === "string" && /^\d{1,4}(?:\.\d{1,2})?$/.test(query.budget)
    ? query.budget.slice(0, 7)
    : undefined;
  return <ShopperExperience initialGoal={goal} initialBudget={budget} />;
}
