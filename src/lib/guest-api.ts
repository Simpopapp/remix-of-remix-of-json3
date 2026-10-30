import { addGuestRestaurants, emptyWorkspace, readWorkspace, requireGuestRestaurant, GUEST_STORAGE_KEY, type GuestWorkspace } from "@/lib/guest-workspace";
import { readGuestImage, collectGuestGallery } from "@/lib/functions/guest.functions";
import type { MenuItemRow } from "@/lib/contracts/types";

function load(): GuestWorkspace { return typeof window === "undefined" ? emptyWorkspace() : readWorkspace(window.localStorage); }
function save(workspace: GuestWorkspace) { localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(workspace)); }
export async function listRestaurants() { return load().restaurants; }
export async function createBatch({ data }: { data: { lines: string[] } }) {
  const workspace = load(); const created = addGuestRestaurants(workspace, data.lines); save(workspace);
  return { batchId: created[0]?.batch_id, created };
}
export async function advanceRestaurant({ data }: { data: { restaurantId: string } }) {
  const workspace = load(); const restaurant = requireGuestRestaurant(workspace, data.restaurantId);
  if (restaurant.status !== "coletando") return;
  // Claim locally before waiting so uploads cannot be overwritten by a stale tick.
  restaurant.status = "lendo"; save(workspace);
  try {
    const gallery = await collectGuestGallery({ data: { mapsUrl: restaurant.maps_url ?? undefined, name: restaurant.name, city: restaurant.city ?? undefined } });
    for (const image of gallery.images) {
      const response = await fetch(image.url);
      if (!response.ok) throw new Error("Não foi possível abrir a foto. Envie as imagens do cardápio.");
      await uploadGuestFiles(restaurant.id, [new File([await response.blob()], "cardapio.jpg", { type: response.headers.get("content-type") || "image/jpeg" })]);
    }
  } catch (error) {
    const latest = load(); const row = requireGuestRestaurant(latest, restaurant.id);
    if (row.status === "lendo") { row.status = "erro"; row.status_detail = error instanceof Error ? error.message : "Envie fotos do cardápio para continuar"; save(latest); }
  }
}
function asDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Não foi possível abrir a foto")); reader.readAsDataURL(file); });
}
export async function uploadGuestFiles(restaurantId: string, files: File[]) {
  for (const file of files) {
    const imageUrl = await asDataUrl(file);
    const result = await readGuestImage({ data: { image: imageUrl } });
    const workspace = load(); const restaurant = requireGuestRestaurant(workspace, restaurantId);
    if (!result.e_cardapio) throw new Error(result.motivo_descarte || "A foto não é de um cardápio");
    const imageId = crypto.randomUUID(); const now = new Date().toISOString();
    workspace.images.push({ id: imageId, restaurant_id: restaurantId, owner_id: "guest", source: "upload", storage_path: imageUrl, external_url: null, taken_at: result.data_da_foto ?? null, is_menu: true, read_status: "read", created_at: now });
    workspace.items.push(...result.itens.map((item): MenuItemRow => ({ id: crypto.randomUUID(), restaurant_id: restaurantId, owner_id: "guest", source_image_id: imageId, source_image_ids: [imageId], category: item.categoria, name: item.nome, description: item.descricao, price: item.preco, currency: item.moeda, variations: item.variacoes, confidence: item.confianca, needs_validation: true, price_date: result.data_da_foto ?? null, is_active: true, created_at: now, updated_at: now })));
    restaurant.status = "aguardando_revisao"; restaurant.status_detail = null; save(workspace);
  }
}
export async function getReviewData({ data }: { data: { restaurantId: string } }) {
  const workspace = load(); return { restaurant: requireGuestRestaurant(workspace, data.restaurantId), images: workspace.images.filter((i) => i.restaurant_id === data.restaurantId), items: workspace.items.filter((i) => i.restaurant_id === data.restaurantId && i.is_active) };
}
export async function updateItem({ data }: { data: { itemId: string; restaurantId: string; patch: Partial<MenuItemRow> } }) {
  const workspace = load(); requireGuestRestaurant(workspace, data.restaurantId);
  const item = workspace.items.find((i) => i.id === data.itemId && i.restaurant_id === data.restaurantId);
  if (!item) throw new Error("Item não encontrado"); Object.assign(item, data.patch); save(workspace);
}
export async function deleteItem({ data }: { data: { itemId: string; restaurantId: string } }) { await updateItem({ data: { ...data, patch: { is_active: false } } }); }
export async function mergeItems({ data }: { data: { survivorId: string; otherId: string; restaurantId: string } }) {
  const workspace = load(); requireGuestRestaurant(workspace, data.restaurantId);
  const survivor = workspace.items.find((i) => i.id === data.survivorId && i.restaurant_id === data.restaurantId);
  const other = workspace.items.find((i) => i.id === data.otherId && i.restaurant_id === data.restaurantId);
  if (!survivor || !other || survivor.id === other.id) throw new Error("Itens não encontrados");
  survivor.source_image_ids = [...new Set([...survivor.source_image_ids, ...other.source_image_ids])];
  survivor.description ??= other.description; survivor.price ??= other.price; other.is_active = false; save(workspace);
}
export async function exportMenuJson(input: { data: { restaurantId: string } }) {
  const { restaurant, items } = await getReviewData(input);
  const { buildExportedMenu } = await import("@/lib/menu-export"); return buildExportedMenu(restaurant, items);
}
export async function exportMenuCsv(input: { data: { restaurantId: string } }) {
  const { menuToCsv } = await import("@/lib/menu-csv"); return menuToCsv(await exportMenuJson(input));
}