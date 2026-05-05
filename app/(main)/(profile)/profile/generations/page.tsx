import { Metadata } from "next";
import { Suspense } from "react";
import { ProfileGenerations } from "@/components/profile-generations";

export const metadata: Metadata = {
  title: "My generations | Motion Flow",
  description: "Your AI image and video generation history.",
};

export default function ProfileGenerationsPage() {
  return (
    <Suspense fallback={null}>
      <ProfileGenerations />
    </Suspense>
  );
}
