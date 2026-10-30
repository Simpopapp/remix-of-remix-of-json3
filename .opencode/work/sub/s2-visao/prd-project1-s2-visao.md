# prd-project1-s2-visao — o COMO do pacote visão

## Contexto técnico (confirmado no ambiente)
- Stack: TanStack Start v1, server functions `createServerFn` de `@tanstack/react-start` (NÃO Supabase Edge Functions). Runtime de publicação é workerd: sem APIs Node-only; use `fetch` nativo.
- Auth: use `.middleware([requireSupabaseAuth])` (de `@/integrations/supabase/auth-middleware`); em `context.supabase` há um client autenticado (RLS como o usuário) e `context.userId`. Middleware de bearer já registrado em `src/start.ts`.
- Pacotes já instalados: `ai`, `@ai-sdk/openai`, `zod`, `@supabase/supabase-js`.
- Tabelas/campos: ver `src/server/contracts/types.ts` (MenuCandidate, ImageReadResult, ConfidenceMap) e a migration `drizzle/migrations/0000_mapsmenu_core_tables.sql`. Bucket: `menu-images` (constante MENU_IMAGES_BUCKET em contracts/types.ts).

## Contratos
- **Consome** (de s1-coleta): row `source_images` com `storage_path` (path no bucket, prefixo `${owner_id}/...`), `read_status='pending'`, `restaurant_id`, `owner_id`.
- **Produz**: para a imagem lida — `source_images`: `read_status` ('read'|'skipped'|'failed'), `is_menu` (false quando não-cardápio), `taken_at` (date, quando o modelo indicar). Para cardápio: rows em `menu_items` com `source_image_id`, `source_image_ids=[id]`, `category`, `name`, `description`, `price` (numeric null), `currency`, `variations` (jsonb: [{tipo:"tamanho"|"adicional", nome, preco}]), `confidence` (jsonb {campo:"alta"|"baixa"}), `needs_validation=true` (todo preço), `price_date` (= data da foto quando houver).
- **Assinatura exportada** de `read-image.ts`: `export const readOneImage = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(...{ imageId: string }...).handler(...)` → `{ status: 'read'|'skipped'|'failed', itemsCreated: number, reason?: string }`. Idempotente: se `read_status` não for 'pending', retorna sem reprocessar.

## Decisões técnicas (PRD central D-04/D-05/D-12 — siga exatamente)
1. Modelo: `openai/gpt-6-astra` via `@ai-sdk/openai` `createOpenAI({ baseURL: 'https://ai.gateway.lovable.dev/v1', apiKey: process.env['LOVABLE_API_KEY'], headers: { 'X-Lovable-AIG-SDK': 'vercel-ai-sdk' } }).responses('openai/gpt-6-astra')`.
2. `LOVABLE_API_KEY` lido DENTRO do handler (nunca no escopo de módulo, nunca VITE_).
3. Sempre `streamText` (nunca generateText/generateObject). Consome `await result.text` server-side.
4. `providerOptions.openai` OBRIGATÓRIO em toda call: `{ forceReasoning: true, reasoningEffort: 'low', reasoningSummary: 'auto', store: false, include: ['reasoning.encrypted_content'] }`.
5. Imagem: part `image_url` com data URL (`data:image/jpeg;base64,...`) construído dos bytes baixados do bucket (`context.supabase.storage.from(MENU_IMAGES_BUCKET).download(storage_path)` → Blob → arrayBuffer → base64). Uma imagem por request.
6. Saída estrita: `text.format` tipo `json_schema` (via `experimental_output`? NÃO — use `Output` de `ai` com `text: { format: { type: 'json_schema', name, schema } }` no streamText) — raiz objeto, todas as propriedades required, opcionais como nullable, `additionalProperties: false`. Valide com zod depois; parse falhou → status 'failed' com reason.
7. Erros do gateway: 429/5xx = retry com backoff curto (máx 2 tentativas); 402/403/404/401 = terminal — status 'failed' com a mensagem segura da resposta. Nunca troque de modelo nem endpoint.

## Regras do prompt do modelo (vinculam)
- "Você lê UMA foto. Se não for cardápio (prato, fachada, ambiente, people), responda e_cardapio=false + motivo." 
- "Nunca invente preço ou nome: campo não legível (borrado/cortado/ambíguo) = null + confianca[campo]='baixa'." 
- "Preço: número sem moeda; moeda='BRL' por padrão. data_da_foto só se visível na foto (yyyy-mm-dd), senão null." 
- "variacoes: tamanhos/adicionais como {tipo, nome, preco|null}." 

## Fases do pacote (escopo + aceite)
1. `schema.ts`: json_schema + zod + normalizador de MenuCandidate (trim, categoria default 'Outros', preço numérico) — testes com 3 fixtures (cardápio válido, não-cardápio, campos incertos) verdes.
2. `gateway.ts`: helper do provider + run-id fetch wrapper (crie o fetch wrapper dentro do request; never mint run id — use createLovableAiGatewayRunIdFetch conforme knowledge, copie o padrão).
3. `read-image.ts`: server fn completa (download → leitura → persistência) — gate: chamada com imagem inexistente falha com erro claro; imagem 'read' retorna idempotente.
4. Testes: parser/normalizador cobrem "não inventa" (campo ilegível → null + baixa) e descarte de não-cardápio.

## Proibições
- Não editar arquivos fora da lista de dono; não rodar migrations; não adicionar dependências novas (as necessárias já estão); não chamar o usuário.
- Não usar `supabaseAdmin` — tudo pelo `context.supabase` (RLS).
- Teste ao vivo com o gateway SÓ se houver imagem de cardápio disponível; caso contrário valide o contrato por testes unitários e declare no relatório o que ficou sem prova ao vivo.

## Registro de decisões (preencher numerado)
(vazio — o subagente preenche)
