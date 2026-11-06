import type { WhatsAppTemplate, WhatsAppTemplateCategory } from "./types";

export const WHATSAPP_CATEGORY_LABELS: Record<WhatsAppTemplateCategory, string> = {
  confirmacao: "Confirmação",
  lembrete: "Lembrete",
  inicio: "Início da consulta",
  pagamento: "Pagamento / Pix",
  pos_consulta: "Pós-consulta",
  trabalho: "Trabalhos e terapias",
  retorno: "Retorno / agenda",
  geral: "Mensagem geral",
};

export const WHATSAPP_PLACEHOLDERS: { token: string; label: string }[] = [
  { token: "{primeiro_nome}", label: "Primeiro nome" },
  { token: "{nome}", label: "Nome completo" },
  { token: "{servico}", label: "Método / Trabalho" },
  { token: "{data}", label: "Data" },
  { token: "{hora}", label: "Horário" },
  { token: "{valor}", label: "Valor total" },
  { token: "{restante}", label: "Valor pendente" },
  { token: "{duracao_real}", label: "Tempo trabalhado" },
  { token: "{pix}", label: "Dados de pagamento" },
  { token: "{profissional}", label: "Seu nome" },
];

export const DEFAULT_WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: "tpl_confirmacao",
    title: "Confirmação de agendamento",
    category: "confirmacao",
    body:
      "Olá, {primeiro_nome}! ✨ Passando para confirmar sua consulta de *{servico}* agendada para o dia *{data}* às *{hora}* (valor: {valor}). Qualquer dúvida estou à disposição. Com carinho, {profissional} 🌙",
  },
  {
    id: "tpl_lembrete",
    title: "Lembrete da consulta",
    category: "lembrete",
    body:
      "Olá, {primeiro_nome}! 🌙 Lembrete carinhoso do nosso atendimento de *{servico}* marcado para *{data}* às *{hora}*. Nos vemos no horário combinado! ✨",
  },
  {
    id: "tpl_inicio",
    title: "Estou pronta para iniciar",
    category: "inicio",
    body:
      "Olá, {primeiro_nome}! ✨ Já estou pronta com as cartas na mesa para iniciarmos sua consulta de *{servico}*. Podemos começar? 🌙",
  },
  {
    id: "tpl_pagamento",
    title: "Instruções de pagamento / Pix",
    category: "pagamento",
    body:
      "Olá, {primeiro_nome}! ✨ Seguem os dados para pagamento do seu atendimento de *{servico}* (valor: {restante}):\n\n{pix}\n\nAssim que realizar, por gentileza me envie o comprovante por aqui. Gratidão! 🙏",
  },
  {
    id: "tpl_pos_consulta",
    title: "Agradecimento pós-consulta",
    category: "pos_consulta",
    body:
      "Olá, {primeiro_nome}! ✨ Muita gratidão pela confiança na nossa consulta de hoje ({duracao_real}). Espero que as orientações tragam luz, clareza e abertura aos seus caminhos. Conte comigo sempre! 🌙 — {profissional}",
  },
  {
    id: "tpl_trabalho",
    title: "Andamento de trabalho / terapia",
    category: "trabalho",
    body:
      "Olá, {primeiro_nome}! 🕯️ Passando para atualizar sobre seu *{servico}* (início em {data}): tudo sendo realizado com muita firmeza, luz e dedicação. Qualquer orientação adicional te aviso por aqui! ✨",
  },
  {
    id: "tpl_retorno",
    title: "Convite de retorno / agenda aberta",
    category: "retorno",
    body:
      "Olá, {primeiro_nome}! ✨ Como estão as energias por aí? Passando para desejar uma semana iluminada e avisar que minha agenda deste mês está aberta caso sinta de fazer uma nova leitura ou alinhamento energético. Com carinho, {profissional} 🌙",
  },
];

export function renderWhatsAppTemplate(body: string, vars: Record<string, string>): string {
  const withAlias: Record<string, string> = {
    ...vars,
    metodo: vars.servico ?? "",
  };
  return body.replace(/\{([a-z0-9_]+)\}/gi, (full, key: string) => {
    const k = key.toLowerCase();
    return withAlias[k] !== undefined ? withAlias[k] : full;
  });
}

/**
 * Converte telefone digitado e DDI padrão em dígitos prontos para wa.me (ex.: 5511988771020).
 * Se o telefone começar com "+", respeita o DDI já informado no número.
 */
export function formatWhatsAppPhone(rawPhone: string | null | undefined, defaultDdi = "55"): string | null {
  if (!rawPhone) return null;
  const trimmed = rawPhone.trim();
  if (!trimmed) return null;
  const hasExplicitPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  // Remove zero inicial de discagem nacional (ex.: 011988771020 -> 11988771020)
  if (!hasExplicitPlus && digits.startsWith("0") && digits.length >= 11) {
    digits = digits.replace(/^0+/, "");
  }

  if (hasExplicitPlus) {
    return digits.length >= 8 ? digits : null;
  }

  const cleanDdi = defaultDdi.replace(/\D/g, "") || "55";
  // No Brasil os números locais têm 10 ou 11 dígitos (DDD + número). Em Portugal 9 dígitos.
  if (digits.startsWith(cleanDdi) && digits.length >= cleanDdi.length + 9) {
    return digits;
  }
  if (digits.length >= 8 && digits.length <= 11) {
    return `${cleanDdi}${digits}`;
  }
  return digits.length >= 10 ? digits : null;
}

export function buildWhatsAppUrl(cleanDigits: string, message: string): string {
  return `https://wa.me/${cleanDigits}?text=${encodeURIComponent(message)}`;
}
