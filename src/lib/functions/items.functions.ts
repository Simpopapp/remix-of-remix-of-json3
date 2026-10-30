import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MenuItemRow, SourceImageRow } from "@/lib/contracts/types";

/** CRUD da tela de revisão (Fase 5). Toda edição grava em edit_history (PRD D-11). */

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string };

async function recordHistory(
  ctx: Ctx,
  restaurantId: string,
  itemId: string | null,
  action: string,
  payload: Record<string, unknown>,
) {
  await ctx.supabase.from("edit_history").insert({
    restaurant_id: restaurantId,
    item_id: itemId,
    owner_id: ctx.userId,
    action,
    payload,
  });
}

export const getReviewData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string }) => input)
  .handler(async ({ data, context }) => {
    const [{ data: restaurant }, { data: images }, { data: items }] = await Promise.all([
      context.supabase.from("restaurants").select("*").eq("id", data.restaurantId).maybeSingle(),
      context.supabase
        .from("source_images")
        .select("*")
        .eq("restaurant_id", data.restaurantId)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", data.restaurantId)
        .eq("is_active", true)
        .order("category", { ascending: true }),
    ]);
    if (!restaurant) throw new Error("Restaurante não encontrado");
    return {
      restaurant,
      images: (images ?? []) as SourceImageRow[],
      items: (items ?? []) as MenuItemRow[],
    };
  });

export const updateItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      itemId: string;
      restaurantId: string;
      patch: {
        name?: string;
        description?: string | null;
        price?: number | null;
        category?: string;
        currency?: string;
        variations?: Array<{ tipo: "tamanho" | "adicional"; nome: string; preco: number | null }>;
      };
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("menu_items")
      .select("id, restaurant_id")
      .eq("id", data.itemId)
      .maybeSingle();
    if (!existing) throw new Error("Item não encontrado");
    const patch = Object.fromEntries(
      Object.entries(data.patch).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("menu_items")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", data.itemId);
    if (error) throw new Error(error.message);
    const action = patch["category"] !== undefined && !("name" in patch) ? "move" : "update";
    await recordHistory(context, data.restaurantId, data.itemId, action, patch);
    return { ok: true };
  });

export const deleteItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { itemId: string; restaurantId: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("menu_items")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", data.itemId);
    if (error) throw new Error(error.message);
    await recordHistory(context, data.restaurantId, data.itemId, "delete", {});
    return { ok: true };
  });

export const mergeItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { survivorId: string; otherId: string; restaurantId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows } = await supabase
      .from("menu_items")
      .select("*")
      .in("id", [data.survivorId, data.otherId]);
    const survivor = (rows ?? []).find((r) => r.id === data.survivorId);
    const other = (rows ?? []).find((r) => r.id === data.otherId);
    if (!survivor || !other) throw new Error("Itens não encontrados");

    const provenance = new Set<string>([
      ...((survivor.source_image_ids ?? []) as string[]),
      ...((other.source_image_ids ?? []) as string[]),
      ...(survivor.source_image_id ? [survivor.source_image_id] : []),
      ...(other.source_image_id ? [other.source_image_id] : []),
    ]);
    const { error: upErr } = await supabase
      .from("menu_items")
      .update({
        source_image_ids: Array.from(provenance),
        description: survivor.description ?? other.description,
        price: survivor.price ?? other.price,
        price_date: survivor.price_date ?? other.price_date,
        updated_at: new Date().toISOString(),
      })
      .eq("id", survivor.id);
    if (upErr) throw new Error(upErr.message);
    const { error: deactErr } = await supabase
      .from("menu_items")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", other.id);
    if (deactErr) throw new Error(deactErr.message);
    await recordHistory(context, data.restaurantId, data.survivorId, "merge", {
      merged: data.otherId,
    });
    return { ok: true };
  });
