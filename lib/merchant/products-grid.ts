export type ProductGridSource = {
  id: string;
  title: string;
  category: string;
  status: string;
  listPriceCents: number;
  floorPriceCents: number;
  stock: number;
  reserved: number;
  paypalProductId: string | null;
  images: Array<{ id: string }>;
  updatedAt: Date | string;
};

export type ProductGridRow = Omit<ProductGridSource, "images" | "updatedAt"> & {
  thumbnailUrl: string | null;
  listPriceDollars: number;
  floorPriceDollars: number;
  updatedAt: string;
};

export type ProductGridEditField = "listPriceCents" | "floorPriceCents" | "stock";

export type ProductGridSummary = {
  id: "__summary__";
  isSummary: true;
  title: string;
  category: "";
  status: "";
  listPriceCents: 0;
  floorPriceCents: 0;
  listPriceDollars: 0;
  floorPriceDollars: 0;
  paypalProductId: null;
  thumbnailUrl: null;
  updatedAt: "";
  publishedCount: number;
  stockValueCents: number;
  stock: number;
  reserved: number;
};

export function mapProductsForGrid(products: ProductGridSource[]): ProductGridRow[] {
  return products.map((product) => ({
    id: product.id,
    title: product.title || "Untitled draft",
    category: product.category,
    status: product.status,
    listPriceCents: product.listPriceCents,
    floorPriceCents: product.floorPriceCents,
    listPriceDollars: product.listPriceCents / 100,
    floorPriceDollars: product.floorPriceCents / 100,
    stock: product.stock,
    reserved: product.reserved,
    paypalProductId: product.paypalProductId,
    thumbnailUrl: product.images[0]?.id ? `/api/images/${product.images[0].id}` : null,
    updatedAt: product.updatedAt instanceof Date ? product.updatedAt.toISOString() : product.updatedAt,
  }));
}

export function validateProductGridEdit(input: {
  current: { listPriceCents: number; floorPriceCents: number; stock: number; reserved: number };
  field: ProductGridEditField;
  value: number;
}): { ok: true } | { ok: false; message: string } {
  const { current, field, value } = input;
  if (!Number.isInteger(value)) return { ok: false, message: "Enter a whole-cent price or whole-number stock count." };
  if (field === "stock" && (value < 0 || value > 999)) {
    return { ok: false, message: "Stock must be between 0 and 999." };
  }
  if (field !== "stock" && (value < 0 || value > 500_000)) {
    return { ok: false, message: "Price must be between $0.00 and $5,000.00." };
  }

  const listPriceCents = field === "listPriceCents" ? value : current.listPriceCents;
  const floorPriceCents = field === "floorPriceCents" ? value : current.floorPriceCents;
  const stock = field === "stock" ? value : current.stock;
  if (floorPriceCents > listPriceCents) {
    return { ok: false, message: "Floor price must not exceed list price." };
  }
  if (stock < current.reserved) {
    return { ok: false, message: `Stock cannot be lower than ${current.reserved} reserved ${current.reserved === 1 ? "unit" : "units"}.` };
  }
  return { ok: true };
}

export function buildProductGridSummary(rows: ProductGridRow[]): ProductGridSummary {
  const published = rows.filter((row) => row.status === "published");
  return {
    id: "__summary__",
    isSummary: true,
    title: `Published · ${published.length} ${published.length === 1 ? "product" : "products"}`,
    category: "",
    status: "",
    listPriceCents: 0,
    floorPriceCents: 0,
    listPriceDollars: 0,
    floorPriceDollars: 0,
    paypalProductId: null,
    thumbnailUrl: null,
    updatedAt: "",
    publishedCount: published.length,
    stockValueCents: published.reduce((total, row) => total + row.stock * row.listPriceCents, 0),
    stock: published.reduce((total, row) => total + row.stock, 0),
    reserved: published.reduce((total, row) => total + row.reserved, 0),
  };
}
