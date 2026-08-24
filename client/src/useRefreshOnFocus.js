import { useEffect, useRef } from "react";

const GAP = 3000;

export function useRefreshOnFocus(fetchFn) {
  const fnRef = useRef(fetchFn);
  fnRef.current = fetchFn;
  const last = useRef(0);
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last.current < GAP) return;
      last.current = now;
      fnRef.current();
    };
    window.addEventListener("focus", onShow);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.removeEventListener("focus", onShow);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);
}
