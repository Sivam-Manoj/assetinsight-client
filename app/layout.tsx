import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppProviders from "@/components/providers/AppProviders";
import { ThemeScript } from "@/components/providers/ThemeScript";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Asset Insight | Appraisal Reports & Auction Lot Packages",
    template: "%s | Asset Insight",
  },
  description:
    "Create polished appraisal reports, organize auction lots, and deliver client-ready packages from one clean workspace.",
  keywords: [
    "asset appraisal",
    "auction lot listing",
    "valuation report",
    "appraisal report",
    "asset report",
    "client report package",
    "Asset Insight",
  ],
  applicationName: "Asset Insight",
  category: "Real Estate",
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Asset Insight | Appraisal Reports & Auction Lot Packages",
    description:
      "Create polished appraisal reports, organize auction lots, and deliver client-ready packages from one clean workspace.",
    url: "/",
    siteName: "Asset Insight",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Asset Insight | Appraisal Reports & Auction Lot Packages",
    description:
      "Create polished appraisal reports, organize auction lots, and deliver client-ready packages from one clean workspace.",
  },
  other: {
    tags: "asset appraisal, auction lot listing, valuation report, appraisal report, asset report, client report package, Asset Insight",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
