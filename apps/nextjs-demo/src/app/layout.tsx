import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CursorBuddy } from "cursor-buddy/client";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cursor Buddy Demo",
  description: "AI-powered cursor companion demo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <CursorBuddy endpoint="/api/cursor-buddy" />
      </body>
    </html>
  );
}
