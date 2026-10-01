import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LoopNow CPA Copilot",
  description: "Receipt classification, compliance review and ITC workflow.",
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