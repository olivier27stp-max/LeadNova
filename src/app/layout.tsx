import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider, ThemeScript } from "@/components/ThemeProvider";
import Header from "@/components/Header";
import EnrichmentProvider from "@/components/EnrichmentProvider";
import GlobalEnrichmentBar from "@/components/GlobalEnrichmentBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Free Leads - AI Lead Generation",
  description: "AI-powered B2B lead generation platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <EnrichmentProvider>
            <div className="min-h-screen dot-pattern">
              <Header />
              <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
            </div>
            <GlobalEnrichmentBar />
          </EnrichmentProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
