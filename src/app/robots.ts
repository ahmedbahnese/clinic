import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots { return { rules: { userAgent: "*", allow: ["/", "/booking", "/track"], disallow: ["/staff", "/api/"] }, sitemap: "https://clinic-six-wheat.vercel.app/sitemap.xml" }; }
