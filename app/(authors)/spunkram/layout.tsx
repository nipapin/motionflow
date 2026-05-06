import type { Metadata } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import { EditorialBackdrop } from "@/components/EditorialBackdrop";
import "@/app/(authors)/spunkram/globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/auth-provider";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { SpunkramMainHeader } from "@/components/spunkram-main-header";
import { PaddleProvider } from "@/lib/paddle";
import { SiteFooter } from "@/components/site-footer";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Spunkram — projects for Premiere Pro and After Effects",
  description:
    "Free extension for Adobe Premiere Pro and After Effects (Windows and macOS). Ready-to-use projects — buy forever or get all via subscription.",
  keywords: [
    "Adobe Premiere Pro",
    "After Effects",
    "extension",
    "templates",
    "projects",
    "motion design",
    "subscription",
  ],
  openGraph: {
    title: "Spunkram — projects for Premiere Pro and After Effects",
    description:
      "Free extension and a library of ready-to-use projects — by subscription or forever.",
    type: "website",
  },
};

const themeScript = `(function(){try{var t=localStorage.getItem('theme');var m=window.matchMedia('(prefers-color-scheme: light)').matches;var light=t==='light'||(!t&&m);if(light){document.documentElement.classList.add('light');}}catch(e){}})();`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionUser = await getSessionUser();
  const initialUser = sessionUser
    ? { ...sessionUser, canChangePassword: !sessionUser.oauthPasswordOnly }
    : null;

  return (
    <>
      <Script id="spunkram-theme-init" strategy="beforeInteractive">
        {themeScript}
      </Script>
      <div
        className={`${inter.className} min-h-screen overflow-x-clip bg-page text-foreground antialiased`}
        suppressHydrationWarning
      >
        <div className="relative h-full w-full paddle-container" />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
          storageKey="motionflow-theme"
        >
          <AuthProvider initialUser={initialUser}>
            <PaddleProvider>
              <div className="relative min-h-screen overflow-x-clip">
                <EditorialBackdrop />
                <SpunkramMainHeader />
                <div className="relative z-1 min-h-screen min-w-0 overflow-x-clip">{children}</div>
                <SiteFooter className="left-0!" sidebarCollapsed />
              </div>
            </PaddleProvider>
          </AuthProvider>
        </ThemeProvider>
      </div>
    </>
  );
}
