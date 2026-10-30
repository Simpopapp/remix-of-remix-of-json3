import { createOpenAI } from "@ai-sdk/openai";
import { createLovableAiGatewayRunIdFetch } from "./run-id";

/**
 * Provider do Lovable AI Gateway (PRD D-04). Chamado por request: a chave é
 * lida dentro da função, nunca no escopo de módulo e nunca no browser.
 */
export function createVisionGateway() {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("IA não configurada neste projeto (LOVABLE_API_KEY ausente)");
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const openai = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  return { model: openai.responses("openai/gpt-6-astra"), runIdFetch };
}

/** 429/5xx são as únicas falhas re-tentáveis (ai-gateway-error-semantics). */
export function isRetryableGatewayError(error: unknown): boolean {
  const status = (error as { statusCode?: number } | null)?.statusCode;
  if (typeof status !== "number") return false;
  return status === 429 || (status >= 500 && status < 600);
}

/** Mensagem segura para exibir ao usuário (sem detalhes internos). */
export function safeGatewayMessage(error: unknown): string {
  const status = (error as { statusCode?: number } | null)?.statusCode;
  const message = error instanceof Error ? error.message : String(error);
  if (status === 402) return "Limite de uso da IA atingido. Tente novamente mais tarde.";
  if (status === 403 || status === 401) return "Acesso à IA recusado para este projeto.";
  if (status === 404) return "Serviço de leitura de imagens indisponível no momento.";
  return message.slice(0, 200) || "Falha desconhecida na leitura da imagem";
}
