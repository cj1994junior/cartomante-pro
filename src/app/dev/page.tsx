import type { Metadata } from "next";
import { DevPanel } from "@/components/dev/DevPanel";

export const metadata: Metadata = {
  title: "Painel do desenvolvedor — Cartomante Pro",
};

export default function DevPage() {
  return <DevPanel />;
}
