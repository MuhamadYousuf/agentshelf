export type SearchMatchFields = {
  title: string;
  description: string;
  tags: string[];
  category: string;
};

export function searchMatchRank(query: string, product: SearchMatchFields): number {
  const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
  if (!normalizedQuery) return 4;
  if (product.title.toLocaleLowerCase("en-US").includes(normalizedQuery)) return 0;
  if (product.tags.some((tag) => tag.toLocaleLowerCase("en-US").includes(normalizedQuery))) return 1;
  if (
    product.description.toLocaleLowerCase("en-US").includes(normalizedQuery) ||
    product.category.toLocaleLowerCase("en-US").includes(normalizedQuery)
  ) return 2;
  return 3;
}

export function rankSearchRows<T extends SearchMatchFields>(rows: T[], query: string): T[] {
  return rows
    .map((row, index) => ({ row, index, rank: searchMatchRank(query, row) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ row }) => row);
}
