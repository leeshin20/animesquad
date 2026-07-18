import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";
import NavBar from "./components/NavBar";
import { ScrollToTop } from "./components/ScrollToTop";
import { GoogleAnalytics } from "@next/third-parties/google";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "AnimeSquad",
  description: "스쿼드와 함께 보는 애니메이션 추적",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.ico",
    apple: "/brand/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#22C55E",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans`}>
        <GoogleAnalytics gaId="G-4BNLZYYHB8" />
        <NavBar />
        <main className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10">{children}</main>
        <ScrollToTop />
        <footer className="mt-16 border-t border-neutral-100 py-6 text-center text-xs text-neutral-400">
          <Link href="/privacy" className="underline underline-offset-2 hover:text-neutral-600">
            개인정보처리방침
          </Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="underline underline-offset-2 hover:text-neutral-600">
            이용약관
          </Link>
          <span className="mx-2">·</span>
          <a href="mailto:leeshin0213@gmail.com" className="hover:text-neutral-600">
            문의
          </a>
        </footer>
      </body>
    </html>
  );
}
