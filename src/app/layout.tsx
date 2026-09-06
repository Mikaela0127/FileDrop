import type { Metadata } from "next";

import "./globals.css";
import { LanguageProvider, T } from "../lib/i18n/language-provider";
import { LanguageSwitcher } from "./language-switcher";

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
      <body>
        <LanguageProvider>
          <a className="skip-link" href="#main-content">
            <T id="skip.main" />
          </a>
          <LanguageSwitcher />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
