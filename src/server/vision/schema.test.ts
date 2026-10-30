import { describe, expect, it } from "vitest";
import {
  arrayBufferToBase64,
  imageReadSchema,
  normalizeCandidates,
  parseMenuDate,
  toImageReadResult,
} from "./schema";

const validMenu = {
  e_cardapio: true,
  motivo_descarte: null,
  data_da_foto: "2024-03-01",
  itens: [
    {
      categoria: "Bebidas",
      nome: "Café Latte ",
      descricao: "Leite e espresso",
      preco: 12.5,
      moeda: "BRL",
      variacoes: [{ tipo: "tamanho", nome: "Grande", preco: 15 }],
      confianca: { nome: "alta", preco: "alta" },
    },
    {
      categoria: "  ",
      nome: "   ",
      descricao: null,
      preco: null,
      moeda: "BRL",
      variacoes: [],
      confianca: {},
    },
  ],
};

const nonMenu = {
  e_cardapio: false,
  motivo_descarte: "Prato montado, sem lista de itens",
  data_da_foto: null,
  itens: [],
};

const uncertain = {
  e_cardapio: true,
  motivo_descarte: null,
  data_da_foto: "legível? 2024-03",
  itens: [
    {
      categoria: "Lanches",
      nome: "X-Burguer (borrado)",
      descricao: null,
      preco: null,
      moeda: "BRL",
      variacoes: [],
      confianca: { preco: "baixa", nome: "baixa" },
    },
  ],
};

describe("esquema de leitura de imagem", () => {
  it("valida cardápio completo", () => {
    expect(imageReadSchema.safeParse(validMenu).success).toBe(true);
  });

  it("valida descarte de não-cardápio", () => {
    expect(imageReadSchema.safeParse(nonMenu).success).toBe(true);
  });
});

describe("normalização dos itens (nunca inventar)", () => {
  it("mantém item legível com dados completos", () => {
    const result = toImageReadResult(imageReadSchema.parse(validMenu));
    expect(result.itens).toHaveLength(1);
    expect(result.itens[0]?.nome).toBe("Café Latte");
    expect(result.itens[0]?.categoria).toBe("Bebidas");
    expect(result.itens[0]?.preco).toBe(12.5);
    expect(result.itens[0]?.variacoes[0]?.nome).toBe("Grande");
  });

  it("descarta item sem nome legível (nada a registrar, nada inventado)", () => {
    const result = normalizeCandidates(imageReadSchema.parse(validMenu));
    expect(result).toHaveLength(1); // o item sem nome some
  });

  it("item incerto: preço permanece null e confiança baixa preservada", () => {
    const result = toImageReadResult(imageReadSchema.parse(uncertain));
    expect(result.itens[0]?.preco).toBeNull();
    expect(result.itens[0]?.confianca["preco"]).toBe("baixa");
    expect(result.itens[0]?.categoria).toBe("Lanches");
  });

  it("não-cardápio: nenhum item sai", () => {
    const result = toImageReadResult(imageReadSchema.parse(nonMenu));
    expect(result.e_cardapio).toBe(false);
    expect(result.itens).toHaveLength(0);
    expect(result.motivo_descarte).toBeTruthy();
  });
});

describe("datas e base64", () => {
  it("só aceita datas completas (nunca inventar dia)", () => {
    expect(parseMenuDate("2024-03-01")).toBe("2024-03-01");
    expect(parseMenuDate("2024-03")).toBeNull();
    expect(parseMenuDate(null)).toBeNull();
  });

  it("base64 round-trip", () => {
    const bytes = new TextEncoder().encode("hello");
    const b64 = arrayBufferToBase64(bytes.buffer);
    expect(atob(b64)).toBe("hello");
  });
});
