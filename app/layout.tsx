import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aster Workspace",
  description: "Your private, multi-provider AI chat and coding workspace.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icon-192.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
