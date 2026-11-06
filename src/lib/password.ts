import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function normalizeEmail(email: string): string {
  return email
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toLowerCase();
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split(":");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    if (candidate.length !== expected.length) return false;
    return timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

/** Evita gravar uma senha diferente da que foi digitada no cadastro. */
export function tenantPasswordError(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 6) return "A senha deve ter ao menos 6 caracteres.";
  if (value.length > 120) return "A senha deve ter no máximo 120 caracteres.";
  if (value !== value.trim()) return "A senha não pode começar ou terminar com espaços.";
  return null;
}

/** Compatibilidade com cadastros antigos, que limitavam silenciosamente a senha a 120 caracteres. */
export function verifyTenantPassword(password: string, stored: string): boolean {
  if (verifyPassword(password, stored)) return true;
  return password.length > 120 && verifyPassword(password.slice(0, 120), stored);
}
