import type { Metadata } from "next";
import { AppClient } from "@/components/app/AppClient";

export const metadata: Metadata = {
  title: "Painel — Cartomante Pro",
};

export default function AppPage() {
  return <AppClient />;
}
