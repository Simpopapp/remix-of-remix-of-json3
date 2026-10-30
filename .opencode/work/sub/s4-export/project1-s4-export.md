# project1-s4-export — planejamento do subagente

**Missão:** gerar o cardápio revisado como JSON (esquema provisório do PRD central, até INPUT-1) e CSV plano, para download no browser (Fase 6 central).

**Escopo (dono exclusivo):** `src/server/export/json.ts`, `src/server/export/csv.ts` (geradores puros), `src/server/export/export.functions.ts` (server fn que carrega dados e devolve os dois formatos), `src/server/export/*.test.ts`.

**Fora do escopo:** visão, consolidação, coleta, rotas/UI, migrations, botões de download (agente principal integra). Não editar pilares nem arquivos de outros pacotes.

**Fronteiras:** consome `restaurants` + `menu_items` (`is_active=true`) + `source_images` (para origem). Entrega: `exportMenuJson = createServerFn(...).inputValidator({ restaurantId }).handler(...)` → objeto `ExportedMenu` (tipo em contracts/types.ts) e `exportMenuCsv` → string CSV.

## Decisões (PRD central D-10)
- JSON no esquema provisório: `{ restaurante: { nome, cidade, maps_url, gerado_em }, categorias: [{ nome, itens: [{ nome, descricao, preco, moeda, variacoes, a_validar, data_preco, origem_imagens }] }] }` — `a_validar = needs_validation`, `data_preco = price_date`, `origem_imagens = source_image_ids`. Itens `is_active=false` NUNCA saem.
- CSV: cabeçalho `categoria,nome,descricao,preco,moeda,variacoes,a_validar,data_preco` ; variacoes serializadas `tipo:nome:preco|...`; separador vírgula; escaping com aspas duplas quando houver vírgula/aspas/quebra.
- Geradores puros recebem tipos de `contracts/types.ts` e NÃO falam com o banco (testes rápidos sem mock de rede).

## Aceite
1. Teste: itens inativos não aparecem no JSON nem no CSV.
2. Teste: escaping correto do CSV com nome contendo vírgula e aspas.
3. Teste: JSON bate com o tipo `ExportedMenu` (campos presentes, origem_imagens preservada).
4. Server fns: build verde.

## Proibições
- Sem dependências novas; sem `supabaseAdmin`; sem tocar rotas/UI; não pergunte ao usuário.

## Registro de decisões
(vazio — preencher numerado)
