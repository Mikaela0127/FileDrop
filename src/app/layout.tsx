import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "FileDrop",
  description: "A private, expiring file transfer service.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
