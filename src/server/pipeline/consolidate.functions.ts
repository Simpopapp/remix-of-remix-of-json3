import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MenuItemRow } from "@/server/contracts/types";
import { consolidateItems } from "./consolidate";

/** Núcleo de consolidação de um restaurante (PRD D-08). Usado pela server fn e pelo tick. */
export type PipelineContext = { supabase: SupabaseClient; userId: string };

export async function consolidateCore(ctx: PipelineContext, restaurantId: string) {
  const { supabase } = ctx;

  const { data: items, error } = await supabase
    .from("menu_items")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  const rows = (items ?? []) as MenuItemRow[];
  if (rows.length === 0) return { merged: 0, deactivated: 0 };

  const { survivors, deactivatedIds, mergedCount } = consolidateItems(rows);

  let deactivated = 0;
  if (deactivatedIds.length > 0) {
    const { error: deactErr } = await supabase
      .from("menu_items")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in("id", deactivatedIds);
    if (deactErr) throw new Error(deactErr.message);
    deactivated = deactivatedIds.length;
  }

  const now = new Date().toISOString();
  for (const survivor of survivors) {
    const original = rows.find((r) => r.id === survivor.id)!;
    const changed =
      original.description !== survivor.description ||
      Number(original.price ?? NaN) !== Number(survivor.price ?? NaN) ||
      JSON.stringify(original.variations) !== JSON.stringify(survivor.variations) ||
      JSON.stringify(original.confidence) !== JSON.stringify(survivor.confidence) ||
      JSON.stringify(original.source_image_ids) !== JSON.stringify(survivor.source_image_ids);
    if (!changed) continue;
    const { error: upErr } = await supabase
      .from("menu_items")
      .update({
        description: survivor.description,
        price: survivor.price,
        variations: survivor.variations,
        confidence: survivor.confidence,
        source_image_ids: survivor.source_image_ids,
        updated_at: now,
      })
      .eq("id", survivor.id);
    if (upErr) throw new Error(upErr.message);
  }

  return { merged: mergedCount, deactivated };
}

/**
 * Server function de consolidação. NÃO muda o status do restaurante — a
 * transição é do pipeline (tick). Idempotente.
 */
export const consolidateRestaurant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string }) => input)
  .handler(async ({ data, context }) => consolidateCore(context, data.restaurantId));
