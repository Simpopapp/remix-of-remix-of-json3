import type { ConfidenceMap, ItemVariation, MenuItemRow } from "@/server/contracts/types";

/**
 * Núcleo puro de consolidação (PRD D-08): funde itens repetidos entre fotos
 * sobrepostas, preserva proveniência e completa campos vazios do sobrevivente.
 */

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenJaccard(a: string, b: string): number {
  const ta = new Set(normalizeText(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (ta.size === 0 && tb.size === 0) return 1;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection += 1;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Preços compatíveis: iguais, ou um deles desconhecido (null). */
export function pricesCompatible(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return true;
  return Math.abs(a - b) < 0.005;
}

const JACCARD_THRESHOLD = 0.8;

function sameItem(a: MenuItemRow, b: MenuItemRow): boolean {
  if (normalizeText(a.category) !== normalizeText(b.category)) return false;
  const na = normalizeText(a.name);
  const nb = normalizeText(b.name);
  if (na === nb) return pricesCompatible(a.price, b.price);
  return tokenJaccard(a.name, b.name) >= JACCARD_THRESHOLD && pricesCompatible(a.price, b.price);
}

function pricePriority(item: MenuItemRow): number {
  return item.price === null ? 0 : 1;
}

export type ConsolidationResult = {
  survivors: MenuItemRow[];
  deactivatedIds: string[];
  mergedCount: number;
};

export function consolidateItems(items: MenuItemRow[]): ConsolidationResult {
  // Ordena: com preço primeiro; dentro disso, mais recente primeiro.
  const ordered = [...items].sort((a, b) => {
    const p = pricePriority(b) - pricePriority(a);
    if (p !== 0) return p;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const groups: MenuItemRow[][] = [];
  for (const item of ordered) {
    const group = groups.find((g) => sameItem(g[0]!, item));
    if (group) group.push(item);
    else groups.push([item]);
  }

  const survivors: MenuItemRow[] = [];
  const deactivatedIds: string[] = [];
  let mergedCount = 0;

  for (const group of groups) {
    const head = group[0]!;
    if (group.length === 1) {
      survivors.push(head);
      continue;
    }
    mergedCount += group.length - 1;

    const provenance = new Set<string>();
    for (const member of group) {
      if (member.source_image_id) provenance.add(member.source_image_id);
      for (const id of member.source_image_ids ?? []) provenance.add(id);
    }

    // Completa campos vazios do sobrevivente com valores de irmãos.
    let description = head.description;
    let price = head.price;
    let variations = head.variations as ItemVariation[];
    let confidence = { ...(head.confidence as ConfidenceMap) };
    for (const member of group.slice(1)) {
      if (!description && member.description) description = member.description;
      if (price === null && member.price !== null) price = member.price;
      if ((!variations || variations.length === 0) && Array.isArray(member.variations) && (member.variations as ItemVariation[]).length > 0) {
        variations = member.variations as ItemVariation[];
      }
      const memberConfidence = (member.confidence ?? {}) as ConfidenceMap;
      for (const [field, level] of Object.entries(memberConfidence)) {
        if (confidence[field] !== "alta" && level === "alta") confidence[field] = "alta";
      }
    }
    if (price !== head.price && (confidence["preco"] ?? "baixa") !== "alta") {
      confidence["preco"] = confidence["preco"] === "alta" ? "alta" : "baixa";
    }

    deactivatedIds.push(...group.map((m) => m.id).filter((id) => id !== head.id));
    survivors.push({
      ...head,
      description,
      price,
      variations,
      confidence,
      source_image_ids: Array.from(provenance),
    });
  }

  return { survivors, deactivatedIds, mergedCount };
}
