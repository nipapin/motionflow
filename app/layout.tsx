import React from "react"
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { AuthProvider } from '@/components/auth-provider'
import { FavoritesProvider } from '@/components/favorites-provider'
import { VideoMuteProvider } from '@/components/video-mute-provider'
import { Toaster } from '@/components/ui/sonner'
import { getSessionUser } from '@/lib/auth/get-session-user'
import './globals.css'

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: 'Motion Flow - Video Templates & Audio Assets',
  description: 'Premium video templates for After Effects, Premiere Pro, DaVinci Resolve and royalty-free music & sound effects',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const sessionUser = await getSessionUser();
  const initialUser = sessionUser
    ? { ...sessionUser, canChangePassword: !sessionUser.oauthPasswordOnly }
    : null;

  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <VideoMuteProvider>
            <AuthProvider initialUser={initialUser}><FavoritesProvider>{children}</FavoritesProvider></AuthProvider>
          </VideoMuteProvider>
          <Toaster />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
