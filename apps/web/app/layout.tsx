import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Chainfolio — On-Chain Builder Portfolio",
  description:
    "Analyze your Ethereum wallet's developer activity and generate a verifiable on-chain reputation score.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${inter.className} bg-surface-background text-surface-foreground min-h-screen font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
