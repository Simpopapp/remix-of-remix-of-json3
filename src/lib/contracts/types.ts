import type { Database } from "@/integrations/supabase/types";

/** Etapas visíveis do pipeline por restaurante (planejamento project1.md). */
export type RestaurantStatus =
  | "coletando"
  | "lendo"
  | "consolidando"
  | "aguardando_revisao"
  | "concluido"
  | "erro";

export type ImageSource = "scrape" | "upload";

export type ReadStatus = "pending" | "reading" | "read" | "skipped" | "failed";

/** Confiança por campo: "alta" (ok) | "baixa" (texto borrado/cortado/ambíguo). */
export type ConfidenceMap = Record<string, "alta" | "baixa">;

export type ItemVariation = {
  tipo: "tamanho" | "adicional";
  nome: string;
  preco: number | null;
};

/** Item vindo da visão, antes de entrar no banco. Campos incertos vêm vazios/null. */
export type MenuCandidate = {
  categoria: string;
  nome: string;
  descricao: string | null;
  preco: number | null;
  moeda: string;
  variacoes: ItemVariation[];
  confianca: ConfidenceMap;
};

/** Resultado da leitura de UMA imagem pelo modelo de visão. */
export type ImageReadResult = {
  e_cardapio: boolean;
  motivo_descarte?: string | null;
  data_da_foto?: string | null;
  itens: MenuCandidate[];
};

export type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"];
export type RestaurantInsert = Database["public"]["Tables"]["restaurants"]["Insert"];
export type SourceImageRow = Database["public"]["Tables"]["source_images"]["Row"];
export type MenuItemRow = Database["public"]["Tables"]["menu_items"]["Row"];
export type MenuItemInsert = Database["public"]["Tables"]["menu_items"]["Insert"];
export type EditHistoryRow = Database["public"]["Tables"]["edit_history"]["Row"];

export type EditAction = "create" | "update" | "delete" | "move" | "merge" | "restore";

/** Esquema JSON de export (provisório — INPUT-1 do PRD). */
export type ExportedMenu = {
  restaurante: {
    nome: string;
    cidade: string | null;
    maps_url: string | null;
    gerado_em: string;
  };
  categorias: Array<{
    nome: string;
    itens: Array<{
      nome: string;
      descricao: string | null;
      preco: number | null;
      moeda: string;
      variacoes: ItemVariation[];
      a_validar: boolean;
      data_preco: string | null;
      origem_imagens: string[];
    }>;
  }>;
};

export const MENU_IMAGES_BUCKET = "menu-images";
