import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ExportedMenu, MenuItemRow } from "@/lib/contracts/types";

/** Exportação do cardápio revisado (PRD D-10). RLS como o usuário. */

async function loadRestaurantAndItems(context: {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  userId: string;
}, restaurantId: string) {
  const { data: restaurant, error } = await context.supabase
    .from("restaurants")
    .select("id, name, city, maps_url, owner_id")
    .eq("id", restaurantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!restaurant) throw new Error("Restaurante não encontrado");
  const { data: items, error: itemsError } = await context.supabase
    .from("menu_items")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .order("category", { ascending: true });
  if (itemsError) throw new Error(itemsError.message);
  return { restaurant, items: (items ?? []) as MenuItemRow[] };
}

export const exportMenuJson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string }) => input)
  .handler(async ({ data, context }): Promise<ExportedMenu> => {
    const { buildExportedMenu } = await import("@/server/export/json");
    const { restaurant, items } = await loadRestaurantAndItems(context, data.restaurantId);
    return buildExportedMenu(restaurant, items);
  });

export const exportMenuCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string }) => input)
  .handler(async ({ data, context }): Promise<string> => {
    const { buildExportedMenu } = await import("@/server/export/json");
    const { restaurant, items } = await loadRestaurantAndItems(context, data.restaurantId);
    const { menuToCsv } = await import("@/server/export/csv");
    return menuToCsv(buildExportedMenu(restaurant, items));
  });
