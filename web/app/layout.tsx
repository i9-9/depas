import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Candidato · Recoleta y alrededores",
  description: "Un departamento para mirar. El resto, para marcar favoritos. Uso privado.",
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="bg-bg text-ink">
      <head>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content="#F2F0EB" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#111111" media="(prefers-color-scheme: dark)" />
      </head>
      <body className="bg-bg text-ink">{children}</body>
    </html>
  );
}
