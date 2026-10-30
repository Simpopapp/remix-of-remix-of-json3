import { MapsGalleryProvider, validateGalleryRequest } from "./provider";
import { HttpMapsGalleryProvider } from "./http-provider";

/**
 * Seleção do fornecedor de galeria do Maps (PRD D-06).
 * Trocar de fornecedor = trocar AQUI somente.
 */
export function getGalleryProvider(): MapsGalleryProvider {
  return new HttpMapsGalleryProvider();
}

export async function fetchGallery(request: Parameters<MapsGalleryProvider["fetchGallery"]>[0]) {
  validateGalleryRequest(request);
  const provider = getGalleryProvider();
  return provider.fetchGallery(request);
}

export {
  MapsGalleryProvider,
  ScraperConfigError,
  ScraperUnavailableError,
  validateGalleryRequest,
} from "./provider";
