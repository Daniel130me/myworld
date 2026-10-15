import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Curiosity — Every place has a story",
  description: "A new way to discover the world around you. Explore places, uncover sourced stories, and follow your curiosity.",
  keywords: ["Curiosity", "discovery", "maps", "places", "stories", "explore", "Wikipedia"],
  authors: [{ name: "Curiosity" }],
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "Curiosity — Every place has a story",
    description: "Explore places, uncover sourced stories, and follow your curiosity.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
