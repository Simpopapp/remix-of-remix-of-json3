import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RestaurantInsert, RestaurantRow } from "@/lib/contracts/types";

/** Server functions de restaurantes (coleta, listagem, status). RLS como o usuário. */

export const createRestaurant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { mapsUrl?: string; name?: string; city?: string; batchId?: string }) => input,
  )
  .handler(async ({ data, context }): Promise<RestaurantRow> => {
    const mapsUrl = data.mapsUrl?.trim() || null;
    const name = data.name?.trim();
    if (!mapsUrl && !name) {
      throw new Error("Informe o link do Maps ou o nome do restaurante");
    }
    if (mapsUrl && !/^https?:\/\//i.test(mapsUrl)) {
      throw new Error("O link do Maps deve ser uma URL http(s)");
    }
    const insert: RestaurantInsert = {
      owner_id: context.userId,
      name: name || "Restaurante",
      city: data.city?.trim() || null,
      maps_url: mapsUrl,
      status: "coletando",
      batch_id: data.batchId || null,
    };
    const { data: row, error } = await context.supabase
      .from("restaurants")
      .insert(insert)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listRestaurants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("restaurants")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as RestaurantRow[];
  });

export const getRestaurant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("restaurants")
      .select("*")
      .eq("id", data.restaurantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as RestaurantRow | null) ?? null;
  });
