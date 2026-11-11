import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Instrument_Serif, Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { JudgeBanner } from "@/components/site/judge-banner";
import { getAppUrl } from "@/lib/env";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  title: {
    default: "AgentShelf — shops ready for AI agents",
    template: "%s · AgentShelf",
  },
  description:
    "Turn a few product photos into a shop AI agents can discover, negotiate with, and pay.",
  openGraph: { title: "AgentShelf — shops ready for AI agents", description: "Pay with PayPal · Works with any AI agent", type: "website" },
  twitter: { card: "summary_large_image", title: "AgentShelf — shops ready for AI agents", description: "Pay with PayPal · Works with any AI agent" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${instrumentSerif.variable}`}>
      <body>
        <TooltipProvider>
          <Suspense fallback={null}><JudgeBanner /></Suspense>
          {children}
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </body>
    </html>
  );
}
