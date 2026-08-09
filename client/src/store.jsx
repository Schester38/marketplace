import React, { createContext, useContext, useEffect, useState } from 'react';

const CartContext = createContext(null);
const FavContext = createContext(null);

function useLocalState(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* quota plein : ignorer */
    }
  }, [key, state]);
  return [state, setState];
}

export function StoreProvider({ children }) {
  const [cart, setCart] = useLocalState('mboppi-cart', []);
  const [favs, setFavs] = useLocalState('mboppi-favs', []);

  const addToCart = (product, qty = 1) => {
    const max = Math.max(1, Number(product.quantity) || 99);
    setCart((list) => {
      const existing = list.find((i) => i.id === Number(product.id));
      if (existing) {
        return list.map((i) =>
          i.id === existing.id ? { ...i, qty: Math.min(i.qty + qty, max) } : i
        );
      }
      return [
        ...list,
        {
          id: Number(product.id),
          name: product.name,
          price: Number(product.price),
          photo: (product.photos && product.photos[0]) || product.image || null,
          country: product.shop_country || null,
          stock: max,
          qty: Math.min(qty, max),
        },
      ];
    });
  };

  const setQty = (id, qty) =>
    setCart((list) =>
      list.map((i) =>
        i.id === Number(id) ? { ...i, qty: Math.max(1, Math.min(qty, i.stock || 99)) } : i
      )
    );

  const removeFromCart = (id) => setCart((list) => list.filter((i) => i.id !== Number(id)));
  const clearCart = () => setCart([]);

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  const isFav = (id) => favs.includes(Number(id));
  const toggleFav = (id) => {
    const nid = Number(id);
    setFavs((list) => (list.includes(nid) ? list.filter((x) => x !== nid) : [...list, nid]));
  };

  return (
    <CartContext.Provider
      value={{ cart, addToCart, setQty, removeFromCart, clearCart, cartCount, cartTotal }}
    >
      <FavContext.Provider value={{ favs, isFav, toggleFav }}>{children}</FavContext.Provider>
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}

export function useFavs() {
  return useContext(FavContext);
}
