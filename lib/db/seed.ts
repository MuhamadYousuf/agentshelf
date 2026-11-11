import { config } from "dotenv";

config({ path: ".env.local" });

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { hash } from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import { getDemoPaypalEmails } from "@/lib/env";
import { closeDb, getDb } from "@/lib/db";
import {
  merchants,
  productImages,
  products,
  type ModerationData,
  type ProductAttributes,
  type ProductImageMetadata,
} from "@/lib/db/schema";
import { processProductImage } from "@/lib/images/process";
import { slugify } from "@/lib/slug";

type DemoProduct = {
  title: string;
  description: string;
  category: string;
  listPriceCents: number;
  floorPriceCents: number;
  stock: number;
  attributes: ProductAttributes;
  tags: string[];
};

type DemoShop = {
  name: string;
  slug: string;
  email: string;
  password: string;
  paypalEmail: string;
  products: DemoProduct[];
};

const mayaProducts: DemoProduct[] = [
  {
    title: "Hand-glazed speckled mug",
    description:
      "A comfortable stoneware mug with a hand-glazed cream finish and natural iron speckles. Each piece is wheel-thrown in small batches.",
    category: "ceramics",
    listPriceCents: 3200,
    floorPriceCents: 2700,
    stock: 18,
    attributes: { material: "Stoneware", capacity: "12 oz", finish: "Cream glaze with iron speckles", care: "Dishwasher safe" },
    tags: ["mug", "stoneware", "hand-glazed"],
  },
  {
    title: "Ceramic pour-over dripper",
    description:
      "A small-batch ceramic dripper with spiral ribs for an even pour. Sized for a single cup and finished in a soft sage glaze.",
    category: "ceramics",
    listPriceCents: 3800,
    floorPriceCents: 3100,
    stock: 12,
    attributes: { material: "Glazed stoneware", capacity: "1 cup", finish: "Sage green glaze", care: "Rinse after use" },
    tags: ["coffee", "dripper", "stoneware"],
  },
  {
    title: "Small bud vase set (3)",
    description:
      "Three petite bud vases shaped and glazed by hand. Their varied heights make room for a few garden stems or a single dried flower.",
    category: "home_decor",
    listPriceCents: 4600,
    floorPriceCents: 3900,
    stock: 9,
    attributes: { material: "Stoneware", quantity: 3, finish: "Warm white, sand, and clay", height: "3 to 5 in" },
    tags: ["vase", "set of three", "stoneware"],
  },
  {
    title: "Stoneware serving bowl",
    description:
      "A broad, low serving bowl with a satin oatmeal glaze and a hand-finished rim. Made for shared sides, fruit, and everyday table use.",
    category: "kitchen",
    listPriceCents: 6200,
    floorPriceCents: 5400,
    stock: 7,
    attributes: { material: "Stoneware", diameter: "9 in", finish: "Satin oatmeal glaze", care: "Dishwasher safe" },
    tags: ["serving bowl", "tableware", "stoneware"],
  },
  {
    title: "Incense holder",
    description:
      "A compact stoneware incense rest with a shallow ash-catching dish and a quiet, hand-glazed finish in warm charcoal.",
    category: "home_decor",
    listPriceCents: 2400,
    floorPriceCents: 2000,
    stock: 24,
    attributes: { material: "Stoneware", finish: "Warm charcoal glaze", dimensions: "4.5 × 2 in", use: "Fits standard incense sticks" },
    tags: ["incense holder", "home decor", "stoneware"],
  },
];

const lahoreProducts: DemoProduct[] = [
  {
    title: "Hand-embroidered cotton table runner",
    description:
      "A cotton table runner finished with hand-embroidered floral motifs. The woven base has a natural cream color with rust and green thread accents.",
    category: "textiles",
    listPriceCents: 4800,
    floorPriceCents: 3800,
    stock: 8,
    attributes: { material: "Cotton", finish: "Hand embroidery", colors: "Cream, rust, and green" },
    tags: ["table runner", "embroidery", "cotton"],
  },
  {
    title: "Embroidered canvas tote",
    description:
      "A canvas tote with a hand-embroidered geometric panel and two shoulder straps. The open main compartment fits everyday essentials.",
    category: "accessories",
    listPriceCents: 3600,
    floorPriceCents: 2800,
    stock: 14,
    attributes: { material: "Cotton canvas", finish: "Hand embroidery", carry: "Two shoulder straps" },
    tags: ["tote bag", "embroidery", "canvas"],
  },
  {
    title: "Mirror-work cushion cover",
    description:
      "A square cotton cushion cover with hand-stitched mirror-work details and embroidered borders. A concealed zipper closes the back.",
    category: "textiles",
    listPriceCents: 5500,
    floorPriceCents: 4400,
    stock: 6,
    attributes: { material: "Cotton", finish: "Mirror-work embroidery", size: "18 × 18 in", closure: "Concealed zipper" },
    tags: ["cushion cover", "mirror work", "cotton"],
  },
  {
    title: "Embroidered fabric bookmark set",
    description:
      "A set of three fabric bookmarks with hand-embroidered floral details. Each bookmark has a stitched loop at the top edge.",
    category: "accessories",
    listPriceCents: 1800,
    floorPriceCents: 1400,
    stock: 22,
    attributes: { material: "Cotton fabric", quantity: 3, finish: "Hand embroidery" },
    tags: ["bookmark", "set of three", "embroidery"],
  },
];

async function imageForSeed(title: string) {
  const path = join(process.cwd(), "public", "seed", `${slugify(title)}.jpg`);
  try {
    return await processProductImage(await readFile(path));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function seedShop(shop: DemoShop, passwordHash: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (transaction) => {
    const [merchant] = await transaction
      .insert(merchants)
      .values({
        name: shop.name,
        slug: shop.slug,
        email: shop.email,
        passwordHash,
        paypalEmail: shop.paypalEmail,
      })
      .onConflictDoUpdate({
        target: merchants.slug,
        set: {
          name: shop.name,
          email: shop.email,
          passwordHash,
          paypalEmail: shop.paypalEmail,
          updatedAt: new Date(),
        },
      })
      .returning({ id: merchants.id });

    if (!merchant) throw new Error(`Unable to create the ${shop.name} demo shop.`);

    for (const demoProduct of shop.products) {
      const [existing] = await transaction
        .select({ id: products.id, images: products.images })
        .from(products)
        .where(and(eq(products.merchantId, merchant.id), eq(products.title, demoProduct.title)))
        .limit(1);
      const moderation: ModerationData = {
        status: "allowed",
        reasons: [],
        source: ["rules"],
        checkedAt: new Date().toISOString(),
      };
      const productValues = {
        merchantId: merchant.id,
        ...demoProduct,
        aiSuggestions: null,
        moderation,
        status: "published" as const,
      };
      let productId: string;

      if (existing) {
        productId = existing.id;
        await transaction
          .update(products)
          .set({ ...productValues, updatedAt: new Date() })
          .where(eq(products.id, productId));
      } else {
        const [inserted] = await transaction
          .insert(products)
          .values({ ...productValues, images: [], reserved: 0, paypalProductId: null })
          .returning({ id: products.id });
        if (!inserted) throw new Error(`Unable to create ${demoProduct.title}.`);
        productId = inserted.id;
      }

      const processedImage = await imageForSeed(demoProduct.title);
      if (processedImage) {
        // Published images are served as immutable, so new bytes must get a new image ID.
        const previousImageIds = (existing?.images ?? []).map((image) => image.id);
        const stored = (await transaction
          .insert(productImages)
          .values({
            productId,
            merchantId: merchant.id,
            mime: processedImage.mime,
            width: processedImage.width,
            height: processedImage.height,
            bytes: processedImage.bytes,
          })
          .returning({ id: productImages.id, mime: productImages.mime, width: productImages.width, height: productImages.height }))[0];
        if (!stored) throw new Error(`Unable to store the image for ${demoProduct.title}.`);
        const imageMetadata: ProductImageMetadata[] = [{ ...stored }];
        await transaction
          .update(products)
          .set({ images: imageMetadata, updatedAt: new Date() })
          .where(eq(products.id, productId));
        if (previousImageIds.length > 0) {
          await transaction.delete(productImages).where(and(
            inArray(productImages.id, previousImageIds),
            eq(productImages.productId, productId),
            eq(productImages.merchantId, merchant.id),
          ));
        }
      }
    }
  });
}

async function seed(): Promise<void> {
  if (!process.argv.includes("--confirm")) {
    console.error("Refusing to update demo shop seed data without --confirm.");
    process.exitCode = 2;
    return;
  }

  const paypalEmails = getDemoPaypalEmails();
  const shops: DemoShop[] = [
    {
      name: "Maya's Clay Studio",
      slug: "maya-clay",
      email: "maya@demo.agentshelf.dev",
      password: "demo-maya-2026",
      paypalEmail: paypalEmails.merchant1,
      products: mayaProducts,
    },
    {
      name: "Lahore Threads",
      slug: "lahore-threads",
      email: "lahore@demo.agentshelf.dev",
      password: "demo-lahore-2026",
      paypalEmail: paypalEmails.merchant2,
      products: lahoreProducts,
    },
  ];

  try {
    for (const shop of shops) {
      await seedShop(shop, await hash(shop.password, 12));
    }
    console.info("Maya's Clay Studio (5 products) and Lahore Threads (4 products) seeded.");
  } finally {
    await closeDb();
  }
}

void seed().catch(() => {
  console.error("The demo seed could not be completed.");
  process.exitCode = 1;
});
