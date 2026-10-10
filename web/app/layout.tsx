import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "El de ahora · Recoleta y alrededores",
  description: "Un departamento para mirar. El resto, para guardar los que te gusten. Uso privado.",
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F0EB" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="bg-bg text-ink">
      <head>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="color-scheme" content="light dark" />
      </head>
      <body className="bg-bg text-ink">{children}</body>
    </html>
  );
}
