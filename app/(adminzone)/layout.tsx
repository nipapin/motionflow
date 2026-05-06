import { Geist, Geist_Mono } from "next/font/google";
import "@/app/(main)/globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export default function AdminzoneRouteGroupLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>{children}</div>
  );
}
