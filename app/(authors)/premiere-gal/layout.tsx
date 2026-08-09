import type { Metadata } from "next";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { AuthProvider } from "@/components/auth-provider";
import { PaddleProvider } from "@/lib/paddle";
import { Toaster } from "@/components/ui/sonner";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { PremiereGalThemeProvider } from "./theme-provider";
import "./tailwind-bridge.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gal Toolkit MAX for Premiere and After Effects",
  description:
    "Gal Toolkit MAX adds transitions, color grades, sound FX, motion graphics templates and auto-resize tools to Premiere and After Effects — one subscription toolkit for faster video editing.",
  openGraph: {
    title: "Gal Toolkit MAX for Premiere and After Effects",
    description:
      "Gal Toolkit MAX adds transitions, color grades, sound FX, motion graphics templates and auto-resize tools to Premiere and After Effects.",
    type: "website",
    images: ["/premiere-gal/assets/hero.jpg"],
  },
};

export default async function PremiereGalLayout({ children }: { children: React.ReactNode }) {
  const sessionUser = await getSessionUser();

  return (
    <html lang="en">
      <body style={{ minHeight: "100vh" }}>
        <AppRouterCacheProvider options={{ key: "premiere-gal" }}>
          <PremiereGalThemeProvider>
            <AuthProvider initialUser={sessionUser}>
              <PaddleProvider>
                {children}
                <Toaster />
              </PaddleProvider>
            </AuthProvider>
          </PremiereGalThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
