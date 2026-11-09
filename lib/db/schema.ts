import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export type ProductImageMetadata = {
  id: string;
  mime: string;
  width: number;
  height: number;
};

export type ProductAttributes = Record<string, string | number | boolean>;

export type ModerationData = {
  status?: "pending" | "approved" | "blocked";
  notes?: string[];
  [key: string]: unknown;
};

export type PassMandate = {
  perOrderMaxCents: number;
  totalBudgetCents: number;
  expiresAt: string;
  categories: string[];
  stepUpOverCents: number;
};

export type NegotiationMessage = {
  role: "buyer" | "merchant" | "system";
  text: string;
  offerCents?: number;
  at: string;
};

export type OrderTracking = {
  carrier?: string;
  trackingNumber?: string;
  url?: string;
};

export const productStatus = pgEnum("product_status", [
  "draft",
  "published",
  "blocked",
  "archived",
]);

export const buyerPassStatus = pgEnum("buyer_pass_status", [
  "pending_vault",
  "active",
  "revoked",
  "expired",
]);

export const negotiationStatus = pgEnum("negotiation_status", [
  "open",
  "agreed",
  "declined",
  "expired",
]);

export const orderStatus = pgEnum("order_status", [
  "created",
  "approval_required",
  "approved",
  "completed",
  "refunded",
  "failed",
]);

export const orderFlow = pgEnum("order_flow", ["approval_link", "agent_pass"]);

export const eventSource = pgEnum("event_source", [
  "webhook",
  "agent",
  "merchant",
  "system",
]);

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const merchants = pgTable(
  "merchants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    paypalEmail: text("paypal_email").notNull(),
    autoAccept: boolean("auto_accept").notNull().default(true),
    maxDiscountPct: integer("max_discount_pct").notNull().default(15),
    allowBundles: boolean("allow_bundles").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("merchants_slug_unique").on(table.slug),
    uniqueIndex("merchants_email_unique").on(table.email),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    attributes: jsonb("attributes")
      .$type<ProductAttributes>()
      .notNull()
      .default({}),
    images: jsonb("images")
      .$type<ProductImageMetadata[]>()
      .notNull()
      .default([]),
    category: text("category").notNull(),
    listPriceCents: integer("list_price_cents").notNull(),
    floorPriceCents: integer("floor_price_cents").notNull(),
    maxDiscountPct: integer("max_discount_pct"),
    stock: integer("stock").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    paypalProductId: text("paypal_product_id"),
    moderation: jsonb("moderation")
      .$type<ModerationData>()
      .notNull()
      .default({}),
    status: productStatus("status").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("products_merchant_id_idx").on(table.merchantId),
    index("products_status_idx").on(table.status),
    uniqueIndex("products_merchant_title_unique").on(
      table.merchantId,
      table.title,
    ),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    mime: text("mime").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: bytea("bytes").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("product_images_product_id_idx").on(table.productId),
    index("product_images_merchant_id_idx").on(table.merchantId),
  ],
);

export const buyerPasses = pgTable(
  "buyer_passes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull(),
    vaultId: text("vault_id"),
    paypalCustomerId: text("paypal_customer_id"),
    payerEmail: text("payer_email"),
    tokenHash: text("token_hash").notNull(),
    mandate: jsonb("mandate").$type<PassMandate>().notNull(),
    spentCents: integer("spent_cents").notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    status: buyerPassStatus("status").notNull().default("pending_vault"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("buyer_passes_token_hash_unique").on(table.tokenHash),
  ],
);

export const negotiations = pgTable(
  "negotiations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    passId: uuid("pass_id").references(() => buyerPasses.id, {
      onDelete: "set null",
    }),
    clientName: text("client_name").notNull(),
    messages: jsonb("messages")
      .$type<NegotiationMessage[]>()
      .notNull()
      .default([]),
    status: negotiationStatus("status").notNull().default("open"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("negotiations_product_id_idx").on(table.productId),
    index("negotiations_merchant_id_idx").on(table.merchantId),
    index("negotiations_pass_id_idx").on(table.passId),
  ],
);

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    negotiationId: uuid("negotiation_id")
      .notNull()
      .references(() => negotiations.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    passId: uuid("pass_id").references(() => buyerPasses.id, {
      onDelete: "set null",
    }),
    qty: integer("qty").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    signature: text("signature").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("quotes_negotiation_id_idx").on(table.negotiationId),
    index("quotes_product_id_idx").on(table.productId),
    index("quotes_merchant_id_idx").on(table.merchantId),
    index("quotes_pass_id_idx").on(table.passId),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "restrict" }),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    passId: uuid("pass_id").references(() => buyerPasses.id, {
      onDelete: "set null",
    }),
    paypalOrderId: text("paypal_order_id"),
    captureId: text("capture_id"),
    status: orderStatus("status").notNull().default("created"),
    amountCents: integer("amount_cents").notNull(),
    qty: integer("qty").notNull(),
    flow: orderFlow("flow").notNull(),
    agentClient: text("agent_client").notNull(),
    buyerNote: text("buyer_note"),
    tracking: jsonb("tracking").$type<OrderTracking>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("orders_quote_id_unique").on(table.quoteId),
    uniqueIndex("orders_paypal_order_id_unique").on(table.paypalOrderId),
    index("orders_merchant_id_idx").on(table.merchantId),
    index("orders_product_id_idx").on(table.productId),
    index("orders_pass_id_idx").on(table.passId),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    source: eventSource("source").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("events_merchant_id_idx").on(table.merchantId)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
