# Decisões técnicas

## RD-05 — Subagentes de planejamento são somente-leitura neste ambiente
Os 3 subagentes (visão, consolidação, export) confirmaram via sandbox que não podem
escrever arquivos. Decisão: o agente principal implementa os pacotes diretamente;
os subagentes revisam planos/PRDs (produzem apenas relatórios textuais).

## RD-06 — Tick do pipeline acionado pelo cliente
`advanceRestaurant` (server fn) avança UM restaurante UMA etapa por chamada
(idempotente). O dashboard polla a cada 2,5 s e chama o tick para o primeiro
restaurante ativo da fila. Sem estado em memória: tudo persiste no banco.

## RD-07 — Núcleos internos para evitar server fn dentro de server fn
`readImageCore`, `consolidateCore` e `collectCore` são funções internas usadas
tanto pelas server fns autenticadas quanto pelo tick, que injeta
`{ supabase, userId }` (mesmo contrato do `requireSupabaseAuth`).

## RD-08 — Client-safe RPC boundaries
Keep client-imported server functions in `src/lib/functions` and shared contracts in `src/lib/contracts`; load processing cores from handler bodies so `src/server` stays out of the browser import graph.
