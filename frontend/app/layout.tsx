import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "SEO Keyword Agent — Open Source SEO Research Tool",
  description:
    "Open-source SEO keyword research agent powered by DataForSEO and your own AI key. Deploy free on Vercel. No monthly fees. MIT License.",
  icons: {
    icon: "/favicon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#fafaf9",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
