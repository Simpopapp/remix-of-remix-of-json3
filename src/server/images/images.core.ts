import type { SupabaseClient } from "@supabase/supabase-js";
import { MENU_IMAGES_BUCKET, type SourceImageRow } from "@/server/contracts/types";
import { canTransition } from "@/server/contracts/pipeline";
import { fetchGallery, ScraperConfigError, ScraperUnavailableError } from "@/server/scraping";

/** Núcleo de coleta do Maps (PRD D-06/D-07): coleta galeria e espelha no bucket. */
export type CollectContext = { supabase: SupabaseClient; userId: string };

type ImageMeta = { url: string; takenAt?: string | null };

function guessExtension(url: string): string {
  const clean = url.split("?")[0] ?? "";
  const m = clean.match(/\.(jpe?g|png|webp|heic|gif)$/i);
  return (m?.[1] ?? "jpg").toLowerCase();
}

function guessContentType(ext: string): string {
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "heic":
      return "image/heic";
    default:
      return "image/jpeg";
  }
}

export async function collectCore(
  ctx: CollectContext,
  restaurantId: string,
): Promise<{ registered: number; failed: number; error: string | null }> {
  const { supabase } = ctx;

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, maps_url, name, city, status")
    .eq("id", restaurantId)
    .maybeSingle();
  if (!restaurant) throw new Error("Restaurante não encontrado");
  const target = restaurant as {
    id: string;
    maps_url: string | null;
    name: string;
    city: string | null;
    status: string;
  };

  async function fail(message: string) {
    await supabase
      .from("restaurants")
      .update({ status: "erro", status_detail: message, updated_at: new Date().toISOString() })
      .eq("id", target.id);
    return { registered: 0, failed: 0, error: message };
  }

  const request: Record<string, string> = {};
  if (target.maps_url) request["mapsUrl"] = target.maps_url;
  if (target.name && target.name !== "Restaurante") request["name"] = target.name;
  if (target.city) request["city"] = target.city;

  let gallery;
  try {
    gallery = await fetchGallery(request);
  } catch (e) {
    if (e instanceof ScraperConfigError) return fail(e.message);
    if (e instanceof ScraperUnavailableError) return fail(e.message);
    return fail("Não foi possível coletar imagens deste local");
  }

  let registered = 0;
  let failed = 0;
  for (const image of gallery.images.slice(0, 30)) {
    try {
      const res = await fetch(image.url);
      if (!res.ok) throw new Error(`fonte respondeu ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const ext = guessExtension(image.url);
      const path = `${ctx.userId}/${target.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(MENU_IMAGES_BUCKET)
        .upload(path, bytes, { contentType: guessContentType(ext) });
      if (upErr) throw upErr;
      const { error: rowErr } = await supabase.from("source_images").insert({
        restaurant_id: target.id,
        owner_id: ctx.userId,
        source: "scrape",
        external_url: image.url,
        storage_path: path,
        taken_at: image.takenAt || null,
      });
      if (rowErr) throw rowErr;
      registered += 1;
    } catch {
      failed += 1;
    }
  }

  if (registered === 0) {
    return fail("As fotos deste local não puderam ser armazenadas. Tente o upload manual das imagens.");
  }

  // Coleta concluída: avança para a leitura.
  if (canTransition(target.status as never, "lendo")) {
    await supabase
      .from("restaurants")
      .update({ status: "lendo", status_detail: null, updated_at: new Date().toISOString() })
      .eq("id", target.id);
  }
  return { registered, failed, error: null };
}

