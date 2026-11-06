export type ResolvedPalette = {
  id: string;
  name: string;
  group: string;
  bg: string;
  surface: string;
  raised: string;
  primary: string;
  primaryInk: string;
  primarySoft: string;
  accent: string;
  accentSoft: string;
  text: string;
  muted: string;
  border: string;
  isLight: boolean;
};

type Seed = [name: string, bgHue: number, bgSat: number, bgLight: number, primaryHue: number, accentHue: number];

/** 60 paletas curadas, organizadas em 5 famílias. */
const SEEDS: Record<string, Seed[]> = {
  Escuras: [
    ["Noite Mística", 265, 40, 10, 42, 268],
    ["Ametista & Ouro", 275, 38, 14, 44, 282],
    ["Obsidiana", 240, 12, 8, 42, 265],
    ["Meia-Noite", 230, 42, 12, 43, 250],
    ["Floresta Sombria", 155, 32, 12, 46, 160],
    ["Vinho Sagrado", 345, 34, 14, 44, 20],
    ["Azul Profundo", 215, 48, 13, 44, 210],
    ["Grafite Dourado", 40, 8, 15, 42, 250],
    ["Índigo Lunar", 250, 45, 16, 48, 258],
    ["Musgo Antigo", 120, 22, 16, 46, 130],
    ["Petróleo", 192, 36, 14, 44, 180],
    ["Café Ritual", 24, 26, 15, 44, 30],
  ],
  Claras: [
    ["Pergaminho Dourado", 42, 46, 94, 38, 265],
    ["Marfim", 40, 32, 96, 40, 250],
    ["Linho & Ouro", 36, 28, 92, 40, 20],
    ["Rosa & Ouro", 345, 40, 94, 38, 320],
    ["Pêssego Suave", 24, 44, 93, 32, 350],
    ["Areia do Deserto", 38, 40, 90, 34, 190],
    ["Névoa Lilás", 270, 38, 94, 44, 276],
    ["Menta Sagrada", 158, 30, 93, 42, 165],
    ["Céu de Abril", 200, 42, 94, 40, 210],
    ["Baunilha", 48, 44, 95, 42, 30],
    ["Quartzo Rosa", 330, 40, 95, 42, 340],
    ["Água Marinha", 185, 38, 92, 40, 175],
  ],
  Vibrantes: [
    ["Orquídea Mística", 292, 42, 16, 44, 300],
    ["Carmesim", 355, 46, 18, 44, 10],
    ["Safira", 222, 52, 18, 46, 210],
    ["Esmeralda", 152, 42, 16, 44, 160],
    ["Turquesa Cigana", 186, 46, 16, 42, 190],
    ["Magenta Ritual", 320, 46, 18, 44, 330],
    ["Âmbar Solar", 32, 42, 18, 42, 40],
    ["Cobre Flamejante", 16, 40, 17, 40, 24],
    ["Ciano Lunar", 178, 44, 14, 46, 184],
    ["Púrpura Real", 262, 50, 18, 44, 270],
    ["Rubi", 340, 44, 17, 42, 350],
    ["Aurora Boreal", 200, 40, 15, 44, 150],
  ],
  Terrosas: [
    ["Terracota", 18, 34, 86, 34, 24],
    ["Argila", 24, 26, 78, 34, 30],
    ["Sépia Antiga", 34, 24, 32, 40, 28],
    ["Oliva", 78, 22, 30, 44, 86],
    ["Areia Escura", 40, 22, 34, 42, 190],
    ["Cacau", 22, 30, 22, 42, 30],
    ["Palha", 46, 36, 88, 38, 40],
    ["Pedra Lunar", 220, 10, 88, 42, 240],
    ["Bronze Antigo", 36, 36, 28, 40, 34],
    ["Tabaco", 30, 26, 24, 42, 20],
    ["Barro", 14, 28, 62, 36, 20],
    ["Chumbo", 220, 8, 26, 42, 220],
  ],
  Frias: [
    ["Oceano Profundo", 205, 46, 16, 44, 186],
    ["Gelo Boreal", 198, 40, 94, 42, 200],
    ["Lavanda Gélida", 252, 34, 92, 44, 262],
    ["Azul Névoa", 210, 24, 88, 40, 216],
    ["Verde-Água", 172, 30, 90, 44, 176],
    ["Ardósia", 212, 14, 28, 44, 200],
    ["Safira Noturna", 226, 50, 14, 46, 236],
    ["Violeta Frio", 268, 36, 88, 44, 274],
    ["Cinza Prata", 210, 8, 84, 42, 250],
    ["Lago Sereno", 188, 32, 86, 42, 192],
    ["Bruma", 220, 18, 90, 40, 230],
    ["Jade Frio", 160, 26, 34, 44, 168],
  ],
};

function hsl(h: number, s: number, l: number): string {
  const sat = Math.max(0, Math.min(100, Math.round(s)));
  const light = Math.max(0, Math.min(100, Math.round(l)));
  return `hsl(${Math.round(h)} ${sat}% ${light}%)`;
}

function build(seed: Seed, group: string, index: number): ResolvedPalette {
  const [name, bgHue, bgSat, bgLight, primaryHue, accentHue] = seed;
  const isLight = bgLight > 60;
  const id = `${group.toLowerCase()}-${index + 1}-${name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}`;

  const bg = hsl(bgHue, bgSat, bgLight);
  const surface = isLight ? hsl(bgHue, Math.max(6, bgSat - 14), Math.min(99, bgLight + 4)) : hsl(bgHue, bgSat + 2, bgLight + 5);
  const raised = isLight ? hsl(bgHue, Math.max(6, bgSat - 16), Math.min(99, bgLight - 3)) : hsl(bgHue, bgSat + 4, bgLight + 9);
  const primaryLight = isLight ? 40 : 66;
  const primary = hsl(primaryHue, isLight ? 58 : 62, primaryLight);
  const accent = hsl(accentHue, isLight ? 48 : 56, isLight ? 42 : 64);
  const text = isLight ? hsl(bgHue, 24, 14) : hsl(bgHue, 28, 96);
  const muted = isLight ? hsl(bgHue, 12, 40) : hsl(bgHue, 14, 72);
  const border = isLight ? hsl(bgHue, 20, 78) : hsl(bgHue, 22, 26);

  return {
    id,
    name,
    group,
    bg,
    surface,
    raised,
    primary,
    primaryInk: hsl(primaryHue, 48, 10),
    primarySoft: isLight ? hsl(primaryHue, 60, 90) : hsl(primaryHue, 40, 22),
    accent,
    accentSoft: isLight ? hsl(accentHue, 44, 90) : hsl(accentHue, 32, 24),
    text,
    muted,
    border,
    isLight,
  };
}

export const PALETTES: ResolvedPalette[] = Object.entries(SEEDS).flatMap(([group, seeds]) =>
  seeds.map((seed, index) => build(seed, group, index)),
);

export const PALETTE_GROUPS = Object.keys(SEEDS);

export const DEFAULT_PALETTE_ID = PALETTES[0].id;

export function getPalette(id: string | null | undefined): ResolvedPalette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

export function paletteCSSVars(palette: ResolvedPalette): Record<string, string> {
  return {
    "--bg": palette.isLight
      ? `radial-gradient(1100px 700px at 15% -10%, ${palette.surface} 0%, ${palette.bg} 60%, ${palette.raised} 100%)`
      : `radial-gradient(1200px 700px at 80% -10%, ${palette.raised} 0%, ${palette.bg} 55%)`,
    "--bg-solid": palette.bg,
    "--surface": palette.surface,
    "--raised": palette.raised,
    "--primary": palette.primary,
    "--primary-soft": palette.primarySoft,
    "--primary-ink": palette.primaryInk,
    "--accent": palette.accent,
    "--accent-soft": palette.accentSoft,
    "--text": palette.text,
    "--muted": palette.muted,
    "--border": palette.border,
  };
}
