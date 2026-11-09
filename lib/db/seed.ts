import { config } from "dotenv";

config({ path: ".env.local" });

import { hash } from "bcryptjs";
import { closeDb, getDb } from "@/lib/db";
import {
  merchants,
  products,
  type ProductAttributes,
} from "@/lib/db/schema";

type DemoProduct = {
  title: string;
  description: string;
  category: string;
  listPriceCents: number;
  floorPriceCents: number;
  stock: number;
  attributes: ProductAttributes;
};

const demoMerchant = {
  name: "Maya's Clay Studio",
  slug: "maya-clay",
  email: "maya@demo.agentshelf.dev",
  password: "demo-maya-2026",
  paypalEmail: "sb-merchant@example.com",
};

const demoProducts: DemoProduct[] = [
  {
    title: "Hand-glazed speckled mug",
    description:
      "A comfortable stoneware mug with a hand-glazed cream finish and natural iron speckles. Each piece is wheel-thrown in small batches.",
    category: "Drinkware",
    listPriceCents: 3200,
    floorPriceCents: 2700,
    stock: 18,
    attributes: {
      material: "Stoneware",
      capacity: "12 oz",
      finish: "Cream glaze with iron speckles",
      care: "Dishwasher safe",
    },
  },
  {
    title: "Ceramic pour-over dripper",
    description:
      "A small-batch ceramic dripper with spiral ribs for an even pour. Sized for a single cup and finished in a soft sage glaze.",
    category: "Coffee",
    listPriceCents: 3800,
    floorPriceCents: 3100,
    stock: 12,
    attributes: {
      material: "Glazed stoneware",
      capacity: "1 cup",
      finish: "Sage green glaze",
      care: "Rinse after use",
    },
  },
  {
    title: "Small bud vase set (3)",
    description:
      "Three petite bud vases shaped and glazed by hand. Their varied heights make room for a few garden stems or a single dried flower.",
    category: "Vases",
    listPriceCents: 4600,
    floorPriceCents: 3900,
    stock: 9,
    attributes: {
      material: "Stoneware",
      quantity: 3,
      finish: "Warm white, sand, and clay",
      height: "3 to 5 in",
    },
  },
  {
    title: "Stoneware serving bowl",
    description:
      "A broad, low serving bowl with a satin oatmeal glaze and a hand-finished rim. Made for shared sides, fruit, and everyday table use.",
    category: "Serveware",
    listPriceCents: 6200,
    floorPriceCents: 5400,
    stock: 7,
    attributes: {
      material: "Stoneware",
      diameter: "9 in",
      finish: "Satin oatmeal glaze",
      care: "Dishwasher safe",
    },
  },
  {
    title: "Incense holder",
    description:
      "A compact stoneware incense rest with a shallow ash-catching dish and a quiet, hand-glazed finish in warm charcoal.",
    category: "Home fragrance",
    listPriceCents: 2400,
    floorPriceCents: 2000,
    stock: 24,
    attributes: {
      material: "Stoneware",
      finish: "Warm charcoal glaze",
      dimensions: "4.5 × 2 in",
      use: "Fits standard incense sticks",
    },
  },
];

async function seed(): Promise<void> {
  const db = getDb();
  const passwordHash = await hash(demoMerchant.password, 12);

  try {
    await db.transaction(async (transaction) => {
      const [merchant] = await transaction
        .insert(merchants)
        .values({
          name: demoMerchant.name,
          slug: demoMerchant.slug,
          email: demoMerchant.email,
          passwordHash,
          paypalEmail: demoMerchant.paypalEmail,
        })
        .onConflictDoUpdate({
          target: merchants.slug,
          set: {
            name: demoMerchant.name,
            email: demoMerchant.email,
            passwordHash,
            paypalEmail: demoMerchant.paypalEmail,
            updatedAt: new Date(),
          },
        })
        .returning({ id: merchants.id });

      if (!merchant) {
        throw new Error("Unable to create the demo merchant.");
      }

      for (const product of demoProducts) {
        await transaction
          .insert(products)
          .values({
            merchantId: merchant.id,
            ...product,
            images: [],
            reserved: 0,
            moderation: { status: "approved" as const, notes: [] },
            status: "published" as const,
          })
          .onConflictDoUpdate({
            target: [products.merchantId, products.title],
            set: {
              description: product.description,
              category: product.category,
              listPriceCents: product.listPriceCents,
              floorPriceCents: product.floorPriceCents,
              stock: product.stock,
              reserved: 0,
              attributes: product.attributes,
              images: [],
              moderation: { status: "approved", notes: [] },
              status: "published",
              updatedAt: new Date(),
            },
          });
      }
    });

    console.info("Demo merchant login:");
    console.info(`Email: ${demoMerchant.email}`);
    console.info(`Password: ${demoMerchant.password}`);
  } finally {
    await closeDb();
  }
}

void seed().catch((error: unknown) => {
  console.error("The demo seed could not be completed.");
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
});
