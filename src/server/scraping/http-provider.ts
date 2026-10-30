import {
  MapsGalleryProvider,
  ScraperConfigError,
  ScraperUnavailableError,
  GalleryRequest,
  GalleryResult,
  GalleryImage,
} from "./provider";

/**
 * Adaptador HTTP padrão do serviço externo de scraping (PRD D-06).
 * Configuração via secrets: MAPS_SCRAPER_URL + MAPS_SCRAPER_API_KEY.
 * Lidas dentro de fetchGallery — nunca no escopo de módulo.
 */
const DEFAULT_TIMEOUT_MS = 15000;

type ProviderFetch = typeof fetch;

export class HttpMapsGalleryProvider implements MapsGalleryProvider {
  readonly id = "http-default";
  private readonly fetchImpl: ProviderFetch;
  private readonly timeoutMs: number;

  constructor(options: { fetchImpl?: ProviderFetch; timeoutMs?: number } = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private config(): { url: string; apiKey: string } {
    const url = process.env["MAPS_SCRAPER_URL"];
    const apiKey = process.env["MAPS_SCRAPER_API_KEY"];
    if (!url || !apiKey) {
      throw new ScraperConfigError(
        "Serviço de coleta do Google Maps não configurado. Use o upload manual de imagens.",
      );
    }
    return { url, apiKey };
  }

  async fetchGallery(request: GalleryRequest): Promise<GalleryResult> {
    const { url, apiKey } = this.config();
    const body: Record<string, string> = {};
    if (request.mapsUrl?.trim()) body["maps_url"] = request.mapsUrl.trim();
    if (request.name?.trim()) body["name"] = request.name.trim();
    if (request.city?.trim()) body["city"] = request.city.trim();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      throw new ScraperUnavailableError(
        aborted
          ? "O serviço de coleta demorou demais para responder"
          : "Falha ao contactar o serviço de coleta",
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new ScraperUnavailableError(
        `O serviço de coleta respondeu ${response.status}. Tente o upload manual das imagens.`,
      );
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new ScraperUnavailableError("Resposta inválida do serviço de coleta");
    }

    const images = normalizeImages(parsed);
    if (images.length === 0) {
      throw new ScraperUnavailableError(
        "Nenhuma foto de cardápio encontrada na galeria deste local",
      );
    }
    return { images };
  }
}

/** Tolerante ao formato do fornecedor: {images:[{url,taken_at|takenAt}]} ou [{url,...}]. */
export function normalizeImages(parsed: unknown): GalleryImage[] {
  const list =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { images?: unknown[] }).images)
      ? (parsed as { images: unknown[] }).images
      : Array.isArray(parsed)
        ? parsed
        : [];
  const out: GalleryImage[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const url = typeof rec["url"] === "string" ? rec["url"] : undefined;
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const taken =
      typeof rec["taken_at"] === "string"
        ? rec["taken_at"]
        : typeof rec["takenAt"] === "string"
          ? rec["takenAt"]
          : null;
    out.push({ url, takenAt: taken });
  }
  return out;
}
