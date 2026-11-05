import { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Illustrator Templates | Motion Flow",
  description: "Download premium Illustrator templates including social media graphics, thumbnails, overlays, and print designs. Professional vector graphics for creators.",
  keywords: ["Illustrator", "templates", "graphics", "social media", "thumbnails", "vector"],
  openGraph: {
    title: "Illustrator Templates | Motion Flow",
    description: "Download premium Illustrator templates including social media graphics, thumbnails, and print designs.",
    type: "website",
  },
};

export default function IllustratorPage() {
  redirect("/");
}
