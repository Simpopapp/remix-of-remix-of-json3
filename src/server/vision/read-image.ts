import { createServerFn } from "@tanstack/react-start";
import { Output, streamText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MENU_IMAGES_BUCKET } from "@/server/contracts/types";
import {
  MENU_READ_INSTRUCTIONS,
  arrayBufferToBase64,
  imageReadSchema,
  parseMenuDate,
  toImageReadResult,
} from "./schema";
import { createVisionGateway, isRetryableGatewayError, safeGatewayMessage } from "./gateway";

/** Núcleo de leitura de UMA imagem (PRD D-04/D-05/D-12). Idempotente. Usado pela server fn e pelo tick. */
export type PipelineContext = { supabase: SupabaseClient; userId: string };

export type ReadOutcome = {
  status: "read" | "skipped" | "failed" | string;
  itemsCreated: number;
  reason: string | null;
};

export async function readImageCore(ctx: PipelineContext, imageId: string): Promise<ReadOutcome> {
  const { supabase } = ctx;

  const { data: image } = await supabase
    .from("source_images")
    .select("id, restaurant_id, storage_path, read_status, taken_at")
    .eq("id", imageId)
    .maybeSingle();
  if (!image) throw new Error("Imagem não encontrada");
  const target = image as {
    id: string;
    restaurant_id: string;
    storage_path: string;
    read_status: string;
    taken_at: string | null;
  };

  if (target.read_status !== "pending" && target.read_status !== "failed") {
    return { status: target.read_status, itemsCreated: 0, reason: "Imagem já processada" };
  }

  async function failWith(reason: string): Promise<ReadOutcome> {
    await supabase.from("source_images").update({ read_status: "failed" }).eq("id", target.id);
    return { status: "failed", itemsCreated: 0, reason };
  }

  // 1. Baixa a imagem do bucket (referência estável, PRD D-07).
  const { data: blob, error: downloadError } = await supabase.storage
    .from(MENU_IMAGES_BUCKET)
    .download(target.storage_path);
  if (downloadError || !blob) {
    return failWith("Não foi possível abrir a imagem armazenada");
  }
  const bytes = await blob.arrayBuffer();
  const base64 = arrayBufferToBase64(bytes);
  const mediaType = blob.type?.startsWith("image/") ? blob.type : "image/jpeg";

  // 2. Leitura pelo modelo (1 request; retry curto só para 429/5xx).
  let text: string | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { model } = createVisionGateway();
      const result = streamText({
        model,
        system: MENU_READ_INSTRUCTIONS,
        messages: [
          {
            role: "user",
            content: [
              { type: "image" as const, image: new Uint8Array(bytes), mediaType },
              { type: "text" as const, text: "Leia esta foto e responda exatamente no formato definido." },
            ],
          },
        ],
        output: Output.object({ schema: imageReadSchema }),
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "low",
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
      });
      text = await result.text;
      lastError = null;
      break;
    } catch (e) {
      lastError = e;
      if (!isRetryableGatewayError(e)) break;
    }
  }
  if (text === null) {
    return failWith(safeGatewayMessage(lastError));
  }

  // 3. Validação estrita da resposta.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return failWith("O modelo respondeu fora do formato combinado");
  }
  const check = imageReadSchema.safeParse(parsed);
  if (!check.success) {
    return failWith("O modelo respondeu fora do formato combinado");
  }
  const result = toImageReadResult(check.data);

  // 4. Persistência: descarte de não-cardápio ou criação de itens.
  if (!result.e_cardapio) {
    await supabase
      .from("source_images")
      .update({ read_status: "skipped", is_menu: false })
      .eq("id", target.id);
    return {
      status: "skipped",
      itemsCreated: 0,
      reason: result.motivo_descarte ?? "Foto não é de cardápio",
    };
  }

  const priceDate = result.data_da_foto ?? parseMenuDate(target.taken_at);
  const rows = result.itens.map((item) => ({
    restaurant_id: target.restaurant_id,
    owner_id: ctx.userId,
    source_image_id: target.id,
    source_image_ids: [target.id],
    category: item.categoria,
    name: item.nome,
    description: item.descricao,
    price: item.preco,
    currency: item.moeda,
    variations: item.variacoes,
    confidence: item.confianca,
    needs_validation: true,
    price_date: priceDate,
  }));
  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("menu_items").insert(rows);
    if (insertError) return failWith("Não foi possível salvar os itens lidos");
  }
  await supabase
    .from("source_images")
    .update({ read_status: "read", is_menu: true })
    .eq("id", target.id);
  return { status: "read", itemsCreated: rows.length, reason: null };
}

export const readOneImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { imageId: string }) => input)
  .handler(async ({ data, context }) => readImageCore(context, data.imageId));
