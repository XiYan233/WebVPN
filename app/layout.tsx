import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WebVPN",
  description: "Secure internal access with OAuth and reverse proxy",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
