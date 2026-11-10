"use client";

import { useFormStatus } from "react-dom";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buyProductAction } from "@/app/s/[slug]/p/[productId]/actions";

function SubmitOrderButton() {
  const { pending } = useFormStatus();
  return (
    <Button className="shop-buy-button" disabled={pending} size="lg" type="submit">
      {pending ? "Preparing PayPal checkout…" : "Buy with PayPal"}
    </Button>
  );
}

export function BuyForm({ productId, shopSlug, shopName, maxQuantity }: {
  productId: string;
  shopSlug: string;
  shopName: string;
  maxQuantity: number;
}) {
  return (
    <form action={buyProductAction} className="shop-buy-form">
      <input name="productId" type="hidden" value={productId} />
      <input name="shopSlug" type="hidden" value={shopSlug} />
      <label htmlFor="shop-quantity">Quantity</label>
      <input defaultValue="1" id="shop-quantity" max={maxQuantity} min="1" name="quantity" required type="number" />
      <SubmitOrderButton />
      <p className="shop-payment-note"><ShieldCheck aria-hidden="true" size={15} /> Payment goes directly to {shopName}.</p>
    </form>
  );
}
