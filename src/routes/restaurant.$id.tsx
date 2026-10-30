import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { advanceRestaurant } from "@/lib/guest-api";
import {
  deleteItem,
  getReviewData,
  mergeItems,
  updateItem,
} from "@/lib/guest-api";
import { exportMenuCsv, exportMenuJson } from "@/lib/guest-api";
import { STATUS_LABEL } from "@/lib/contracts/pipeline";
import type { MenuItemRow, SourceImageRow } from "@/lib/contracts/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/restaurant/$id")({
  // Guest records exist only in this browser; the server cannot resolve them.
  ssr: false,
  head: (ctx) => {
    const restaurant = (ctx.loaderData as { restaurant?: { name: string } } | undefined)?.restaurant;
    const title = restaurant ? `Revisão — ${restaurant.name}` : "Revisão — MapsMenu";
    return {
      meta: [
        { title },
        { name: "description", content: "Revise os itens extraídos do cardápio antes de exportar." },
        { property: "og:title", content: title },
        {
          property: "og:description",
          content: "Revise os itens extraídos do cardápio antes de exportar.",
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  loader: (ctx) =>
    ctx.context.queryClient.ensureQueryData(
      queryOptions({
        queryKey: ["review", ctx.params.id],
        queryFn: () => getReviewData({ data: { restaurantId: ctx.params.id } }),
      }),
    ),
  component: ReviewPage,
});

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ReviewPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["review", id],
      queryFn: () => getReviewData({ data: { restaurantId: id } }),
    }),
  );
  const [urls, setUrls] = useState<Record<string, string>>({});

  // URLs assinadas das imagens (bucket privado) — somente no browser.
  useEffect(() => {
    let cancelled = false;
    async function sign() {
      const next: Record<string, string> = {};
      for (const image of data.images) {
        next[image.id] = image.storage_path;
      }
      if (!cancelled) setUrls(next);
    }
    void sign();
    return () => {
      cancelled = true;
    };
  }, [data.images]);

  // Segurança: se a coleta/leitura ainda não terminou, avança o pipeline ao abrir.
  useEffect(() => {
    if (data.restaurant.status === "lendo" || data.restaurant.status === "coletando") {
      void advanceRestaurant({ data: { restaurantId: id } }).then(() =>
        queryClient.invalidateQueries({ queryKey: ["review", id] }),
      );
    }
  }, [data.restaurant.status, id, queryClient]);

  const menuImages = data.images.filter((i) => i.read_status === "read");
  const categories = Array.from(new Set(data.items.map((i) => i.category))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["review", id] });
  }

  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold">{data.restaurant.name}</h1>
          <p className="text-sm text-muted-foreground">
            {STATUS_LABEL[data.restaurant.status as keyof typeof STATUS_LABEL] ??
              data.restaurant.status}
            {" · "}
            {data.items.length} itens
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard">Voltar à fila</Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () =>
              download(
                `cardapio-${data.restaurant.name}.json`,
                JSON.stringify(await exportMenuJson({ data: { restaurantId: id } }), null, 2),
                "application/json",
              )
            }
          >
            Exportar JSON
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () =>
              download(
                `cardapio-${data.restaurant.name}.csv`,
                await exportMenuCsv({ data: { restaurantId: id } }),
                "text/csv",
              )
            }
          >
            Exportar CSV
          </Button>
        </div>
      </header>

      {data.items.length === 0 && (
        <Card className="mt-8">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum item extraído ainda. Se o processamento acabou de começar, aguarde um instante.
          </CardContent>
        </Card>
      )}

      {categories.map((category) => (
        <section key={category} className="mt-8">
          <h2 className="font-serif text-xl font-semibold">{category}</h2>
          <div className="mt-3 space-y-3">
            {data.items
              .filter((i) => i.category === category)
              .map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  restaurantId={id}
                  items={data.items}
                  onChanged={invalidate}
                  imageUrls={urls}
                />
              ))}
          </div>
        </section>
      ))}

      {menuImages.length > 0 && (
        <section className="mt-10">
          <h2 className="font-serif text-xl font-semibold">Fotos usadas</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {menuImages.map((image) => (
              <img
                key={image.id}
                src={urls[image.id]}
                alt="Foto do cardápio"
                className="h-28 w-28 rounded-md border border-border object-cover"
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Item da revisão: imagem de origem à esquerda, campos editáveis à direita. */
function ItemCard(props: {
  item: MenuItemRow;
  restaurantId: string;
  items: MenuItemRow[];
  imageUrls: Record<string, string>;
  onChanged: () => void;
}) {
  const item = props.item;
  const confidence = (item.confidence ?? {}) as Record<string, string>;
  const lowName = confidence["nome"] === "baixa";
  const lowPrice = item.price === null || confidence["preco"] === "baixa";
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [price, setPrice] = useState(item.price === null ? "" : String(item.price));
  const [merging, setMerging] = useState(false);

  const sourceUrl = item.source_image_id ? props.imageUrls[item.source_image_id] : undefined;

  async function save() {
    const parsedPrice = price.trim() === "" ? null : Number(price.replace(",", "."));
    await updateItem({
      data: {
        itemId: item.id,
        restaurantId: props.restaurantId,
        patch: {
          name: name.trim() || item.name,
          description: description.trim() || null,
          price: Number.isFinite(parsedPrice) ? parsedPrice : null,
        },
      },
    });
    setEditing(false);
    props.onChanged();
  }

  return (
    <Card className={lowName || lowPrice ? "border-amber-500/40" : undefined}>
      <CardContent className="flex gap-4 p-4">
        <div className="hidden w-28 shrink-0 sm:block">
          {sourceUrl ? (
            <img src={sourceUrl} alt="Origem do item" className="h-28 w-28 rounded-md border border-border object-cover" />
          ) : (
            <div className="h-28 w-28 rounded-md border border-dashed border-border" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
            ) : (
              <span className={lowName ? "font-medium text-amber-300" : "font-medium"}>{item.name}</span>
            )}
            {item.price !== null && item.needs_validation && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-300">
                a validar{item.price_date ? ` · foto ${item.price_date}` : ""}
              </Badge>
            )}
            {item.price === null && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-300">
                preço não lido
              </Badge>
            )}
          </div>

          {editing ? (
            <div className="space-y-2">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrição"
              />
              <div className="flex items-center gap-2">
                <Input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder="Preço"
                  className="max-w-32"
                />
                <Button size="sm" onClick={() => void save()}>
                  Salvar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {item.description ?? ""}
              {item.price !== null && (
                <span className="ml-2 font-medium text-foreground">
                  {item.price.toLocaleString("pt-BR", { style: "currency", currency: item.currency })}
                </span>
              )}
            </p>
          )}

          {!editing && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                Editar
              </Button>
              <MoveCategory item={item} restaurantId={props.restaurantId} onChanged={props.onChanged} />
              <Button size="sm" variant="ghost" onClick={() => setMerging((v) => !v)}>
                Mesclar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={async () => {
                  await deleteItem({ data: { itemId: item.id, restaurantId: props.restaurantId } });
                  props.onChanged();
                }}
              >
                Apagar
              </Button>
            </div>
          )}

          {merging && (
            <div className="rounded-md border border-border p-2 text-xs">
              <p className="mb-2 text-muted-foreground">
                Mesclar outro item neste (mantém este e junta as fotos de origem):
              </p>
              <div className="flex max-h-40 flex-col gap-1 overflow-auto">
                {props.items
                  .filter((other) => other.id !== item.id && other.category === item.category)
                  .map((other) => (
                    <button
                      key={other.id}
                      className="rounded px-2 py-1 text-left hover:bg-accent"
                      onClick={async () => {
                        await mergeItems({
                          data: {
                            survivorId: item.id,
                            otherId: other.id,
                            restaurantId: props.restaurantId,
                          },
                        });
                        setMerging(false);
                        props.onChanged();
                      }}
                    >
                      {other.name}
                      {other.price !== null ? ` · ${other.price}` : ""}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MoveCategory(props: {
  item: MenuItemRow;
  restaurantId: string;
  onChanged: () => void;
}) {
  const [value, setValue] = useState<string>("");
  return (
    <Select
      value={value}
      onValueChange={async (next) => {
        if (!next || next === props.item.category) return;
        await updateItem({
          data: {
            itemId: props.item.id,
            restaurantId: props.restaurantId,
            patch: { category: next },
          },
        });
        setValue("");
        props.onChanged();
      }}
    >
      <SelectTrigger className="h-7 w-40 text-xs">
        <SelectValue placeholder="Mover para categoria" />
      </SelectTrigger>
      <SelectContent>
        {["Entradas", "Pratos principais", "Bebidas", "Sobremesas", "Outros"].map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
