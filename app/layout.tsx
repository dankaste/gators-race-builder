import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";

// Source Sans Pro (the team site's body font) is published on Google Fonts as "Source Sans 3".
const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
  weight: ["300", "400", "600", "700", "900"],
});

export const metadata: Metadata = {
  title: "Gators Race Director",
  description:
    "Turn PlayMetrics registration into WebScorer start lists and race-day handouts for the Gators Race Series.",
  // This app handles minors' PII — never let it be indexed.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sourceSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
