import type { MetadataRoute } from "next";

const BASE = "https://swish-jet.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const today = new Date().toISOString().slice(0, 10);
  return [
    {
      url: BASE,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE}/tonight`,
      lastModified: today,
      changeFrequency: "hourly",
      priority: 0.9,
    },
  ];
}
