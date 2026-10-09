import type { QueryFilter } from "mongoose";
import type { ThemeDocument } from "../models/theme.ts";

type SearchCategory = { _id: unknown; name: string; slug: string; description: string };
const fields = ["name", "slug", "stack", "shortDescription", "description", "features", "seoTitle", "seoDescription", "version"] as const;

export function themeSearchTerms(search: string): RegExp[] {
  const words = search.trim().slice(0, 100).match(/[\p{L}\p{N}+#]+/gu) ?? [];
  return [...new Set(words.map((word) => word.toLowerCase()))].map((word) => {
    // Next.js, next-js, and nextjs match the same technology. Treat regex
    // characters literally so user input never becomes an executable pattern.
    const pattern = [...word].map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s._-]*");
    return new RegExp(pattern, "i");
  });
}

export function themeSearchFilter(terms: RegExp[], categories: SearchCategory[] = []): QueryFilter<ThemeDocument> {
  if (!terms.length) return {};
  return { $and: terms.map((term) => {
    const categoryIds = categories.filter((category) => [category.name, category.slug, category.description].some((value) => term.test(value))).map((category) => String(category._id));
    return { $or: [
      ...fields.map((field) => ({ [field]: term })),
      ...(categoryIds.length ? [{ categoryId: { $in: categoryIds } }] : []),
    ] };
  }) };
}
