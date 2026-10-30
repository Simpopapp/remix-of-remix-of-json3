import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const advanceRestaurant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string }) => input)
  .handler(async ({ data, context }) => {
    const { advanceOneRestaurant } = await import("@/server/pipeline/tick");
    return advanceOneRestaurant(context, data.restaurantId);
  });
