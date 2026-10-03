import type { CartType } from "../lib/types";
import { createContext, useContext } from "react";
export interface CartState { cart: CartType | null; error: string | null; isLoading: boolean; count: number; refresh: () => Promise<void>; add: (themeId: string) => Promise<void>; remove: (themeId: string) => Promise<void> }
export const CartContext = createContext<CartState | null>(null);
export function useCart() { const value = useContext(CartContext); if (!value) throw new Error("useCart must be used inside CartProvider"); return value; }
