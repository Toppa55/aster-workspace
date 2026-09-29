import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Astrid Workspace",
  description: "Your private, multi-provider AI chat and coding workspace.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/astrid-icon.png",
    shortcut: "/astrid-icon.png",
    apple: "/astrid-icon.png",
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
