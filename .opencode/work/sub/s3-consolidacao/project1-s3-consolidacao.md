# project1-s3-consolidacao — planejamento do subagente

**Missão:** juntar os resultados de todas as imagens de um restaurante num único cardápio sem duplicatas (Fase 4 central): remover itens repetidos de fotos sobrepostas e preservar de qual imagem cada item veio.

**Escopo (dono exclusivo):** `src/server/pipeline/consolidate.ts` (núcleo puro de dedupe/merge), `src/server/pipeline/consolidate.functions.ts` (server function que carrega itens do banco, aplica o núcleo e grava), `src/server/pipeline/*.test.ts` do pacote.

**Fora do escopo:** leitura/visão (`src/server/vision/*` — s2), coleta (`src/server/scraping/*`, `src/server/images/*` — agente principal), export, rotas/UI, migrations. Não editar pilares nem arquivos de outros pacotes.

**Por quê:** fotos sobrepostas geram o mesmo item várias vezes; sem proveniência o usuário não sabe de onde veio o preço.

**Fronteiras:** consome rows `menu_items` já criados pela visão (um por imagem). Entrega: itens fundidos com `source_image_ids` múltiplos, itens descartados marcados `is_active=false`, e o chamador (pipeline do agente principal) transita o status `consolidando`→`aguardando_revisao` — a server function NÃO muda o status do restaurante.

**Assinatura exportada** de `consolidate.functions.ts`: `export const consolidateRestaurant = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(...{ restaurantId: string }...).handler(...)` → `{ merged: number, deactivated: number }`.
