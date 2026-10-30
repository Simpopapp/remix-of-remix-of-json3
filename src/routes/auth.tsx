import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — MapsMenu" },
      {
        name: "description",
        content: "Acesse sua conta para transformar restaurantes do Google Maps em cardápios estruturados.",
      },
      { property: "og:title", content: "Entrar — MapsMenu" },
      {
        property: "og:description",
        content: "Acesse sua conta para transformar restaurantes do Google Maps em cardápios estruturados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

/** Caminho interno (same-origin) para voltar após o login; nunca domínio externo. */
function safeNext(): string {
  try {
    const raw = new URL(window.location.href).searchParams.get("next") ?? "/dashboard";
    if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  } catch {
    // ignora e usa o padrão
  }
  return "/dashboard";
}

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function afterSession() {
    const next = safeNext();
    await navigate({ to: next as "/dashboard" });
  }

  async function handleSubmit(mode: "signin" | "signup") {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice("Conta criada! Confirme o e-mail enviado para você e depois faça login.");
          return;
        }
        await afterSession();
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await afterSession();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível continuar");
    } finally {
      setBusy(false);
    }
  }

  async function handleSocial(provider: "google" | "lovable") {
    setBusy(true);
    setError(null);
    try {
      // Preserva o destino (same-origin) para depois do retorno do provedor.
      sessionStorage.setItem("mapsmenu_auth_next", safeNext());
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      if (result.redirected) return; // fluxo full-page do provedor
      await afterSession();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível entrar com este provedor");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-serif text-2xl">MapsMenu</CardTitle>
          <CardDescription>
            Entre para transformar restaurantes do Google Maps em cardápios organizados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="space-y-3 pt-2">
              <EmailForm
                email={email}
                password={password}
                busy={busy}
                setEmail={setEmail}
                setPassword={setPassword}
                onSubmit={() => handleSubmit("signin")}
                submitLabel="Entrar"
              />
            </TabsContent>
            <TabsContent value="signup" className="space-y-3 pt-2">
              <EmailForm
                email={email}
                password={password}
                busy={busy}
                setEmail={setEmail}
                setPassword={setPassword}
                onSubmit={() => handleSubmit("signup")}
                submitLabel="Criar conta"
              />
            </TabsContent>
          </Tabs>

          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="relative py-2 text-center text-xs uppercase text-muted-foreground">
            <span className="bg-card px-2">ou</span>
          </div>

          <div className="space-y-2">
            <Button variant="outline" className="w-full" disabled={busy} onClick={() => handleSocial("google")}>
              Continuar com Google
            </Button>
            <Button variant="outline" className="w-full" disabled={busy} onClick={() => handleSocial("lovable")}>
              Continuar com Lovable
            </Button>
          </div>

          <p className="pt-2 text-center text-xs text-muted-foreground">
            <Link to="/" className="underline-offset-2 hover:underline">
              Voltar ao início
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function EmailForm(props: {
  email: string;
  password: string;
  busy: boolean;
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={props.email}
          onChange={(e) => props.setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="current-password"
          value={props.password}
          onChange={(e) => props.setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={props.busy}>
        {props.busy ? "Aguarde..." : props.submitLabel}
      </Button>
    </form>
  );
}
