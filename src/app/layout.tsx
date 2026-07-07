import type { Metadata } from "next";
import { Teko, JetBrains_Mono, Inter } from "next/font/google";
import "./globals.css";

const teko = Teko({
  variable: "--font-teko",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Road to the Final",
  description: "Every remaining scenario to reach the final, ranked easiest to hardest.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${teko.variable} ${jetbrainsMono.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-ink text-chalk font-body">{children}</body>
    </html>
  );
}
