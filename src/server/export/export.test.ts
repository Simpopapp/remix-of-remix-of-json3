import { describe, expect, it } from "vitest";
import type { ExportedMenu, MenuItemRow } from "@/server/contracts/types";
import { buildExportedMenu } from "./json";
import { menuToCsv } from "./csv";

function item(partial: Partial<MenuItemRow> & { id: string; name: string }): MenuItemRow {
  return {
    restaurant_id: "r1",
    owner_id: "u1",
    source_image_id: "img1",
    source_image_ids: ["img1"],
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

const restaurant = { name: "Bar do Zé", city: "São Paulo", maps_url: "https://maps.app/x" };

describe("export JSON (esquema provisório)", () => {
  it("monta categorias com proveniência e selo a validar", () => {
    const menu = buildExportedMenu(restaurant, [
      item({ id: "1", name: "Pão de queijo", category: "Entradas", price: 8, needs_validation: true, price_date: "2024-03-01", source_image_ids: ["img1", "img2"] }),
      item({ id: "2", name: "Coca lata", category: "Bebidas", price: 7, source_image_ids: ["img3"] }),
    ], "2026-01-01T00:00:00Z");
    expect(menu.restaurante.nome).toBe("Bar do Zé");
    expect(menu.categorias.map((c) => c.nome)).toEqual(["Entradas", "Bebidas"]);
    const pao = menu.categorias[0]!.itens[0]!;
    expect(pao.a_validar).toBe(true);
    expect(pao.data_preco).toBe("2024-03-01");
    expect(pao.origem_imagens).toEqual(["img1", "img2"]);
    expect(pao.preco).toBe(8);
  });

  it("itens inativos não saem no export", () => {
    const menu = buildExportedMenu(restaurant, [
      item({ id: "1", name: "Ativo", category: "Entradas" }),
      item({ id: "2", name: "Inativo", category: "Entradas", is_active: false }),
    ]);
    // o chamador filtra is_active=true; o gerador também ignora se vier
    const filtered = menu.categorias[0]!.itens.filter((i) => i.nome !== "Inativo");
    expect(filtered).toHaveLength(1);
    expect(menu.categorias[0]!.itens.some((i) => i.nome === "Inativo")).toBe(false);
  });
});

describe("export CSV", () => {
  const menu: ExportedMenu = buildExportedMenu(restaurant, [
    item({ id: "1", name: 'Prato "especial", completo', category: "Pratos", price: 45.5, price_date: "2024-03-01" }),
    item({ id: "2", name: "Suco", category: "Bebidas", price: null, variations: [{ tipo: "tamanho", nome: "500ml", preco: 9 }] }),
  ]);

  it("escapa vírgulas e aspas", () => {
    const csv = menuToCsv(menu);
    expect(csv).toContain('"Prato ""especial"", completo"');
    expect(csv.split("\r\n")[0]).toBe("categoria,nome,descricao,preco,moeda,variacoes,a_validar,data_preco");
  });

  it("preço ausente fica vazio e variações serializadas", () => {
    const csv = menuToCsv(menu);
    const suco = csv.split("\r\n").find((l) => l.includes("Suco"))!;
    expect(suco).toContain("tamanho:500ml:9");
    expect(suco.split(",")[3]).toBe("");
  });
});
