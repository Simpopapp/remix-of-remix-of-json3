import { z } from "zod";
import type { ConfidenceMap, ImageReadResult, ItemVariation, MenuCandidate } from "@/server/contracts/types";

/** Esquema de saída do modelo de visão (1 imagem = 1 leitura). Raiz objeto, campos required/nullable. */
export const variationSchema = z.object({
  tipo: z.enum(["tamanho", "adicional"]),
  nome: z.string(),
  preco: z.number().nullable(),
});

export const menuCandidateSchema = z.object({
  categoria: z.string(),
  nome: z.string(),
  descricao: z.string().nullable(),
  preco: z.number().nullable(),
  moeda: z.string(),
  variacoes: z.array(variationSchema),
  confianca: z.record(z.string(), z.enum(["alta", "baixa"])),
});

export const imageReadSchema = z.object({
  e_cardapio: z.boolean(),
  motivo_descarte: z.string().nullable(),
  data_da_foto: z.string().nullable(),
  itens: z.array(menuCandidateSchema),
});

export type ImageReadParsed = z.infer<typeof imageReadSchema>;

/** Instruções fixas do modelo (planejamento: nunca inventar; descartar não-cardápio). */
export const MENU_READ_INSTRUCTIONS = `Você lê UMA foto enviada por um usuário para extrair itens de cardápio.

Regras absolutas:
1. Se a foto NÃO for de um cardápio/menu (prato, fachada, ambiente, pessoas, logo), responda e_cardapio=false com motivo_descarte curto e itens=[].
2. NUNCA invente preço ou nome. Campo não legível (borrado, cortado, ambíguo) = null + confianca[campo]="baixa".
3. Preço é número sem símbolo de moeda (ex.: 19.90). moeda="BRL" por padrão; use o que estiver escrito se explícito.
4. data_da_foto: yyyy-mm-dd somente se a data estiver visível na foto; senão null.
5. variacoes: tamanhos/adicionais como [{tipo: "tamanho"|"adicional", nome, preco|null}].
6. categoria: seção do cardápio (ex.: "Entradas", "Bebidas"); se o cardápio não tiver seções, use "Outros".
7. confianca: registre "baixa" para qualquer campo incerto; "alta" quando a leitura for clara.`;

/** Normaliza a resposta do modelo em candidatos prontos para o banco. */
export function normalizeCandidates(parsed: ImageReadParsed): MenuCandidate[] {
  const out: MenuCandidate[] = [];
  for (const item of parsed.itens) {
    const nome = (item.nome ?? "").trim();
    if (!nome) continue; // sem nome legível: nada a registrar (não inventar)
    const confianca: ConfidenceMap = {};
    for (const [k, v] of Object.entries(item.confianca ?? {})) {
      if (v === "alta" || v === "baixa") confianca[k] = v;
    }
    const variacoes: ItemVariation[] = (item.variacoes ?? [])
      .filter((v) => (v.nome ?? "").trim())
      .map((v) => ({ tipo: v.tipo, nome: v.nome.trim(), preco: typeof v.preco === "number" ? v.preco : null }));
    out.push({
      categoria: (item.categoria ?? "").trim() || "Outros",
      nome,
      descricao: (item.descricao ?? "").trim() || null,
      preco: typeof item.preco === "number" ? item.preco : null,
      moeda: (item.moeda ?? "BRL").trim() || "BRL",
      variacoes,
      confianca,
    });
  }
  return out;
}

/** Extrai yyyy-mm-dd válido; senão null (nunca inventar data). */
export function parseMenuDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return `${y}-${mo}-${d}`;
}

/** Converte a resposta crua (ex.: texto do modelo) em ImageReadResult seguro. */
export function toImageReadResult(parsed: ImageReadParsed): ImageReadResult {
  return {
    e_cardapio: parsed.e_cardapio,
    motivo_descarte: parsed.motivo_descarte ?? null,
    data_da_foto: parseMenuDate(parsed.data_da_foto),
    itens: parsed.e_cardapio ? normalizeCandidates(parsed) : [],
  };
}

/** base64 em workerd-safe (btoa em blocos). */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
