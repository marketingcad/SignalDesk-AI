import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { DesktopStatusBar } from "@/components/desktop-status-bar";
import { DesktopAuthPrompt } from "@/components/desktop-auth-prompt";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://signaldesk-ai-i7mbo.ondigitalocean.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "SignalDesk AI — Lead Intelligence Dashboard",
    template: "%s · SignalDesk AI",
  },
  description:
    "Real-time buying-intent detection that surfaces high-intent Virtual Assistant hiring signals across social platforms.",
  applicationName: "SignalDesk AI",
  openGraph: {
    type: "website",
    siteName: "SignalDesk AI",
    url: "/",
    title: "SignalDesk AI — Real-Time Lead Intelligence",
    description: "Surface high-intent hiring signals across social platforms and engage prospects at the right moment.",
  },
  twitter: {
    card: "summary_large_image",
    title: "SignalDesk AI",
    description: "Real-time lead intelligence and buying-intent detection.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <ThemeProvider>
          {children}
          <DesktopAuthPrompt />
          <DesktopStatusBar />
        </ThemeProvider>
      </body>
    </html>
  );
}
