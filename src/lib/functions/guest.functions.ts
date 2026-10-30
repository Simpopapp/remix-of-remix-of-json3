import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Public processing accepts only the caller's image, never private database IDs.
export const readGuestImage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ image: z.string().max(14_000_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/) }).parse(input))
  .handler(async ({ data }) => {
    const { streamText, Output } = await import("ai");
    const { createVisionGateway } = await import("@/server/vision/gateway");
    const { MENU_READ_INSTRUCTIONS, imageReadSchema, toImageReadResult } = await import("@/server/vision/schema");
    const { model } = createVisionGateway();
    const result = streamText({ model, instructions: MENU_READ_INSTRUCTIONS,
      messages: [{ role: "user", content: [{ type: "image", image: new URL(data.image) }, { type: "text", text: "Leia esta foto de cardápio." }] }],
      output: Output.object({ schema: imageReadSchema }),
      providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
    });
    try { return toImageReadResult(await result.output); }
    catch (error) {
      const { safeGatewayMessage } = await import("@/server/vision/gateway");
      throw new Error(safeGatewayMessage(error));
    }
  });

export const collectGuestGallery = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ mapsUrl: z.string().max(2048).optional(), name: z.string().max(300).optional(), city: z.string().max(300).optional() }).parse(input))
  .handler(async ({ data }) => {
    const { fetchGallery } = await import("@/server/scraping/index");
    return fetchGallery(data);
  });