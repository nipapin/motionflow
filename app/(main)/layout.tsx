import React from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/auth-provider";
import { FavoritesProvider } from "@/components/favorites-provider";
import { VideoMuteProvider } from "@/components/video-mute-provider";
import { Toaster } from "@/components/ui/sonner";
import { getSessionUser } from "@/lib/auth/get-session-user";
import "./globals.css";
import { PaddleProvider } from "@/lib/paddle";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://motionflow.pro"),
  title: {
    default: "Motion Flow — After Effects, Premiere Pro & DaVinci Templates",
    template: "%s | Motion Flow",
  },
  description:
    "Download thousands of premium templates for After Effects, Premiere Pro & DaVinci Resolve. Royalty-free music, sound effects, and AI creative tools — one subscription.",
  openGraph: {
    siteName: "Motion Flow",
    type: "website",
    locale: "en_US",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Motion Flow" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/favicon.ico",
        type: "image/x-icon",
      },
    ],
    apple: "/apple-icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const sessionUser = await getSessionUser();
  const initialUser = sessionUser ?? null;
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        <div className="relative w-full h-full paddle-container"></div>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
          storageKey="motionflow-theme"
        >
          <VideoMuteProvider>
            <AuthProvider initialUser={initialUser}>
              <PaddleProvider>
                <FavoritesProvider>{children}</FavoritesProvider>
              </PaddleProvider>
            </AuthProvider>
          </VideoMuteProvider>
          <Toaster />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
