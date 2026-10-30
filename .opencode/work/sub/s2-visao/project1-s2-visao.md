# project1-s2-visao — planejamento do subagente

**Missão:** implementar a leitura de imagens de cardápio por visão computacional (Fase 3 do roadmap central): cada imagem pendente é enviada a um modelo de visão que devolve um JSON estrito com categorias, itens, descrição, preço, variações e confiança por campo; fotos que não são cardápio são descartadas. Serve ao objetivo central (project1.md): cardápio único, sem inventar nada, pronto para revisão.

**Escopo (dono exclusivo):**
- `src/server/vision/schema.ts` (json_schema estrito + zod + fixtures parse)
- `src/server/vision/gateway.ts` (helpers do Lovable AI Gateway)
- `src/server/vision/read-image.ts` (server function de leitura de 1 imagem)
- `src/server/vision/*.test.ts` (testes do schema/parser)

**Fora do escopo:** scraping/upload (`src/server/scraping/*`, `src/server/images/*` — pacote s1-coleta), consolidação (`src/server/pipeline/*` — s3-consolidacao), export (`src/server/export/*` — s4-export), rotas/UI (agente principal). Não editar migrations, `src/routes/*`, `src/integrations/*`, pilares centrais ou de outros subagentes.

**Por quê:** o modelo nunca deve inventar preço/nome (planejamento central); sem json_schema estrito o parse quebra; a etapa `lendo` precisa terminar com estado limpo mesmo em falha.

**Fronteiras:** recebe de s1-coleta imagens no bucket `menu-images` com rows em `source_images` (`read_status='pending'`, `storage_path`). Entrega rows `menu_items` + `source_images.read_status/is_menu/taken_at` atualizados; chamada pelo pipeline via `readOneImage` (export do read-image.ts).
