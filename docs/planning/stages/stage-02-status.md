# Stage 02 — Fase 1 (Autenticação)

**Data:** 2026-10-30 · **Status registrado:** concluída

## Entregas
- Email/senha habilitado (enable_email_auth); Google + Sign in com Lovable habilitados (configure_social_auth).
- Rotas: `/auth` pública (entrar/criar conta + Google + Lovable, `next` same-origin), `/` landing pública com CTA, `_authenticated/route.tsx` (ssr:false + beforeLoad getUser → /auth), `/dashboard` protegido (placeholder da fila).
- `__root.tsx`: onAuthStateChange filtrado a transições de identidade.

## Evidências dos gates (Playwright, preview real)
- Deslogado em `/dashboard` → redirecionado a `/auth`.
- Login por email/senha com conta confirmada criada via Auth → chega a `/dashboard` (screenshot dashboard.png).
- Refresh em `/dashboard` mantém sessão (sem bounce para /auth).
- Observação: painel movido de `_authenticated/index` para `/dashboard` (rota raiz "/" só pode ter um dono — conflito de rota resolvido).
