import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listRestaurants } from "@/lib/functions/restaurants.functions";
import { createBatch } from "@/lib/functions/batch.functions";
import { advanceRestaurant } from "@/lib/functions/tick.functions";
import { registerUploadedImage } from "@/lib/functions/images.functions";
import { MENU_IMAGES_BUCKET, type RestaurantRow } from "@/lib/contracts/types";
import { STATUS_LABEL } from "@/lib/contracts/pipeline";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Meus restaurantes — MapsMenu" },
      { name: "description", content: "Acompanhe a fila de restaurantes e o progresso de cada cardápio." },
      { property: "og:title", content: "Meus restaurantes — MapsMenu" },
      { property: "og:description", content: "Acompanhe a fila de restaurantes e o progresso de cada cardápio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: (ctx) =>
    ctx.context.queryClient.ensureQueryData(
      queryOptions({ queryKey: ["restaurants"], queryFn: () => listRestaurants() }),
    ),
  component: DashboardPage,
});

const STATUS_STYLE: Record<string, string> = {
  coletando: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  lendo: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  consolidando: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  aguardando_revisao: "bg-green-500/15 text-green-300 border-green-500/30",
  concluido: "bg-green-700/20 text-green-400 border-green-700/40",
  erro: "bg-red-500/15 text-red-300 border-red-500/30",
};

function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: restaurants } = useSuspenseQuery(
    queryOptions({ queryKey: ["restaurants"], queryFn: () => listRestaurants() }),
  );

  const [lines, setLines] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const advancingRef = useRef(false);

  // Retorno de login social: destino salvo na /auth.
  useEffect(() => {
    const next = sessionStorage.getItem("mapsmenu_auth_next");
    if (next && next.startsWith("/") && !next.startsWith("//") && next !== "/dashboard") {
      sessionStorage.removeItem("mapsmenu_auth_next");
      void navigate({ to: next as "/dashboard" });
    }
  }, [navigate]);

  // Fila: um tick por intervalo (RD-03) — avança o primeiro restaurante ativo.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (advancingRef.current) return;
      const active = restaurants.find((r) => r.status === "coletando" || r.status === "lendo");
      if (!active) return;
      advancingRef.current = true;
      try {
        await advanceRestaurant({ data: { restaurantId: active.id } });
        await queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      } catch {
        // falha de tick não trava a fila; tenta no próximo intervalo
      } finally {
        advancingRef.current = false;
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [restaurants, queryClient]);

  async function handleAddToQueue() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const parsed = lines.split("\n").map((l) => l.trim()).filter(Boolean);
      if (parsed.length === 0) throw new Error("Cole ao menos um link ou nome de restaurante");
      const result = await createBatch({ data: { lines: parsed } });
      setLines("");
      setNotice(
        result.created.length === 1
          ? "Restaurante na fila! O processamento começa em instantes."
          : `${result.created.length} restaurantes na fila!`,
      );
      await queryClient.invalidateQueries({ queryKey: ["restaurants"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível adicionar à fila");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-5xl px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-semibold">Meus restaurantes</h1>
        <Button
          variant="outline"
          onClick={async () => {
            await supabase.auth.signOut();
            await navigate({ to: "/auth" });
          }}
        >
          Sair
        </Button>
      </header>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Adicionar à fila</CardTitle>
          <CardDescription>
            Uma entrada por linha: link de um local do Google Maps, ou “Nome - Cidade”. Em lote, cada linha vira um restaurante na fila.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={4}
            placeholder={"https://maps.app.goo.gl/...\nPizzaria Bella - São Paulo"}
            value={lines}
            onChange={(e) => setLines(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <Button onClick={handleAddToQueue} disabled={busy}>
              {busy ? "Adicionando..." : "Adicionar à fila"}
            </Button>
            {notice && <span className="text-sm text-muted-foreground">{notice}</span>}
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </CardContent>
      </Card>

      <section className="mt-8 space-y-3">
        {restaurants.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhum restaurante ainda. Cole um link acima para começar.
            </CardContent>
          </Card>
        ) : (
          restaurants.map((r) => (
            <RestaurantCard key={r.id} restaurant={r} />
          ))
        )}
      </section>
    </div>
  );
}

function RestaurantCard({ restaurant }: { restaurant: RestaurantRow }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const canReview = restaurant.status === "aguardando_revisao" || restaurant.status === "concluido";

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Sessão expirada");
      for (const file of files) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${user.user.id}/${restaurant.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(MENU_IMAGES_BUCKET).upload(path, file, {
          contentType: file.type || "image/jpeg",
        });
        if (error) throw error;
        await registerUploadedImage({ data: { restaurantId: restaurant.id, storagePath: path } });
      }
      await advanceRestaurant({ data: { restaurantId: restaurant.id } });
      await queryClient.invalidateQueries({ queryKey: ["restaurants"] });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha no envio das imagens");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">{restaurant.name}</CardTitle>
          {restaurant.city && <CardDescription>{restaurant.city}</CardDescription>}
        </div>
        <Badge variant="outline" className={STATUS_STYLE[restaurant.status] ?? ""}>
          {STATUS_LABEL[restaurant.status as keyof typeof STATUS_LABEL] ?? restaurant.status}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {restaurant.status_detail && (
          <p className="w-full text-sm text-destructive">{restaurant.status_detail}</p>
        )}
        {canReview ? (
          <Button asChild size="sm">
            <Link to="/restaurant/$id" params={{ id: restaurant.id }}>
              Revisar cardápio
            </Link>
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? "Enviando..." : "Enviar fotos do cardápio"}
          </Button>
        )}
        {restaurant.status === "erro" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            Tentar com fotos próprias
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => void handleUpload(e.target.files)}
        />
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost">
              Detalhes
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{restaurant.name}</DialogTitle>
            </DialogHeader>
            <dl className="space-y-1 text-sm">
              {restaurant.maps_url && (
                <div>
                  <dt className="text-muted-foreground">Link do Maps</dt>
                  <dd className="break-all">{restaurant.maps_url}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd>{STATUS_LABEL[restaurant.status as keyof typeof STATUS_LABEL] ?? restaurant.status}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Criado em</dt>
                <dd>{new Date(restaurant.created_at).toLocaleString("pt-BR")}</dd>
              </div>
            </dl>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
