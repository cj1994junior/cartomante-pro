import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "Cartomante Pro — gestão de consultas, agenda e finanças",
  description:
    "Aplicativo de gestão para cartomantes: consultas, agenda com lembretes, consulentes, métodos de tiragem, pagamentos, finanças, relatórios e backup.",
  manifest: "/manifest.webmanifest",
  applicationName: "Cartomante Pro",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Cartomante Pro" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#2a1b44",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
