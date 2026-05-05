import { Metadata } from "next";
import { FootagesPage } from "@/components/footages-page";

export const metadata: Metadata = {
  title: "Footages | Motion Flow",
  description:
    "Explore stunning royalty-free photos from Unsplash. Search by keyword, filter by orientation, and find the perfect shot for your project.",
  keywords: ["footages", "stock photos", "unsplash", "royalty-free", "images", "free photos"],
  openGraph: {
    title: "Footages | Motion Flow",
    description:
      "Explore stunning royalty-free photos from Unsplash. Search by keyword and orientation.",
    type: "website",
  },
};

export default function Page() {
  return <FootagesPage />;
}
