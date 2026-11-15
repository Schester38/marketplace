import { Link } from "react-router-dom";
import { useLang } from "../i18n.jsx";
import { getSalesFunnelPalette } from "../salesFunnelThemes.js";

function money(value, currency) {
  return `${Number(value || 0).toLocaleString("fr-FR")} ${currency || "XAF"}`;
}

function externalUrl(url) {
  return /^https?:\/\//i.test(url || "");
}

export default function SalesFunnelPageView({
  funnel,
  preview = false,
  onEvent,
  onShare,
}) {
  const { t } = useLang();
  const palette = getSalesFunnelPalette(funnel.theme);
  const { content = {}, products = [] } = funnel;
  const actionUrl = funnel.contact_url || (products.length ? "#produits" : "");
  const external = externalUrl(actionUrl);

  return (
    <div style={{ background: palette.background, color: palette.text }}>
      <section className="tw-relative tw-overflow-hidden tw-px-5 tw-py-12 sm:tw-py-20">
        <div className="tw-absolute tw-inset-x-0 tw-top-0 tw-h-1" style={{ background: palette.accent }} />
        <div className="tw-pointer-events-none tw-absolute tw-right-[-8rem] tw-top-[-10rem] tw-h-80 tw-w-80 tw-rounded-full tw-opacity-10 tw-blur-3xl" style={{ background: palette.accent }} />
        <div className="tw-relative tw-mx-auto tw-max-w-5xl">
          <p className="tw-text-xs tw-font-bold tw-uppercase tw-tracking-[0.25em]" style={{ color: palette.accent }}>{funnel.title}</p>
          <h1 className="tw-mt-5 tw-max-w-4xl tw-text-4xl tw-font-black tw-leading-tight sm:tw-text-6xl">{content.title}</h1>
          {content.subtitle && <p className="tw-mt-6 tw-max-w-2xl tw-text-base tw-leading-7 sm:tw-text-xl sm:tw-leading-8" style={{ color: palette.muted }}>{content.subtitle}</p>}
          <div className="tw-mt-8 tw-flex tw-flex-wrap tw-items-center tw-gap-3">
            {actionUrl && (
              preview ? (
                <button type="button" className="tw-inline-flex tw-items-center tw-gap-2 tw-rounded-xl tw-px-6 tw-py-3.5 tw-text-sm tw-font-black tw-text-white tw-shadow-lg" style={{ background: palette.button }}>
                  {content.cta_label || t("Nous contacter")} <span aria-hidden="true">→</span>
                </button>
              ) : (
                <a
                  href={actionUrl}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                  onClick={() => {
                    if (funnel.contact_url) onEvent?.("contact");
                  }}
                  className="tw-inline-flex tw-items-center tw-gap-2 tw-rounded-xl tw-px-6 tw-py-3.5 tw-text-sm tw-font-black tw-text-white tw-shadow-lg hover:tw-brightness-110"
                  style={{ background: palette.button }}
                >
                  {content.cta_label || t("Nous contacter")} <span aria-hidden="true">→</span>
                </a>
              )
            )}
            {onShare && (
              <button type="button" onClick={onShare} className="tw-rounded-xl tw-border tw-px-4 tw-py-3 tw-text-sm tw-font-bold" style={{ borderColor: `${palette.accent}70`, color: palette.text }}>
                {t("Partager")}
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="tw-mx-auto tw-max-w-5xl tw-space-y-5 tw-px-5 tw-pb-16 sm:tw-pb-24">
        {(content.sections || []).map((section, index) => (
          <section
            key={`${section.title}-${index}`}
            className={`tw-grid tw-gap-4 tw-rounded-2xl tw-border tw-p-5 sm:tw-grid-cols-[70px_minmax(0,1fr)] sm:tw-gap-6 sm:tw-p-8 ${index % 2 ? "sm:tw-translate-x-5" : ""}`}
            style={{ borderColor: `${palette.accent}40`, background: palette.surface }}
          >
            <div className="tw-flex tw-h-11 tw-w-11 tw-items-center tw-justify-center tw-rounded-xl tw-text-lg tw-font-black" style={{ background: `${palette.accent}20`, color: palette.accent }}>
              {String(index + 1).padStart(2, "0")}
            </div>
            <div>
              <h2 className="tw-text-xl tw-font-bold sm:tw-text-2xl">{section.title}</h2>
              {section.body && <p className="tw-mt-3 tw-whitespace-pre-line tw-text-sm tw-leading-7 sm:tw-text-base" style={{ color: palette.muted }}>{section.body}</p>}
            </div>
          </section>
        ))}

        {products.length > 0 && (
          <section id={preview ? undefined : "produits"} className="tw-pt-10">
            <div className="tw-mb-5">
              <p className="tw-text-xs tw-font-bold tw-uppercase tw-tracking-[0.22em]" style={{ color: palette.accent }}>{t("Notre sélection")}</p>
              <h2 className="tw-mt-2 tw-text-2xl tw-font-black sm:tw-text-3xl">{t("Vos produits")}</h2>
            </div>
            <div className="tw-grid tw-gap-4 sm:tw-grid-cols-2 lg:tw-grid-cols-3">
              {products.map((product) => (
                <article key={product.id} className="tw-overflow-hidden tw-rounded-2xl tw-border" style={{ background: palette.surface, borderColor: `${palette.accent}30` }}>
                  {product.image && <img src={product.image} alt={product.name} className="tw-h-52 tw-w-full tw-object-cover" loading="lazy" />}
                  <div className="tw-p-4">
                    <h3 className="tw-line-clamp-2 tw-font-bold">{product.name}</h3>
                    {product.description && <p className="tw-mt-2 tw-line-clamp-3 tw-text-sm tw-leading-6" style={{ color: palette.muted }}>{product.description}</p>}
                    <p className="tw-mt-4 tw-font-black" style={{ color: palette.accent }}>{money(product.price, product.currency)}</p>
                    {preview ? (
                      <span className="tw-mt-4 tw-flex tw-justify-center tw-rounded-xl tw-px-4 tw-py-2.5 tw-text-sm tw-font-bold tw-text-white" style={{ background: palette.button }}>
                        {t("Voir le produit")}
                      </span>
                    ) : (
                      <Link
                        to={`/produit/${product.id}`}
                        onClick={() => onEvent?.("product", product.id)}
                        className="tw-mt-4 tw-flex tw-justify-center tw-rounded-xl tw-px-4 tw-py-2.5 tw-text-sm tw-font-bold tw-text-white hover:tw-brightness-110"
                        style={{ background: palette.button }}
                      >
                        {t("Voir le produit")}
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {funnel.contact_url && (
          <section className="tw-rounded-2xl tw-p-6 tw-text-center sm:tw-p-10" style={{ background: palette.surfaceAlt }}>
            <h2 className="tw-text-2xl tw-font-black">{content.cta_label || t("Nous contacter")}</h2>
            {preview ? (
              <span className="tw-mt-5 tw-inline-flex tw-rounded-xl tw-px-6 tw-py-3 tw-font-bold tw-text-white" style={{ background: palette.button }}>
                {t("Nous contacter")} →
              </span>
            ) : (
              <a
                href={funnel.contact_url}
                target={externalUrl(funnel.contact_url) ? "_blank" : undefined}
                rel={externalUrl(funnel.contact_url) ? "noopener noreferrer" : undefined}
                onClick={() => onEvent?.("contact")}
                className="tw-mt-5 tw-inline-flex tw-rounded-xl tw-px-6 tw-py-3 tw-font-bold tw-text-white"
                style={{ background: palette.button }}
              >
                {t("Nous contacter")} →
              </a>
            )}
          </section>
        )}
      </div>
      <footer className="tw-border-t tw-px-5 tw-py-6 tw-text-center tw-text-xs" style={{ borderColor: `${palette.accent}25`, color: palette.muted }}>
        MboppiShop · {funnel.title}
      </footer>
    </div>
  );
}
