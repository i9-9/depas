import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Candidato · Recoleta y alrededores",
  description: "Un departamento para mirar. El resto, para marcar favoritos. Uso privado.",
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body>{children}</body>
    </html>
  );
}
