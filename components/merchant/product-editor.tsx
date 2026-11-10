"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  CircleX,
  LoaderCircle,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCategory } from "@/lib/commerce/categories";
import {
  deleteDraftAction,
  improveDescriptionAction,
  publishProductAction,
  retryCatalogAction,
  saveProductAction,
  unpublishProductAction,
  type ProductActionResult,
} from "@/lib/products/actions";
import type {
  AiSuggestions,
  ModerationData,
  ProductAttributes,
  ProductImageMetadata,
} from "@/lib/db/schema";

type ReviewProduct = {
  id: string;
  title: string;
  description: string;
  category: string;
  attributes: ProductAttributes;
  tags: string[];
  listPriceCents: number;
  floorPriceCents: number;
  costCents: number | null;
  maxDiscountPct: number | null;
  stock: number;
  status: "draft" | "published" | "blocked" | "archived";
  paypalProductId: string | null;
  images: ProductImageMetadata[];
  moderation: ModerationData;
  aiSuggestions: AiSuggestions | null;
};

const categories = ["ceramics", "textiles", "jewelry", "home_decor", "art_prints", "stationery", "kitchen", "accessories", "beauty", "other"] as const;

type AttributeRow = { key: string; value: string };

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function showActionResult(result: ProductActionResult, router: ReturnType<typeof useRouter>): void {
  if (!result.ok) {
    toast.error(result.message);
    return;
  }
  if (result.syncPending) toast.warning(result.message);
  else toast.success(result.message);
  if (result.navigateTo) router.push(result.navigateTo);
  else router.refresh();
}

export function ProductEditor({ product }: { product: ReviewProduct }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [description, setDescription] = useState(product.description);
  const [tagsText, setTagsText] = useState(product.tags.join(", "));
  const [attributes, setAttributes] = useState<AttributeRow[]>(Object.entries(product.attributes).map(([key, value]) => ({ key, value: String(value) })));

  function formData(): FormData | null {
    if (!formRef.current) return null;
    const data = new FormData(formRef.current);
    data.set("productId", product.id);
    return data;
  }

  function runAction(action: (data: FormData) => Promise<ProductActionResult>) {
    const data = formData();
    if (!data) return;
    startTransition(async () => {
      try {
        const result = await action(data);
        showActionResult(result, router);
      } catch {
        toast.error("We couldn't save this listing. Please try again.");
      }
    });
  }

  function improveDescription() {
    const data = formData();
    if (!data) return;
    startTransition(async () => {
      try {
        const result = await improveDescriptionAction(data);
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        if (result.description !== undefined) setDescription(result.description);
        toast.success(result.message);
      } catch {
        toast.error("We couldn't improve the description. Please try again.");
      }
    });
  }

  function updateAttribute(index: number, field: keyof AttributeRow, value: string) {
    setAttributes((current) => current.map((attribute, currentIndex) =>
      currentIndex === index ? { ...attribute, [field]: value } : attribute,
    ));
  }

  const moderation = product.moderation;
  const moderationIcon = moderation.status === "allowed"
    ? <CheckCircle2 aria-hidden="true" size={15} />
    : moderation.status === "review"
      ? <TriangleAlert aria-hidden="true" size={15} />
      : <CircleX aria-hidden="true" size={15} />;

  return (
    <>
      <Link className="listing-review-back" href="/merchant/products"><ArrowLeft aria-hidden="true" size={14} /> All products</Link>
      <div className="listing-review-head">
        <div>
          <h1 className="merchant-page-title">Review listing</h1>
          <p className="merchant-page-subtitle">Make any edits you need. You stay in control of what goes live.</p>
        </div>
        {product.status === "published" && !product.paypalProductId && (
          <div className="listing-sync-pending">
            <CircleAlert aria-hidden="true" size={15} />
            <span>PayPal Catalog sync pending</span>
            <button disabled={pending} onClick={() => runAction(retryCatalogAction)} type="button">Retry</button>
          </div>
        )}
      </div>

      {product.aiSuggestions?.manualFallback && (
        <div className="listing-fallback-banner" role="status">
          AI couldn&apos;t read the photos this time — fill in the details below and save your draft.
        </div>
      )}

      <div className="listing-review-layout">
        <section aria-label="Product photos" className="listing-gallery">
          <div className="listing-gallery-main">
            {product.images[0] ? (
              <Image alt={`Photo of ${product.title || "product"}`} fill priority sizes="(max-width: 980px) 100vw, 55vw" src={`/api/images/${product.images[0].id}`} unoptimized />
            ) : (
              <div className="product-art-mark">AS</div>
            )}
          </div>
          {product.images.length > 1 && (
            <div className="listing-gallery-thumbs">
              {product.images.slice(1).map((image, index) => (
                <div className="listing-gallery-thumb" key={image.id}>
                  <Image alt={`Product photo ${index + 2}`} fill sizes="90px" src={`/api/images/${image.id}`} unoptimized />
                </div>
              ))}
            </div>
          )}
          <div className={`listing-moderation ${moderation.status}`}>
            <span className="listing-moderation-title">{moderationIcon} Policy check: {moderation.status}</span>
            {moderation.reasons.length > 0 ? moderation.reasons.map((reason) => (
              <p className="listing-moderation-reason" key={reason}>{reason}</p>
            )) : <p className="listing-moderation-reason">No listing concerns were found by the automated check.</p>}
          </div>
          {moderation.status === "review" && (
            <label className="listing-confirm">
              <input name="aupConfirmed" form="product-review-form" type="checkbox" />
              <span>I confirm this item complies with PayPal&apos;s Acceptable Use Policy.</span>
            </label>
          )}
        </section>

        <form className="listing-editor" id="product-review-form" ref={formRef}>
          <input name="productId" type="hidden" value={product.id} />
          <section className="listing-editor-section">
            <label htmlFor="listing-title">Title</label>
            <Input className="listing-title-input" defaultValue={product.title} id="listing-title" maxLength={80} name="title" placeholder="Add a product title" />
            <span className="listing-field-help">Keep it clear and specific, up to 80 characters.</span>
          </section>

          <section className="listing-editor-section">
            <label htmlFor="listing-description">Description</label>
            <Textarea id="listing-description" maxLength={600} name="description" onChange={(event) => setDescription(event.currentTarget.value)} placeholder="Describe the item using details you can verify." value={description} />
            <div className="listing-improve-row">
              <span>{description.length}/600 characters</span>
              <Button className="listing-improve-button" disabled={pending} onClick={improveDescription} type="button" variant="outline">
                <Sparkles aria-hidden="true" size={13} /> Improve description
              </Button>
            </div>
          </section>

          <section className="listing-editor-section">
            <label htmlFor="listing-category">Category</label>
            <select defaultValue={categories.some((value) => value === product.category) ? product.category : "other"} id="listing-category" name="category">
            {categories.map((value) => <option key={value} value={value}>{formatCategory(value)}</option>)}
            </select>
          </section>

          <section className="listing-editor-section">
            <span className="listing-field-label">Attributes</span>
            <div className="listing-attributes">
              {attributes.map((attribute, index) => (
                <div className="listing-attribute-row" key={index}>
                  <Input aria-label={`Attribute ${index + 1} name`} maxLength={40} name="attributeKey" onChange={(event) => updateAttribute(index, "key", event.currentTarget.value)} placeholder="Material" value={attribute.key} />
                  <Input aria-label={`Attribute ${index + 1} value`} maxLength={120} name="attributeValue" onChange={(event) => updateAttribute(index, "value", event.currentTarget.value)} placeholder="Stoneware" value={attribute.value} />
                  <button aria-label={`Remove attribute ${index + 1}`} className="listing-attribute-remove" disabled={pending} onClick={() => setAttributes((current) => current.filter((_, currentIndex) => currentIndex !== index))} type="button"><Trash2 aria-hidden="true" size={14} /></button>
                </div>
              ))}
            </div>
            {attributes.length < 8 && (
              <button className="listing-add-attribute" disabled={pending} onClick={() => setAttributes((current) => [...current, { key: "", value: "" }])} type="button"><Plus aria-hidden="true" size={13} /> Add attribute</button>
            )}
          </section>

          <section className="listing-editor-section">
            <label htmlFor="listing-tags">Tags</label>
            <Input id="listing-tags" maxLength={220} name="tags" onChange={(event) => setTagsText(event.currentTarget.value)} placeholder="stoneware, mug, hand-glazed" value={tagsText} />
            <span className="listing-field-help">Separate up to six tags with commas.</span>
          </section>

          <section className="listing-editor-section">
            <span className="listing-field-label">Pricing</span>
            <div className="listing-price-grid">
              <div>
                <label htmlFor="listing-list-price">List price (USD)</label>
                <Input defaultValue={(product.listPriceCents / 100).toFixed(2)} id="listing-list-price" min="0" name="listPrice" step="0.01" type="number" />
                {product.aiSuggestions && <span className="listing-ai-hint">AI suggested {formatPrice(product.aiSuggestions.listPriceCents)}</span>}
              </div>
              <div>
                <label htmlFor="listing-floor-price">Floor price (USD)</label>
                <Input defaultValue={(product.floorPriceCents / 100).toFixed(2)} id="listing-floor-price" min="0" name="floorPrice" step="0.01" type="number" />
                <p className="listing-private-floor">Private. Agents never see this. Negotiation never goes below it.</p>
                {product.aiSuggestions && <span className="listing-ai-hint">AI suggested {formatPrice(product.aiSuggestions.floorPriceCents)}</span>}
              </div>
            </div>
            <div className="listing-private-cost-field">
              <label htmlFor="listing-cost-price">Your cost (private)</label>
              <Input defaultValue={product.costCents === null ? "" : (product.costCents / 100).toFixed(2)} id="listing-cost-price" min="0" name="costPrice" step="0.01" type="number" />
              <p className="listing-private-floor">Private to this shop. Agents never see it.</p>
            </div>
          </section>

          <section className="listing-editor-section">
            <div className="listing-price-grid">
              <div>
                <label htmlFor="listing-discount">Max discount (%)</label>
                <Input defaultValue={product.maxDiscountPct ?? 15} id="listing-discount" max="50" min="0" name="maxDiscountPct" step="1" type="number" />
              </div>
              <div>
                <label htmlFor="listing-stock">Stock</label>
                <Input defaultValue={product.stock} id="listing-stock" max="999" min="0" name="stock" step="1" type="number" />
              </div>
            </div>
          </section>

          <div className="listing-editor-actions">
            <Button disabled={pending} onClick={() => runAction(publishProductAction)} size="lg" type="button">
              {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" size={15} /> : null}
              Publish listing
            </Button>
            <Button disabled={pending} onClick={() => runAction(saveProductAction)} type="button" variant="outline">
              {product.status === "published" ? "Save changes" : "Save draft"}
            </Button>
            {product.status === "published" ? (
              <Button disabled={pending} onClick={() => runAction(unpublishProductAction)} type="button" variant="ghost">Unpublish</Button>
            ) : product.status === "draft" ? (
              <Button disabled={pending} onClick={() => runAction(deleteDraftAction)} type="button" variant="ghost"><Trash2 aria-hidden="true" size={14} /> Delete draft</Button>
            ) : null}
          </div>

        </form>
      </div>
    </>
  );
}
