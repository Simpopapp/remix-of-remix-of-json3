import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SourceImageRow } from "@/lib/contracts/types";

export const collectFromMaps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string }) => input)
  .handler(async ({ data, context }) => {
    const { collectCore } = await import("@/server/images/images.core");
    return collectCore(context, data.restaurantId);
  });

export const registerUploadedImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { restaurantId: string; storagePath: string; takenAt?: string | null }) => input,
  )
  .handler(async ({ data, context }): Promise<SourceImageRow> => {
    if (!data.storagePath || !data.storagePath.startsWith(`${context.userId}/`)) {
      throw new Error("Caminho de armazenamento inválido");
    }
    const { data: row, error } = await context.supabase
      .from("source_images")
      .insert({
        restaurant_id: data.restaurantId,
        owner_id: context.userId,
        source: "upload",
        storage_path: data.storagePath,
        taken_at: data.takenAt || null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listSourceImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("source_images")
      .select("*")
      .eq("restaurant_id", data.restaurantId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as SourceImageRow[];
  });
