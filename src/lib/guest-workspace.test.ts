import { describe, expect, it } from "vitest";
import { addGuestRestaurants, emptyWorkspace, readWorkspace, requireGuestRestaurant } from "./guest-workspace";

describe("Workspace without login", () => {
  it("creates a restaurant without any account or session", () => {
    const workspace = emptyWorkspace();
    const [row] = addGuestRestaurants(workspace, ["Pizzaria Bella - São Paulo"]);
    expect(row?.name).toBe("Pizzaria Bella");
    expect(workspace.restaurants).toHaveLength(1);
    expect(row?.city).toBe("São Paulo");
  });
  it("does not read restaurants from another visitor", () => {
    const first = emptyWorkspace(); const [row] = addGuestRestaurants(first, ["Bella"]);
    expect(() => requireGuestRestaurant(emptyWorkspace(), row?.id ?? "missing")).toThrow();
  });
  it("restores only the current browser's saved workspace", () => {
    const workspace = emptyWorkspace(); addGuestRestaurants(workspace, ["Bella"]);
    expect(readWorkspace({ getItem: () => JSON.stringify(workspace) }).restaurants[0]?.name).toBe("Bella");
    expect(readWorkspace({ getItem: () => null }).restaurants).toEqual([]);
  });
});