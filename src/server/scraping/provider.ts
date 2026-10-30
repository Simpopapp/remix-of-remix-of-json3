/**
 * Interface isolada do fornecedor de scraping (PRD D-06).
 * Trocar de fornecedor = implementar MapsGalleryProvider; nada mais muda.
 */

export type GalleryRequest = {
  /** Link de um local do Google Maps (preferido). */
  mapsUrl?: string;
  /** Alternativa quando não há link. */
  name?: string;
  city?: string;
};

export type GalleryImage = {
  /** URL da imagem da galeria do local. */
  url: string;
  /** Data da foto, quando o fornecedor informar (ISO yyyy-mm-dd ou timestamp). */
  takenAt?: string | null;
};

export type GalleryResult = {
  images: GalleryImage[];
};

export interface MapsGalleryProvider {
  readonly id: string;
  fetchGallery(request: GalleryRequest): Promise<GalleryResult>;
}

/** Chave/URL do fornecedor ausente ou inválida (erro acionável ao usuário). */
export class ScraperConfigError extends Error {
  constructor(message = "Serviço de coleta não configurado") {
    super(message);
    this.name = "ScraperConfigError";
  }
}

/** Fornecedor respondeu erro/indisponibilidade ou galeria vazia. */
export class ScraperUnavailableError extends Error {
  constructor(message = "Não foi possível coletar imagens deste local") {
    super(message);
    this.name = "ScraperUnavailableError";
  }
}

/** Validação mínima de entrada antes de chamar qualquer fornecedor. */
export function validateGalleryRequest(request: GalleryRequest): void {
  if (request.mapsUrl?.trim()) return;
  if (request.name?.trim()) return;
  throw new ScraperUnavailableError("Informe o link do Maps ou o nome do restaurante");
}
