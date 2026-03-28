import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/ui/Sidebar";
import HealthCheck from "@/components/HealthCheck";
import Providers from "@/components/Providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Sequel Brand Brain",
  description: "AI agent-building platform with a centralized knowledge layer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} font-sans antialiased bg-surface text-heading`}
      >
        <Providers>
          <HealthCheck />
          <Sidebar />
          <main className="ml-60 min-h-screen">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
