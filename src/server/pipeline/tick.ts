import type { SupabaseClient } from "@supabase/supabase-js";
import { canTransition } from "@/server/contracts/pipeline";
import type { RestaurantRow } from "@/server/contracts/types";
import { consolidateCore } from "./consolidate.functions";
import { readImageCore } from "@/server/vision/read-image";

/**
 * Tick do pipeline (PRD D-09): avança UM restaurante UMA etapa por chamada.
 * Idempotente e compatível com workers stateless — o cliente polla e chama o tick.
 */
export type TickContext = { supabase: SupabaseClient; userId: string };

async function updateStatus(ctx: TickContext, restaurantId: string, status: string, detail: string | null) {
  await ctx.supabase
    .from("restaurants")
    .update({ status, status_detail: detail, updated_at: new Date().toISOString() })
    .eq("id", restaurantId);
}

async function failRestaurant(ctx: TickContext, restaurantId: string, message: string) {
  await updateStatus(ctx, restaurantId, "erro", message);
}

export async function advanceOneRestaurant(
  ctx: TickContext,
  restaurantId: string,
): Promise<{ id: string; status: string; detail: string | null }> {
  const { supabase } = ctx;
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", restaurantId)
    .maybeSingle();
  if (!restaurant) throw new Error("Restaurante não encontrado");
  const row = restaurant as RestaurantRow;

  if (row.status === "coletando") {
    const { count } = await supabase
      .from("source_images")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", row.id);
    if ((count ?? 0) > 0) {
      if (canTransition(row.status, "lendo")) {
        await updateStatus(ctx, row.id, "lendo", null);
        return { id: row.id, status: "lendo", detail: null };
      }
      return { id: row.id, status: row.status, detail: row.status_detail };
    }
    // sem imagens: tenta coletar do Maps (define 'lendo' ou 'erro' acionável)
    const { collectCore } = await import("@/server/images/images.core");
    await collectCore(ctx, row.id);
    const { data: after } = await supabase
      .from("restaurants")
      .select("status, status_detail")
      .eq("id", row.id)
      .single();
    return { id: row.id, status: after?.status ?? "erro", detail: after?.status_detail ?? null };
  }

  if (row.status === "lendo") {
    // lê até 2 imagens pendentes por tick (respeita rate-limit do gateway)
    const { data: pending } = await supabase
      .from("source_images")
      .select("id")
      .eq("restaurant_id", row.id)
      .in("read_status", ["pending", "failed"])
      .order("created_at", { ascending: true })
      .limit(2);
    for (const image of pending ?? []) {
      try {
        await readImageCore(ctx, image.id);
      } catch {
        await supabase.from("source_images").update({ read_status: "failed" }).eq("id", image.id);
      }
    }
    const { data: remaining } = await supabase
      .from("source_images")
      .select("read_status")
      .eq("restaurant_id", row.id);
    const stillPending = (remaining ?? []).some((i) => i.read_status === "pending" || i.read_status === "reading");
    if (stillPending) return { id: row.id, status: "lendo", detail: null };

    const anyMenu = (remaining ?? []).some((i) => i.read_status === "read");
    if (!anyMenu) {
      await failRestaurant(ctx, row.id, "Nenhuma foto de cardápio válida encontrada. Tente o upload manual.");
      return { id: row.id, status: "erro", detail: "Nenhuma foto de cardápio válida encontrada" };
    }
    if (canTransition(row.status, "consolidando")) {
      await updateStatus(ctx, row.id, "consolidando", null);
      await consolidateCore(ctx, row.id);
      await updateStatus(ctx, row.id, "aguardando_revisao", null);
    }
    return { id: row.id, status: "aguardando_revisao", detail: null };
  }

  return { id: row.id, status: row.status, detail: row.status_detail };
}

