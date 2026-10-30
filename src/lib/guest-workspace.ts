import type { MenuItemRow, RestaurantRow, SourceImageRow } from "@/lib/contracts/types";

export type GuestWorkspace = { restaurants: RestaurantRow[]; images: SourceImageRow[]; items: MenuItemRow[] };
export const GUEST_STORAGE_KEY = "mapsmenu_guest_workspace";
export function emptyWorkspace(): GuestWorkspace {
  return { restaurants: [], images: [], items: [] };
}
export function readWorkspace(storage: Pick<Storage, "getItem">): GuestWorkspace {
  try {
    const value = JSON.parse(storage.getItem(GUEST_STORAGE_KEY) ?? "null");
    if (value && Array.isArray(value.restaurants) && Array.isArray(value.images) && Array.isArray(value.items)) return value;
  } catch { /* Corrupted local data must not prevent opening the app. */ }
  return emptyWorkspace();
}
export function requireGuestRestaurant(workspace: GuestWorkspace, id: string): RestaurantRow {
  const restaurant = workspace.restaurants.find((row) => row.id === id);
  if (!restaurant) throw new Error("Restaurante não encontrado neste navegador");
  return restaurant;
}
export function addGuestRestaurants(workspace: GuestWorkspace, lines: string[]): RestaurantRow[] {
  const batchId = crypto.randomUUID();
  const created = lines.map((line) => line.trim()).filter(Boolean).slice(0, 50).map((line): RestaurantRow => {
    const isUrl = /^https?:\/\//i.test(line);
    const separator = line.includes(" - ") ? " - " : ", ";
    const [name, city] = line.split(separator);
    const now = new Date().toISOString();
    return { id: crypto.randomUUID(), owner_id: "guest", batch_id: batchId, name: isUrl ? "Restaurante" : name || line,
      city: isUrl ? null : city || null, maps_url: isUrl ? line : null, status: "coletando", status_detail: null, created_at: now, updated_at: now };
  });
  if (!created.length) throw new Error("Cole ao menos um link ou nome de restaurante");
  workspace.restaurants.unshift(...created);
  return created;
}