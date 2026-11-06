"use client";

import { useEffect } from "react";
import { getPalette, paletteCSSVars } from "@/lib/palettes";

export function applyPalette(paletteId: string) {
  if (typeof document === "undefined") return;
  const palette = getPalette(paletteId);
  const root = document.documentElement;
  for (const [key, value] of Object.entries(paletteCSSVars(palette))) {
    root.style.setProperty(key, value);
  }
  root.style.colorScheme = palette.isLight ? "light" : "dark";
  root.dataset.palette = palette.id;
  root.dataset.paletteName = palette.name;
}

export function ThemeProvider({ paletteId, children }: { paletteId: string; children: React.ReactNode }) {
  useEffect(() => {
    applyPalette(paletteId);
  }, [paletteId]);
  return <>{children}</>;
}
