import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";

function Stars({ value }) {
  return (
    <span className="stars stars-14" role="img" aria-label={`${Math.round(value)}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`star ${value >= i ? "on" : ""}`}>
          ★
        </span>
      ))}
    </span>
  );
}

export default function ReviewQuote({ productId, count }) {
  const { t } = useLang();
  const [quote, setQuote] = useState(null);

  useEffect(() => {
    let mounted = true;
    api
      .productReviews(productId)
      .then((d) => {
        if (!mounted) return;
        const withComment = (d.reviews || []).filter((r) => r.comment);
        if (withComment.length) {
          const top = withComment.sort((a, b) => Number(b.rating) - Number(a.rating))[0];
          setQuote(top);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [productId]);

  if (!quote || !quote.comment) return null;
  return (
    <div className="review-quote" role="note">
      <p className="review-quote-text">« {quote.comment} »</p>
      <p className="review-quote-meta">
        <Stars value={quote.rating} />
        <span>{quote.user_name || quote.buyer_name || t("Client")}</span>
        {quote.buyer_name && <span className="badge badge-verified">✓ {t("Achat vérifié")}</span>}
        {Number(count) > 1 && (
          <span className="hint"> · {t("et {n} autres avis", { n: Number(count) - 1 })}</span>
        )}
      </p>
    </div>
  );
}
