import { describe, expect, it, afterEach } from "vitest";
import { HttpMapsGalleryProvider, normalizeImages } from "./http-provider";
import { ScraperConfigError, ScraperUnavailableError, validateGalleryRequest } from "./provider";

const JSON_HEADERS = { "Content-Type": "application/json" };

describe("validação de entrada da coleta", () => {
  it("aceita link do Maps ou nome", () => {
    expect(() => validateGalleryRequest({ mapsUrl: "https://maps.app.goo.gl/x" })).not.toThrow();
    expect(() => validateGalleryRequest({ name: "Bar do Zé", city: "São Paulo" })).not.toThrow();
  });
  it("rejeita chamada sem nada", () => {
    expect(() => validateGalleryRequest({})).toThrow(ScraperUnavailableError);
  });
});

describe("HttpMapsGalleryProvider", () => {
  const ENV_BACKUP = { ...process.env };

  afterEach(() => {
    process.env["MAPS_SCRAPER_URL"] = ENV_BACKUP["MAPS_SCRAPER_URL"];
    process.env["MAPS_SCRAPER_API_KEY"] = ENV_BACKUP["MAPS_SCRAPER_API_KEY"];
  });

  function withoutScraperEnv() {
    delete process.env["MAPS_SCRAPER_URL"];
    delete process.env["MAPS_SCRAPER_API_KEY"];
  }

  it("sem chave configurada: erro acionável de configuração (upload manual é o caminho)", async () => {
    withoutScraperEnv();
    const provider = new HttpMapsGalleryProvider();
    await expect(provider.fetchGallery({ name: "Bar do Zé" })).rejects.toBeInstanceOf(
      ScraperConfigError,
    );
  });

  it("mapear erro 5xx do fornecedor como indisponibilidade", async () => {
    process.env["MAPS_SCRAPER_URL"] = "https://scraper.example/api";
    process.env["MAPS_SCRAPER_API_KEY"] = "k-test";
    const provider = new HttpMapsGalleryProvider({
      fetchImpl: (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch,
    });
    await expect(provider.fetchGallery({ name: "Bar do Zé" })).rejects.toBeInstanceOf(
      ScraperUnavailableError,
    );
  });

  it("normaliza resposta do fornecedor (images[].url + taken_at)", async () => {
    process.env["MAPS_SCRAPER_URL"] = "https://scraper.example/api";
    process.env["MAPS_SCRAPER_API_KEY"] = "k-test";
    const provider = new HttpMapsGalleryProvider({
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            images: [
              { url: "https://img.example/1.jpg", taken_at: "2024-03-01" },
              { url: "not-a-url" },
            ],
          }),
          { status: 200, headers: JSON_HEADERS },
        )) as unknown as typeof fetch,
    });
    const result = await provider.fetchGallery({ name: "Bar do Zé" });
    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.url).toBe("https://img.example/1.jpg");
    expect(result.images[0]?.takenAt).toBe("2024-03-01");
  });

  it("galeria vazia vira indisponibilidade", async () => {
    process.env["MAPS_SCRAPER_URL"] = "https://scraper.example/api";
    process.env["MAPS_SCRAPER_API_KEY"] = "k-test";
    const provider = new HttpMapsGalleryProvider({
      fetchImpl: (async () =>
        new Response(JSON.stringify({ images: [] }), {
          status: 200,
          headers: JSON_HEADERS,
        })) as unknown as typeof fetch,
    });
    await expect(provider.fetchGallery({ name: "Bar do Zé" })).rejects.toBeInstanceOf(
      ScraperUnavailableError,
    );
  });
});

describe("normalizeImages", () => {
  it("descarta URLs inválidas e aceita formatos alternativos", () => {
    expect(
      normalizeImages([{ url: "https://a/x.jpg", takenAt: "2024-01-01" }, { url: "x" }, null]),
    ).toEqual([{ url: "https://a/x.jpg", takenAt: "2024-01-01" }]);
  });
});
