# roadmap-proj1-s3-consolidacao

## Fase A — núcleo puro
- [ ] `consolidate.ts` com normalize + jaccard + merge + proveniência
- [ ] Testes: funde duplicado / jaccard compatível / NÃO funde distinto / completa null / idempotente
Gates: todos os testes verdes com fixtures concretas.

## Fase B — server function
- [ ] `consolidate.functions.ts` (carregar → núcleo → persistir; sem tocar status)
Gates: build verde; teste de idempotência do núcleo sobre saída aplicada.
