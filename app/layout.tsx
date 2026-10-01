/*
 * Loopnow CPA
 * Receipt Processing & GST/HST Bookkeeping
 *
 * Copyright (c) 2026 Arnava Kumar Sinha. All rights reserved.
 */

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loopnow CPA",
  description: "Receipt Processing & GST/HST Bookkeeping",
  applicationName: "Loopnow CPA",
  authors: [{ name: "Arnava Kumar Sinha" }],
  creator: "Arnava Kumar Sinha",
  publisher: "Arnava Kumar Sinha",
  openGraph: {
    title: "Loopnow CPA",
    description: "Receipt Processing & GST/HST Bookkeeping",
    siteName: "Loopnow CPA",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Loopnow CPA",
    description: "Receipt Processing & GST/HST Bookkeeping",
  },
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
