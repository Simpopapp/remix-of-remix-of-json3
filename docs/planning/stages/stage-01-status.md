# Stage 01 — Fase 0 (Fundação e contratos)

**Data:** 2026-10-30 · **Status registrado:** concluída

## Entregas
- Migration `mapsmenu_core_tables`: restaurants, source_images, menu_items, edit_history (CREATE→GRANT→RLS→POLICY) + policies owner-scoped no bucket `menu-images` (storage.objects).
- Bucket privado `menu-images` (20MB) criado.
- Contratos: `src/server/contracts/types.ts`, `pipeline.ts` (máquina de estados: 1 etapa por tick, erro terminal), `src/server/scraping/provider.ts` (MapsGalleryProvider + erros tipados).

## Evidências dos gates
- Migration aplicada sem erro (tool de banco).
- `src/test/rls.test.ts`: usuário A criado via Auth real; vê só a própria linha; insert forjado como B rejeitado; delete em linhas de B afeta 0. 4/4 testes verdes (`bunx vitest run`).
- Pipeline: `src/test/pipeline.test.ts` 3/3 verdes.
- Build: verificado após edições (build-errors.log).
