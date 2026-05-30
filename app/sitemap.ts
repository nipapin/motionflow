import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://motionflow.pro";
  const now = new Date();

  return [
    { url: base, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${base}/after-effects`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/premiere-pro`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/davinci-resolve`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/stock-audio`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/sound-fx`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/ai-tools`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/image-generation`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/video-generation`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/text-to-speech`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/speech-to-text`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/svg-generation`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
