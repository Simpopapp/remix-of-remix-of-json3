# prd-project1-s3-consolidacao — o COMO do pacote consolidação

## Contexto técnico
- TanStack Start: `createServerFn` + `.middleware([requireSupabaseAuth])` (client autenticado em `context.supabase`, RLS como o usuário). Runtime workerd: sem Node APIs.
- Tipos: `src/server/contracts/types.ts` (MenuItemRow, MenuCandidate). Tabela `menu_items`: ver `drizzle/migrations/0000_mapsmenu_core_tables.sql` / `src/integrations/supabase/types.ts`.
- Pacote s2 (visão) cria um item por leitura; itens repetidos entre fotos existem em paralelo.

## Núcleo puro (`consolidate.ts`) — testável sem banco
`export function consolidateItems(items: MenuItemRow[]): { survivors: MenuItemRow[]; deactivatedIds: string[] }`
Regras (PRD central D-08):
1. Normalização: lowercase, remover acentos, pontuação e espaços extras (ex.: "Café  Latte" ≡ "cafe latte").
2. Chave de agrupamento: mesmo `category` normalizado + nome normalizado igual OU nome normalizado com jaccard de tokens ≥ 0.8 E mesma categoria E preços compatíveis (iguais ou um deles null).
3. Sobrevivente do grupo: item com preço não-null mais recente (maior `created_at`); campos null do sobrevivente podem ser completados por campos não-null de irmãos (descrição, variações) — preço só se o sobrevivente era null.
4. `source_image_ids` do sobrevivente = união de todos os ids do grupo (+ o próprio `source_image_id`).
5. Irmãos não-sobreviventes: `is_active=false` (soft delete) — nunca DELETE físico (histórico/edição).
6. `confidence` do sobrevivente prevalece; onde foi completado por irmão, herde a confiança do campo do irmão se a do sobrevivente for 'baixa'.

## Server function (`consolidate.functions.ts`)
- Carrega `menu_items` do restaurante (`is_active=true`), roda o núcleo, persiste updates (survivors + irmãos `is_active=false`). Idempotente: rodar 2x não muda nada (grupos já fundidos não re-fundem com dano — teste disso).
- NÃO muda `restaurants.status` (o pipeline do agente principal cuida da transição).

## Fases + aceite
1. Núcleo puro + testes: funde duplicado exato, funda por jaccard com preço compatível, NÃO funde itens distintos parecidos ("X frango" vs "X frango grelhado" com preços diferentes), completa campos null, provando `source_image_ids`.
2. Server fn: build verde; idempotência provada por teste (rodar núcleo 2x sobre a saída).

## Proibições
- Sem dependências novas (implemente jaccard à mão); sem `supabaseAdmin`; sem tocar em rotas/UI; não pergunte ao usuário — decida e registre.
- Testes co-localizados (`*.test.ts`) rodam com `bunx vitest run src/server/pipeline`.

## Registro de decisões
(vazio — preencher numerado)
