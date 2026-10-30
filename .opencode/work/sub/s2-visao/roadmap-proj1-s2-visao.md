# roadmap-proj1-s2-visao

## Fase A — schema e fixtures
- [ ] `src/server/vision/schema.ts` (json_schema + zod + normalizador)
- [ ] Testes com fixtures (válido / não-cardápio / incertos)
Gates: testes verdes; "campo ilegível → null + baixa" provado.

## Fase B — gateway
- [ ] `src/server/vision/gateway.ts` (provider + fetch wrapper)
Gates: sem chamada no escopo de módulo; key só dentro do handler.

## Fase C — server fn de leitura
- [ ] `src/server/vision/read-image.ts` (download → leitura → persistência; idempotente)
Gates: build verde; contrato respeitado (rows menu_items/source_images).

## Fase D — verificação
- [ ] Testes finais do pacote + relatório
Gates: todos os testes verdes; falhas do gateway mapeadas (terminal vs retry).
