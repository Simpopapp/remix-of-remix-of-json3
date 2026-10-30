# PRD — prd-project1 (N = 1)

Projeto: **MapsMenu** — transformar um restaurante do Google Maps em um cardápio estruturado, revisável e exportável (JSON/CSV).

Fonte de escopo: `.opencode/project1.md` (planejamento, prioridade máxima no "o quê").
Este PRD define o **COMO**: decisões técnicas, arquitetura, escopo por fase e critérios de aceite.
Ambiente confirmado no código: template TanStack Start v1 **vazio** (apenas UI kit e rotas raiz), sem backend, sem rotas de aplicação. O backend é **Lovable Cloud** (Postgres + Auth + Storage), já habilitado. Toda chamada de IA sai pelo **Lovable AI Gateway**.

---

## 1. Objetivos e princípios

1. O usuário cola um link de local do Maps (ou nome + cidade) e o sistema produz um cardápio único, sem duplicatas, pronto para exportar.
2. Cada restaurante mostra um status visível de 4 etapas: `coletando` → `lendo` → `consolidando` → `aguardando_revisao` (+ `erro` e `concluido`).
3. A revisão humana é o coração: concentrada só no que o modelo marcou como duvidoso.
4. Nada é inventado: se o modelo não leu um campo, ele vem vazio e marcado incerto.
5. Processamento em lote: dezenas de locais alimentados sem ficar na tela.

Princípios técnicos (vinculam todas as fases):
- **P1** — Server functions `createServerFn` para lógica interna; rotas `src/routes/api/public/*` só para chamadas externas (não há webhook no escopo atual).
- **P2** — Segredos só no servidor (`process.env` dentro do handler); nunca `VITE_*`.
- **P3** — RLS owner-scoped em toda tabela de usuário; `GRANT` na mesma migration de cada `CREATE TABLE` (ordem: CREATE → GRANT → ENABLE RLS → POLICY).
- **P4** — O pipeline nunca roda em execução longa: cada etapa é um "tick" idempotente acionado por polling, pois as server functions rodam em workers stateless (workerd).
- **P5** — Fornecedores externos isolados atrás de interfaces; trocar fornecedor não toca no resto.
- **P6** — Qualidade verificada: cada fase tem gates executáveis (build, testes, Playwright quando couber).

## 2. Decisões técnicas

| # | Decisão | Justificativa |
|---|---------|---------------|
| D-01 | Backend = Lovable Cloud (Postgres, Auth, Storage). Migrations via ferramenta de banco; `GRANT` + RLS em toda tabela. | Persistência real, sem contas externas. |
| D-02 | Autenticação: **email/senha** (habilitar email auth antes de qualquer `signUp`) + **Google** (via `lovable.auth.signInWithOAuth`, redirect same-origin) + **Sign in com Lovable**. Página pública `/auth`; app protegido sob `src/routes/_authenticated/`. | Padrão Cloud; layout gerenciado `ssr:false` evita loop de sessão. |
| D-03 | Chamadas protegidas: `.middleware([requireSupabaseAuth])`; middleware de bearer já registrado em `src/start.ts` (manter o existente). | RLS como o usuário; sem admin para leituras comuns. |
| D-04 | Visão computacional: **Lovable AI Gateway**, modelo padrão de chat `openai/gpt-6-astra` em `/v1/responses` via AI SDK (`@ai-sdk/openai`, `streamText`), imagem como part `image_url` (HTTPS ou data URL). `LOVABLE_API_KEY` lida dentro do handler. | Contrato do gateway; imagem por request (1 imagem = 1 leitura, muito abaixo do teto de 50). |
| D-05 | Saída do modelo: `text.format` com **json_schema estrito** (raiz objeto, todas as propriedades required, opcionais nullable, `additionalProperties:false`), reasoning `low`. | Garantia de parse; sem JSON solto. |
| D-06 | Scraping do Maps isolado: interface `MapsGalleryProvider` (recebe link ou nome+cidade, devolve lista de URLs de imagem + data quando houver). Adaptador HTTP padrão lê `MAPS_SCRAPER_URL` + `MAPS_SCRAPER_API_KEY` de secrets. Sem chave configurada → etapa `coletando` termina com erro acionável e o fluxo de **upload manual** é o caminho. | Troca de fornecedor sem tocar no resto; planejamento exige. |
| D-07 | Imagens são espelhadas no bucket `menu-images` do Storage (owner-scoped): URLs de scrape são efêmeras; a revisão e o export precisam de referência estável. Upload manual entra no mesmo bucket. | Proveniência e estabilidade. |
| D-08 | Consolidação = server function que normaliza nomes/categorias, agrupa repetidos (similaridade em JS: normalização + comparação por token/jaccard), preserva proveniência (`source_image_ids`). | Determinístico e testável; sem extensão nova no banco. |
| D-09 | Fila em lote = estado no banco (`restaurants.batch_id`, status por etapa) + função "tick" que avança **um** restaurante **uma** etapa por chamada; o cliente polla e chama o tick. Nenhum loop long-lived no servidor. | Compatível com workerd stateless (P4). |
| D-10 | Export JSON: esquema provisório definido abaixo (o usuário fornecerá o exemplo real — pendência INPUT-1); CSV com colunas planas. Download via blob no cliente. | Export já útil; troca de esquema é mudança local. |
| D-11 | Histórico de edições: tabela `edit_history` com ação + payload JSON por item/restaurante. | Planejamento exige histórico. |
| D-12 | Confiança por campo: `confidence` jsonb em `menu_items` (`{campo: "alta"|"baixa"}`), preenchido pelo modelo; campos baixa confiança destacados na revisão; preço sempre com `needs_validation = true` (selo "a validar") e `price_date` da foto quando disponível. | Planejamento exige. |
| D-13 | Código server-safe (workerd): sem Node-only APIs nas server functions/rotas; `fetch` nativo; sem estado em memória global. | Build dev ≠ runtime de publicação. |

## 3. Modelo de dados (migrations)

```sql
-- restaurants
id uuid pk default gen_random_uuid()
owner_id uuid not null          -- = auth.uid()
name text not null
city text
maps_url text
status text not null default 'coletando'   -- coletando|lendo|consolidando|aguardando_revisao|concluido|erro
status_detail text              -- mensagem do último erro, quando houver
batch_id uuid null              -- agrupa processamento em lote
created_at timestamptz default now()
updated_at timestamptz default now()

-- source_images
id uuid pk
restaurant_id uuid fk -> restaurants on delete cascade
owner_id uuid not null
source text not null            -- 'scrape' | 'upload'
external_url text               -- URL original (scrape)
storage_path text not null      -- caminho no bucket menu-images
taken_at date                   -- data da foto, quando o fornecedor/modelo indicar
is_menu boolean null            -- null=ainda não lida; false=descartada (não é cardápio)
read_status text not null default 'pending' -- pending|reading|read|skipped|failed
created_at timestamptz default now()

-- menu_items
id uuid pk
restaurant_id uuid fk -> restaurants on delete cascade
owner_id uuid not null
source_image_id uuid fk -> source_images on delete set null
source_image_ids uuid[]         -- proveniência consolidada
category text not null default 'Outros'
name text not null
description text
price numeric null
currency text default 'BRL'
variations jsonb default '[]'   -- [{tipo:"tamanho"|"adicional", nome, preco}]
confidence jsonb default '{}'  -- {campo:"alta"|"baixa"}
needs_validation boolean not null default true
price_date date                 -- data da foto de origem do preço
is_active boolean not null default true -- false = removido/apagado na revisão
created_at timestamptz default now()
updated_at timestamptz default now()

-- edit_history
id uuid pk
restaurant_id uuid fk
item_id uuid null fk -> menu_items on delete set null
owner_id uuid not null
action text not null            -- create|update|delete|move|merge|restore
payload jsonb default '{}'
created_at timestamptz default now()
```

Todas as tabelas: `GRANT SELECT,INSERT,UPDATE,DELETE ... TO authenticated; GRANT ALL ... TO service_role;` + RLS `auth.uid() = owner_id` para todas as operações (sem anon). Storage: bucket privado `menu-images`, policies owner-scoped (`owner_id` no path `${owner_id}/...`).

## 4. Esquema JSON de export (provisório, até INPUT-1)

```json
{
  "restaurante": { "nome": "", "cidade": "", "maps_url": "", "gerado_em": "" },
  "categorias": [
    { "nome": "", "itens": [
      { "nome": "", "descricao": "", "preco": null, "moeda": "BRL",
        "variacoes": [], "a_validar": true, "data_preco": null,
        "origem_imagens": [] } ] } ]
}
```

## 5. Arquitetura de pastas

```
src/
  integrations/supabase/        (gerado pelo Cloud: client, client.server, auth-middleware, types)
  server/
    contracts/                  (types.ts — tipos compartilhados; pipeline.ts — máquina de estados)
    scraping/
      provider.ts               (interface MapsGalleryProvider + tipos)
      http-provider.ts          (adaptador padrão; secrets via process.env no handler)
    vision/
      schema.ts                 (json_schema estrito + zod)
      read-image.ts             (createServerFn: 1 imagem -> itens)
    pipeline/
      tick.ts                   (avança 1 restaurante 1 etapa; consolidar; leitura em lote)
      consolidate.ts
    export/
      json.ts, csv.ts           (geradores puros, testáveis)
  routes/
    index.tsx                   (landing pública + CTA login)
    auth.tsx                    (pública: email/senha, Google, Lovable)
    _authenticated/route.tsx    (layout gerado/gerenciado, ssr:false)
    _authenticated/dashboard.tsx (dashboard: lista restaurantes + fila em lote)
    _authenticated/restaurant.$id.tsx (tela de revisão)
```

## 6. Escopo por fase (resumo; aceite detalhado na seção 8)

- **Fase 0 — Fundação e contratos**: migrations + tipos compartilhados + interface de scraping + bucket. Base para tudo.
- **Fase 1 — Autenticação**: `/auth` pública (email/senha + Google + Lovable), layout `_authenticated`, dashboard vazio funcional.
- **Fase 2 — Entrada e coleta**: criar restaurante por link/nome+cidade; adapter de scraping (graceful sem chave); upload manual de imagens; espelhamento no Storage; status `coletando`.
- **Fase 3 — Leitura (visão)**: leitura imagem a imagem com JSON estrito; descarte de não-cardápios; confiança por campo; status `lendo`.
- **Fase 4 — Consolidação**: dedupe + proveniência; status `consolidando` → `aguardando_revisao`.
- **Fase 5 — Tela de revisão**: lado a lado imagem × itens, destaque de baixa confiança, editar/apagar/mover/mesclar, selo "a validar", histórico.
- **Fase 6 — Export**: JSON + CSV, download.
- **Fase 7 — Lote**: colar lista de links/nomes, fila com progresso por restaurante, tick por polling.
- **Fase 8 — Gates finais + monitor**: build, testes, Playwright no fluxo central, relato final ao monitor.

## 7. Pendências de input do usuário (não bloqueiam início)

- **INPUT-1**: exemplo real do esquema JSON de export do app do usuário → substituir o esquema provisório (D-10) sem tocar no resto.
- **INPUT-2**: serviço de scraping + chave (`MAPS_SCRAPER_URL`, `MAPS_SCRAPER_API_KEY` via add_secret) → até lá, `coletando` termina com erro claro e o upload manual cobre o fluxo completo.

## 8. Critérios de aceite por fase (gates)

Cada fase termina quando **todos** os itens abaixo passam. Testes vivem junto ao código (vitest) e cobrem as regras do usuário (preços nunca inventados, duplicatas, selo "a validar", etc.).

**Fase 0**
- [ ] Migration aplicada sem erro; tabelas + GRANTs + RLS verificadas por consulta.
- [ ] Bucket `menu-images` criado com policies owner-scoped.
- [ ] `src/server/contracts/*.ts` compila; tipos usados por fases seguintes.
- [ ] Teste: inserir linha como usuário A não vê linha do usuário B (RLS).

**Fase 1**
- [ ] Signup/signin por email funciona no preview (conta real criada e sessão lida).
- [ ] Google e Lovable: botões presentes e chamando `lovable.auth.signInWithOAuth` com redirect same-origin.
- [ ] Refresh em rota protegida não redireciona usuário logado; deslogado é levado a `/auth`.
- [ ] Teste: rota `/` pública renderiza; `_authenticated/index` exige sessão.

**Fase 2**
- [ ] Colar link do Maps OU nome+cidade cria restaurante com status `coletando`.
- [ ] Sem chave de scraping: status vira `erro` com mensagem acionável (e o app oferece upload manual) — nada quebra.
- [ ] Upload manual (1..N imagens) vai ao bucket e alimenta o mesmo pipeline (`source='upload'`).
- [ ] Imagens de scrape são espelhadas no bucket; `external_url` preservada.
- [ ] Testes: validação de entrada; espelhamento; falha de provider mapeada.

**Fase 3**
- [ ] Cada imagem pendente é lida por 1 request ao gateway com json_schema estrito; resposta parseada.
- [ ] Não-cardápio: `is_menu=false` + `read_status='skipped'`, nenhum item criado.
- [ ] Campos não lidos ficam vazios e com `confidence[campo]="baixa"`; nenhum preço/nome inventado (teste com fixture).
- [ ] Variações (tamanhos/adicionais) persistem em `variations` jsonb.
- [ ] `price_date`/`taken_at` carregados quando disponíveis; `needs_validation=true` em todo preço.
- [ ] Testes unitários do parser/normalizador com fixtures JSON do modelo.

**Fase 4**
- [ ] Consolidação junta itens de todas as imagens; repetidos (mesmo item em fotos sobrepostas) viram 1 item com `source_image_ids` múltiplas.
- [ ] Normalização case/acentos/pontuação no dedupe; itens distintos não se fundem (teste).
- [ ] Status vai `consolidando` → `aguardando_revisao`.

**Fase 5**
- [ ] Tela mostra imagem à esquerda e itens extraídos à direita, por imagem e por categoria.
- [ ] Campos de baixa confiança destacados visualmente; preço com selo "a validar" + `price_date`.
- [ ] Editar nome/descrição/preço/variações; apagar (soft `is_active=false`); mover entre categorias; mesclar duplicatas (escolhendo qual item sobrevive).
- [ ] Toda edição grava em `edit_history` (teste).
- [ ] Playwright: fluxo criar→upload→revisar numa sessão real com fixture de imagem de cardápio.

**Fase 6**
- [ ] Export JSON no esquema (provisório) e CSV plano; download funciona no browser.
- [ ] Itens inativos não saem no export (teste).

**Fase 7**
- [ ] Colar lista (1 linha = 1 restaurante) cria N restaurantes com `batch_id` comum.
- [ ] Fila mostra progresso por restaurante (etapa atual) e avança via tick por polling sem travar a UI.
- [ ] Falha de um restaurante não para a fila (status `erro` + segue o próximo).
- [ ] Teste do tick: idempotente (chamar 2x não duplica trabalho).

**Fase 8**
- [ ] `bun run build` verde; lint sem erro novo; testes todos verdes.
- [ ] Playwright end-to-end do fluxo central com fixture.
- [ ] Status das etapas escritos em `docs/planning/stages/stage-NN-status.md`; monitor acionado; relato final.

## 9. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Scraping sem chave/fornecedor no início | Fase 2 já entrega erro acionável + upload manual completo (planejamento prevê o fallback). |
| Limite de tempo de execução em lote | Tick de 1 etapa por chamada + polling (D-09). |
| Modelo alucina preço/nome | json_schema estrito + prompt "nunca invente" + teste de fixture + campos vazios quando incertos. |
| URLs de scrape expiram | Espelhamento no Storage na coleta (D-07). |
| Troca futura do esquema de export | Geradores puros (`export/json.ts`) isolados; INPUT-1 é troca local. |
| Custos de visão em lote grande | 1 request por imagem, reasoning `low`, processamento só de imagens ainda `pending`; fila sequencial respeita rate-limit (sem paralelismo agressivo). |

## 10. Registro de decisões do PRD

- RD-01: Roadmap usa numeração F0..F8 alinhada às fases da seção 6 (e às etapas stage-NN do monitor a partir de F1).
- RD-02: `roadmap-proj.md` (conteúdo "null") é o arquivo de roadmap vigente para N=1; preenchido nesta rodada.
- RD-03: Fila processa sequencialmente (1 restaurante por tick) para respeitar rate-limit do gateway e manter o progresso visível.
- RD-04: Landing `/` pública com CTA de login; nada de dados privados em rotas públicas.
