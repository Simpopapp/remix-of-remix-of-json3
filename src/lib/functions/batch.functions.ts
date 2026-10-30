import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RestaurantInsert, RestaurantRow } from "@/lib/contracts/types";
import { PIPELINE_ORDER } from "@/lib/contracts/pipeline";

/**
 * Processamento em lote (PRD D-09/RD-03): colar uma lista de links/nomes cria
 * N restaurantes com o mesmo batch_id; o tick avança poucos por chamada.
 */
const MAX_LINES = 50;

function parseLine(line: string): { mapsUrl?: string; name?: string; city?: string } {
  const trimmed = line.trim();
  if (!trimmed) return {};
  if (/^https?:\/\//i.test(trimmed)) return { mapsUrl: trimmed };
  // "Nome - Cidade" ou "Nome, Cidade"
  const sep = trimmed.includes(" - ") ? " - " : trimmed.includes(", ") ? ", " : null;
  const parsed: { mapsUrl?: string; name?: string; city?: string } = {};
  if (sep) {
    const [name, city] = trimmed.split(sep);
    const cleanName = name?.trim();
    const cleanCity = city?.trim();
    if (cleanName) parsed.name = cleanName;
    if (cleanCity) parsed.city = cleanCity;
  } else {
    parsed.name = trimmed;
  }
  return parsed;
}

export const createBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { lines: string[] }) => input)
  .handler(async ({ data, context }) => {
    const lines = data.lines.map((l) => l.trim()).filter(Boolean).slice(0, MAX_LINES);
    if (lines.length === 0) throw new Error("Cole ao menos um link ou nome de restaurante");

    const batchId = crypto.randomUUID();
    const inserts: RestaurantInsert[] = [];
    for (const line of lines) {
      const parsed = parseLine(line);
      if (!parsed.mapsUrl && !parsed.name) continue;
      inserts.push({
        owner_id: context.userId,
        name: parsed.name || "Restaurante",
        city: parsed.city || null,
        maps_url: parsed.mapsUrl || null,
        status: "coletando",
        batch_id: batchId,
      });
    }
    if (inserts.length === 0) throw new Error("Nenhuma linha válida na lista");

    const { data: rows, error } = await context.supabase
      .from("restaurants")
      .insert(inserts)
      .select();
    if (error) throw new Error(error.message);
    return { batchId, created: (rows ?? []) as RestaurantRow[] };
  });

/** Avança até `limit` restaurantes do lote por chamada (fila sequencial). */
export const advanceBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { batchId: string; limit?: number }) => input)
  .handler(async ({ data, context }) => {
    const { advanceOneRestaurant } = await import("@/server/pipeline/tick");
    const limit = Math.min(Math.max(data.limit ?? 3, 1), 10);
    const { data: rows, error } = await context.supabase
      .from("restaurants")
      .select("id, status")
      .eq("batch_id", data.batchId);
    if (error) throw new Error(error.message);

    const active = (rows ?? []).filter((r) =>
      (PIPELINE_ORDER as readonly string[]).includes(r.status),
    );
    const results: Array<{ id: string; status: string; detail: string | null }> = [];
    for (const row of active.slice(0, limit)) {
      results.push(await advanceOneRestaurant(context, row.id));
    }
    return { advanced: results.length, results };
  });
