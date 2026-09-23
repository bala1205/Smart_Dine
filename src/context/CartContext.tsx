import { createContext, useContext, useMemo, useState, ReactNode, useCallback } from "react";
import type { MenuItem } from "../types/menu";

export interface CartLine {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  specialInstruction: string;
}

interface CartContextValue {
  lines: CartLine[];
  total: number;
  count: number;
  add: (item: MenuItem, quantity?: number) => void;
  remove: (menuItemId: string) => void;
  setQuantity: (menuItemId: string, quantity: number) => void;
  setInstruction: (menuItemId: string, instruction: string) => void;
  clear: () => void;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const add = useCallback((item: MenuItem, quantity = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.menuItemId === item.id);
      if (existing) {
        return prev.map((l) =>
          l.menuItemId === item.id ? { ...l, quantity: l.quantity + quantity } : l
        );
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          name: item.name,
          price: item.price,
          quantity,
          specialInstruction: "",
        },
      ];
    });
  }, []);

  const remove = useCallback((menuItemId: string) => {
    setLines((prev) => prev.filter((l) => l.menuItemId !== menuItemId));
  }, []);

  const setQuantity = useCallback((menuItemId: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.menuItemId !== menuItemId)
        : prev.map((l) => (l.menuItemId === menuItemId ? { ...l, quantity } : l))
    );
  }, []);

  const setInstruction = useCallback((menuItemId: string, instruction: string) => {
    setLines((prev) =>
      prev.map((l) =>
        l.menuItemId === menuItemId ? { ...l, specialInstruction: instruction } : l
      )
    );
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const { total, count } = useMemo(() => {
    return {
      total: lines.reduce((sum, l) => sum + l.price * l.quantity, 0),
      count: lines.reduce((sum, l) => sum + l.quantity, 0),
    };
  }, [lines]);

  const value = useMemo(
    () => ({
      lines,
      total,
      count,
      add,
      remove,
      setQuantity,
      setInstruction,
      clear,
      isOpen,
      setOpen: setIsOpen,
    }),
    [lines, total, count, add, remove, setQuantity, setInstruction, clear, isOpen]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
