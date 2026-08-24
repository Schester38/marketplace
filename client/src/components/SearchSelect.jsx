import React, { useEffect, useRef, useState } from "react";

export default function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "Choisir…",
  emptyLabel = "Aucun résultat",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = query
    ? options.filter((o) => (o.label || o.name || "").toLowerCase().includes(query.toLowerCase()))
    : options;

  const selected = options.find((o) => o.value === value);

  const select = (o) => {
    onChange(o.value);
    setOpen(false);
    setQuery("");
  };

  const onKey = (e) => {
    if (!open && typeof e.key === "string" && e.key.length === 1) {
      e.preventDefault();
      setQuery((q) => q + e.key);
      setOpen(true);
      setActive(0);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open) {
        e.preventDefault();
        if (filtered[active]) select(filtered[active]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div className="search-select" ref={boxRef}>
      <input
        ref={inputRef}
        className="input"
        readOnly={!open}
        placeholder={placeholder}
        value={open ? query : selected ? `${selected.flag} ${selected.label}` : ""}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          if (!open) setOpen(true);
        }}
        onKeyDown={onKey}
        onClick={() => {
          if (!open) setOpen(true);
        }}
      />
      {open && (
        <ul className="search-select-list">
          {filtered.length === 0 && <li className="search-select-empty">{emptyLabel}</li>}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              className={`${o.value === value ? "selected" : ""} ${i === active ? "active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                select(o);
              }}
            >
              <span className="ss-flag">{o.flag}</span>
              <span className="ss-name">{o.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
