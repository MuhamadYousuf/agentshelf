import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getAppUrl().replace(/\/+$/, "");
  const routes = ["", "/shopper", "/pass", "/tour", "/security", "/s/maya-clay", "/s/lahore-threads"];
  return routes.map((route) => ({ url: `${baseUrl}${route}`, changeFrequency: "weekly", priority: route === "" ? 1 : 0.7 }));
}
