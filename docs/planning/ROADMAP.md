# Roadmap — MapsMenu (N = 1)

Fontes: `.opencode/project1.md` (escopo) + `.opencode/prd-project1.md` (como, seção 6/8). Executar na ordem; só marcar `[x]` com Gates verdes (números/evidências reais). Pré-requisito do enxame: pilares centrais completos e coerentes (skill `subagentes-3-pilares`).

## Fase 0 — Fundação e contratos
- [x] Migration: tables restaurants/source_images/menu_items/edit_history (CREATE→GRANT→RLS→POLICY)
- [x] Bucket `menu-images` + policies owner-scoped
- [x] `src/server/contracts/`: types compartilhados + máquina de estados do pipeline + interface `MapsGalleryProvider`
- [x] Teste RLS: usuário A não lê/escreve linhas de B
Gates: migration aplicada sem erro; teste RLS verde; build verde.

## Fase 1 — Autenticação
- [x] enable_email_auth + configure_social_auth (google, lovable)
- [x] `/auth` pública (email/senha + Google + Lovable), layout `_authenticated`, dashboard vazio funcional
- [x] `onAuthStateChange` filtrado no `__root`
Gates: signup+signin real no preview; refresh em rota protegida mantém sessão; build verde.

## Fase 2 — Entrada e coleta
- [ ] Criar restaurante (link do Maps OU nome+cidade) com status `coletando`
- [ ] Adaptador HTTP de scraping (`MAPS_SCRAPER_URL`/`MAPS_SCRAPER_API_KEY`); sem chave → erro acionável, upload manual disponível
- [ ] Upload manual 1..N imagens → bucket; espelhamento de imagens de scrape; rows `source_images`
Gates: upload cria imagens no bucket; falha de provider mapeada (erro acionável); testes verdes.

## Fase 3 — Leitura (visão)
- [ ] json_schema estrito + zod; server fn de leitura (gpt-6-astra, /v1/responses, image_url part, 1 imagem/request)
- [ ] Não-cardápio → `is_menu=false`/`skipped`; confidence por campo; price_date/needs_validation; variações
- [ ] Testes do parser com fixtures
Gates: teste "não inventa preço/nome" verde; schema estrito valida; build verde.

## Fase 4 — Consolidação
- [ ] Normalização + dedupe (merge de sobrepostos, `source_image_ids`); status `consolidando`→`aguardando_revisao`
Gates: teste dedupe (funde duplicado, preserva distinto) verde.

## Fase 5 — Tela de revisão
- [ ] Lado a lado imagem × itens; destaque de baixa confiança; selo "a validar" + price_date
- [ ] Editar/apagar/mover/mesclar; toda edição em `edit_history`
Gates: Playwright fluxo real com fixture de cardápio; edições registradas no histórico.

## Fase 6 — Export
- [ ] Geradores puros `export/json.ts` + `csv.ts` + download no browser
Gates: testes de export (itens inativos fora) verdes; download funciona.

## Fase 7 — Lote
- [ ] Colar lista → N restaurantes com `batch_id`; tick idempotente por polling; fila com progresso por restaurante
Gates: teste do tick idempotente; falha de 1 restaurante não para a fila.

## Fase 8 — Gates finais + monitor
- [ ] build + lint + testes todos verdes; Playwright e2e do fluxo central
- [ ] `docs/planning/stages/stage-NN-status.md` por etapa concluída; relato final ao monitor
Gates: build OK; e2e OK; monitor relatado (fim da rodada de remix).
