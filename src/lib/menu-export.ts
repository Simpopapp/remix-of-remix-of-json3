import type { ExportedMenu, MenuItemRow } from "@/lib/contracts/types";

/**
 * Gerador puro do JSON de export (PRD D-10, esquema provisório até INPUT-1).
 * Itens is_active=false nunca saem — filtrados antes de chamar.
 */
export function buildExportedMenu(
  restaurant: { name: string; city: string | null; maps_url: string | null },
  activeItems: MenuItemRow[],
  generatedAt: string = new Date().toISOString(),
): ExportedMenu {
  const categories = new Map<string, ExportedMenu["categorias"][number]["itens"]>();
  for (const item of activeItems.filter((i) => i.is_active !== false)) {
    const category = item.category || "Outros";
    const bucket = categories.get(category) ?? [];
    bucket.push({
      nome: item.name,
      descricao: item.description ?? null,
      preco: item.price === null ? null : Number(item.price),
      moeda: item.currency || "BRL",
      variacoes: (item.variations ?? []) as ExportedMenu["categorias"][number]["itens"][number]["variacoes"],
      a_validar: item.needs_validation,
      data_preco: item.price_date ?? null,
      origem_imagens: item.source_image_ids ?? [],
    });
    categories.set(category, bucket);
  }

  return {
    restaurante: {
      nome: restaurant.name,
      cidade: restaurant.city,
      maps_url: restaurant.maps_url,
      gerado_em: generatedAt,
    },
    categorias: Array.from(categories.entries()).map(([nome, itens]) => ({ nome, itens })),
  };
}
