import type { RestaurantStatus } from "./types";

/** Etapas do pipeline na ordem de dependência (PRD D-09 / planejamento). */
export const PIPELINE_ORDER: readonly RestaurantStatus[] = [
  "coletando",
  "lendo",
  "consolidando",
  "aguardando_revisao",
] as const;

export const STATUS_LABEL: Record<RestaurantStatus, string> = {
  coletando: "Coletando imagens",
  lendo: "Lendo imagens",
  consolidando: "Consolidando itens",
  aguardando_revisao: "Aguardando revisão",
  concluido: "Concluído",
  erro: "Erro",
};

/** Transições permitidas: `erro` e `concluido` são terminais (voltam só por ação explícita do usuário). */
export function canTransition(from: RestaurantStatus, to: RestaurantStatus): boolean {
  if (from === to) return false;
  if (to === "erro") return true; // qualquer etapa pode falhar
  if (from === "erro" || from === "concluido") return false;
  const i = PIPELINE_ORDER.indexOf(from);
  const j = PIPELINE_ORDER.indexOf(to);
  return j === i + 1; // só avança uma etapa por tick (idempotência do pipeline)
}

export function nextPipelineStatus(current: RestaurantStatus): RestaurantStatus | null {
  const i = PIPELINE_ORDER.indexOf(current);
  if (i === -1 || i === PIPELINE_ORDER.length - 1) return null;
  return PIPELINE_ORDER[i + 1] ?? null;
}
