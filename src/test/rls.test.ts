import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Teste de integração RLS (Fase 0): usuário A não lê nem escreve linhas do usuário B. */

function loadServerEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  // variáveis já no ambiente do processo (dev server / CI)
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(SUPABASE|VITE_SUPABASE)_[A-Z_]+$/.test(k) && v) out[k] = v;
  }
  if (out["SUPABASE_SERVICE_ROLE_KEY"]) return out;
  // fallback: .env gerado pelo Cloud (server-side, nunca no bundle do app)
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] && m[2] && !out[m[1]]) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // sem .env: segue com o que houver
  }
  return out;
}

const env = loadServerEnv();
const url = env["SUPABASE_URL"] ?? env["VITE_SUPABASE_URL"];
const serviceKey = env["SUPABASE_SERVICE_ROLE_KEY"];
const anonKey =
  env["SUPABASE_PUBLISHABLE_KEY"] ?? env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? env["VITE_SUPABASE_ANON_KEY"];

if (!url || !serviceKey || !anonKey) {
  throw new Error("Env do Cloud ausente para o teste de RLS");
}
const SB_URL: string = url;
const SERVICE_KEY: string = serviceKey;
const ANON_KEY: string = anonKey;

const admin = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const stamp = Date.now();
const userA = { email: `rls-a-${stamp}@example.com`, password: `Rls#Test${stamp}` };
const userB = { email: `rls-b-${stamp}@example.com`, password: `Rls#Test${stamp}` };

async function createAndSignIn(user: { email: string; password: string }) {
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
  });
  expect(error).toBeNull();
  expect(data.user).toBeTruthy();
  const anon = createClient(SB_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await anon.auth.signInWithPassword(user);
  expect(signInError).toBeNull();
  return { id: data.user!.id, client: anon };
}

describe("RLS: isolamento por owner (Fase 0)", () => {
  it("A vê só suas linhas e não consegue escrever como B", async () => {
    const a = await createAndSignIn(userA);
    const b = await createAndSignIn(userB);

    // A cria um restaurante próprio
    const { data: created, error: insertErr } = await a.client
      .from("restaurants")
      .insert({ owner_id: a.id, name: "Restaurante A" })
      .select()
      .single();
    expect(insertErr).toBeNull();
    expect(created?.owner_id).toBe(a.id);

    // B cria um restaurante próprio
    const { error: insertBErr } = await b.client
      .from("restaurants")
      .insert({ owner_id: b.id, name: "Restaurante B" });
    expect(insertBErr).toBeNull();

    // A lê: só a linha dele aparece
    const { data: visibleA } = await a.client.from("restaurants").select("owner_id, name");
    expect(visibleA?.length).toBe(1);
    expect(visibleA?.[0]?.owner_id).toBe(a.id);

    // A tenta escrever como B: RLS rejeita
    const { error: forgedErr } = await a.client
      .from("restaurants")
      .insert({ owner_id: b.id, name: "Forjado por A" });
    expect(forgedErr).toBeTruthy();

    // A tenta apagar linha de B: 0 linhas afetadas
    const { data: deleted, error: delErr } = await a.client
      .from("restaurants")
      .delete()
      .eq("owner_id", b.id)
      .select();
    expect(delErr).toBeNull();
    expect(deleted?.length ?? 0).toBe(0);

    // limpeza (service role ignora RLS)
    await admin.from("restaurants").delete().in("owner_id", [a.id, b.id]);
    await admin.auth.admin.deleteUser(a.id);
    await admin.auth.admin.deleteUser(b.id);
  }, 30000);
});
