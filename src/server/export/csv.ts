import type { ExportedMenu } from "@/server/contracts/types";

/** Gerador puro do CSV plano (PRD D-10). */
const CSV_HEADER = "categoria,nome,descricao,preco,moeda,variacoes,a_validar,data_preco";

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function formatVariations(variacoes: ExportedMenu["categorias"][number]["itens"][number]["variacoes"]): string {
  return variacoes
    .map((v) => `${v.tipo}:${v.nome}:${v.preco === null ? "?" : v.preco}`)
    .join("|");
}

export function menuToCsv(menu: ExportedMenu): string {
  const lines: string[] = [CSV_HEADER];
  for (const category of menu.categorias) {
    for (const item of category.itens) {
      lines.push(
        [
          escapeCsv(category.nome),
          escapeCsv(item.nome),
          escapeCsv(item.descricao ?? ""),
          item.preco === null ? "" : String(item.preco),
          escapeCsv(item.moeda),
          escapeCsv(formatVariations(item.variacoes)),
          item.a_validar ? "sim" : "nao",
          item.data_preco ?? "",
        ].join(","),
      );
    }
  }
  return lines.join("\r\n");
}
