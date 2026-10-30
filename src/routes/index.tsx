import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MapsMenu — cardápio estruturado a partir do Google Maps" },
      {
        name: "description",
        content:
          "Cole o link de um restaurante do Google Maps e receba um cardápio estruturado, revisável e pronto para exportar em JSON.",
      },
      { property: "og:title", content: "MapsMenu — cardápio estruturado a partir do Google Maps" },
      {
        property: "og:description",
        content:
          "Cole o link de um restaurante do Google Maps e receba um cardápio estruturado, revisável e pronto para exportar em JSON.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

const STEPS = [
  {
    title: "1. Cole o link",
    text: "Link de um local do Maps, ou nome e cidade. Vários de uma vez, em lote.",
  },
  {
    title: "2. Coletamos as fotos",
    text: "O sistema descobre as fotos do cardápio na galeria do local — ou você envia as imagens.",
  },
  {
    title: "3. Lemos com visão",
    text: "Cada foto é lida por IA: categorias, itens, preços e variações. Nada é inventado.",
  },
  {
    title: "4. Você revisa e exporta",
    text: "Só o que ficou duvidoso pede atenção. Depois, exporte em JSON ou CSV.",
  },
];

function HomePage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-10">
      <header className="flex items-center justify-between">
        <span className="font-serif text-2xl font-semibold">MapsMenu</span>
        <Button asChild>
          <Link to="/auth">Entrar</Link>
        </Button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center py-16 text-center">
        <h1 className="max-w-2xl font-serif text-5xl font-semibold leading-tight">
          Do Google Maps ao cardápio estruturado
        </h1>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Cole o link de um restaurante e o sistema descobre as fotos do cardápio, lê cada uma e
          organiza tudo para você revisar e exportar.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Começar agora</Link>
          </Button>
        </div>

        <div className="mt-16 grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <Card key={s.title} className="text-left">
              <CardHeader>
                <CardTitle className="text-base">{s.title}</CardTitle>
                <CardDescription>{s.text}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          ))}
        </div>
      </main>

      <footer className="text-center text-xs text-muted-foreground">
        Preços extraídos vêm com data da foto e selo “a validar” — cardápios do Maps costumam estar
        desatualizados.
      </footer>
    </div>
  );
}
