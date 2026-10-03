/* This effect intentionally starts the authenticated cart fetch. */
/* oxlint-disable react/set-state-in-effect */
import type { CartType } from "../lib/types";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { useAppAuth } from "./auth-store";
import { CartContext, type CartState } from "./cart-store";
import { useToast } from "./toast-store";
export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAppAuth(); const { notify } = useToast(); const [cart, setCart] = useState<CartType | null>(null); const [error, setError] = useState<string | null>(null); const [isLoading, setLoading] = useState(false);
  const canPurchase = Boolean(user && user.role !== "admin");
  const refresh = useCallback(async () => { if (!canPurchase) { setCart(null); setError(null); return; } setLoading(true); setError(null); try { setCart(await api.get<CartType>("/cart")); } catch (caught) { setError(caught instanceof Error ? caught.message : "We couldn’t load your cart"); throw caught; } finally { setLoading(false); } }, [canPurchase]);
  useEffect(() => { if (canPurchase) void refresh().catch(() => undefined); else { setCart(null); setError(null); } }, [canPurchase, refresh]);
  const mutate = useCallback(async (promise: Promise<CartType>, message?: string) => { setLoading(true); try { setCart(await promise); if (message) notify(message); } finally { setLoading(false); } }, [notify]);
  const activeCart = canPurchase ? cart : null;
  const value = useMemo<CartState>(() => ({ cart: activeCart, error, isLoading, count: activeCart?.items.length ?? 0, refresh, add: (id) => mutate(api.post<CartType>("/cart/items", { themeId: id }), "Added to cart"), remove: (id) => mutate(api.delete<CartType>(`/cart/items/${id}`), "Removed from cart") }), [activeCart, error, isLoading, refresh, mutate]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
