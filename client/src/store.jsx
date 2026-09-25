import React, { createContext, useContext, useEffect, useState } from "react";
import { proxyPhotoUrl } from "./share.js";

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
  const [cart, setCart] = useLocalState("mboppi-cart", []);
  const [favs, setFavs] = useLocalState("mboppi-favs", []);

  const addToCart = (product, qty = 1) => {
    // Un produit DIGITAL ne s'épuise pas (le fichier ne se « consomme » pas :
    // aucun stock n'est décrémenté côté serveur) → aucun plafond de quantité.
    const max = product.is_digital ? 9999 : Math.max(1, Number(product.quantity) || 99);
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
          price: Number(product.flash_promo ? product.flash_promo.price : product.price),
          old_price: product.flash_promo ? Number(product.price) : null,
          photo: proxyPhotoUrl((product.photos && product.photos[0]) || product.image),
          country: product.shop_country || null,
          // Un produit digital ne suit pas le circuit de livraison : le panier
          // doit le savoir pour ouvrir le tunnel de paiement iKeePay (téléchargement
          // automatique) au lieu du formulaire de livraison.
          is_digital: product.is_digital === true,
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
  // Un panier enregistré AVANT l'ajout du champ `is_digital` ne connaît pas la
  // nature du produit : Cart.jsx la récupère une fois puis la pose ici —
  // de même pour le type de contenu digital (fichier ou vidéo protégée).
  const setItemDigital = (id, isDigital, digitalKind) =>
    setCart((list) =>
      list.map((i) =>
        i.id === Number(id)
          ? {
              ...i,
              is_digital: isDigital === true,
              ...(digitalKind !== undefined
                ? { digital_kind: digitalKind === "youtube" ? "youtube" : "file" }
                : {}),
            }
          : i
      )
    );

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  const isFav = (id) => favs.includes(Number(id));
  const toggleFav = (id) => {
    const nid = Number(id);
    setFavs((list) => (list.includes(nid) ? list.filter((x) => x !== nid) : [...list, nid]));
  };

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        setQty,
        removeFromCart,
        clearCart,
        setItemDigital,
        cartCount,
        cartTotal,
      }}
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
