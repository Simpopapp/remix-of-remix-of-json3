import { describe, expect, it } from "vitest";
import type { MenuItemRow } from "@/server/contracts/types";
import { consolidateItems, normalizeText, pricesCompatible, tokenJaccard } from "./consolidate";

function item(partial: Partial<MenuItemRow> & { id: string; name: string }): MenuItemRow {
  return {
    restaurant_id: "r1",
    owner_id: "u1",
    source_image_id: null,
    source_image_ids: [],
    category: "Outros",
    description: null,
    price: null,
    currency: "BRL",
    variations: [],
    confidence: {},
    needs_validation: true,
    price_date: null,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  } as MenuItemRow;
}

describe("normalização e similaridade", () => {
  it("normaliza acentos, caixa e pontuação", () => {
    expect(normalizeText("Café  Latte!")).toBe(normalizeText("cafe latte"));
  });
  it("jaccard alto em sobrepostos, baixo em distintos", () => {
    expect(tokenJaccard("X-Frango", "X Frango")).toBeGreaterThanOrEqual(0.8);
    expect(tokenJaccard("X frango", "X frango grelhado")).toBeLessThan(0.8);
  });
  it("preço null é compatível; preços diferentes não são", () => {
    expect(pricesCompatible(null, 10)).toBe(true);
    expect(pricesCompatible(10, 10)).toBe(true);
    expect(pricesCompatible(10, 12)).toBe(false);
  });
});

describe("consolidação", () => {
  it("funde duplicado exato de fotos sobrepostas com proveniência unida", () => {
    const a = item({ id: "a", name: "Pão de queijo", category: "Entradas", price: 8, source_image_id: "img1", created_at: "2026-01-01T00:00:00Z" });
    const b = item({ id: "b", name: "pao de queijo", category: "Entradas", price: 8, source_image_id: "img2", created_at: "2026-01-02T00:00:00Z" });
    const { survivors, deactivatedIds, mergedCount } = consolidateItems([a, b]);
    expect(mergedCount).toBe(1);
    expect(survivors).toHaveLength(1);
    expect(survivors[0]?.id).toBe("b"); // mais recente com preço
    expect(survivors[0]?.source_image_ids?.sort()).toEqual(["img1", "img2"]);
    expect(deactivatedIds).toEqual(["a"]);
  });

  it("funde por similaridade (jaccard ≥ 0,8) com preço compatível, completa campos null", () => {
    const a = item({ id: "a", name: "Risoto de camarão com alho", category: "Pratos", price: 79.9, description: null, source_image_id: "img1" });
    const b = item({ id: "b", name: "Risoto de camarão alho", category: "Pratos", price: null, description: "Camarão, leite de coco", source_image_id: "img2", created_at: "2026-01-02T00:00:00Z" });
    const { survivors } = consolidateItems([a, b]);
    expect(survivors).toHaveLength(1);
    expect(survivors[0]?.description).toBe("Camarão, leite de coco");
    expect(survivors[0]?.price).toBe(79.9);
    expect(survivors[0]?.source_image_ids?.sort()).toEqual(["img1", "img2"]);
  });

  it("NÃO funde itens distintos parecidos com preços diferentes", () => {
    const a = item({ id: "a", name: "X-Frango", category: "Lanches", price: 22 });
    const b = item({ id: "b", name: "X-Frango grelhado", category: "Lanches", price: 27 });
    const { survivors, mergedCount } = consolidateItems([a, b]);
    expect(mergedCount).toBe(0);
    expect(survivors).toHaveLength(2);
  });

  it("NÃO funde itens de categorias diferentes", () => {
    const a = item({ id: "a", name: "Suco de laranja", category: "Bebidas", price: 9 });
    const b = item({ id: "b", name: "Suco de laranja", category: "Sobremesas", price: 9 });
    expect(consolidateItems([a, b]).survivors).toHaveLength(2);
  });

  it("é idempotente: rodar sobre a saída não muda nada", () => {
    const a = item({ id: "a", name: "Pão de queijo", category: "Entradas", price: 8, source_image_id: "img1" });
    const b = item({ id: "b", name: "pao de queijo", category: "Entradas", price: 8, source_image_id: "img2" });
    const first = consolidateItems([a, b]);
    const after = consolidateItems(first.survivors);
    expect(after.mergedCount).toBe(0);
    expect(after.survivors).toHaveLength(first.survivors.length);
    expect(after.survivors[0]?.source_image_ids?.sort()).toEqual(["img1", "img2"]);
  });
});
