const CATEGORY_LABELS: Record<string, string> = {
  ceramics: "Ceramics",
  textiles: "Textiles",
  jewelry: "Jewelry",
  home_decor: "Home decor",
  art_prints: "Art prints",
  stationery: "Stationery",
  kitchen: "Kitchen",
  accessories: "Accessories",
  beauty: "Beauty",
  other: "Other",
};

export function formatCategory(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replaceAll("_", " ");
}
