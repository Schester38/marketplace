import React, { useEffect, useRef, useState } from 'react';

export default function BackToTop() {
  const [visible, setVisible] = useState(false);
  const onScroll = useRef(() => {});

  onScroll.current = () => {
    const doc = document.documentElement;
    const total = doc.scrollHeight - window.innerHeight;
    if (total <= 0) return setVisible(false);
    setVisible(window.scrollY / total >= 0.75);
  };

  useEffect(() => {
    window.addEventListener('scroll', onScroll.current, { passive: true });
    onScroll.current();
    return () => window.removeEventListener('scroll', onScroll.current);
  }, []);

  const goTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      type="button"
      className={`back-to-top${visible ? ' back-to-top-show' : ''}`}
      onClick={goTop}
      aria-label="Revenir en haut"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      ↑
    </button>
  );
}
