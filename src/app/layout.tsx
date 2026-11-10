import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "e-Fatura", template: "%s · e-Fatura" },
  description: "Descarga multiempresa das faturas do e-Fatura (AT)",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT">
      <body>{children}</body>
    </html>
  );
}
