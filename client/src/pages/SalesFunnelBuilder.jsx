import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import SalesFunnelPageView from "../components/SalesFunnelPageView.jsx";
import { api } from "../api.js";
import { BASE_URL } from "../config.js";
import { useLang } from "../i18n.jsx";
import { compressImage } from "../utils.js";
import { SALES_FUNNEL_THEMES, getSalesFunnelPalette } from "../salesFunnelThemes.js";

const GUEST_FUNNELS_KEY = "mboppi_guest_sales_funnels";
const EMPTY_BRIEF = {
  business_name: "",
  offer: "",
  audience: "",
  goal: "",
  style: "",
  design_notes: "",
};
const EMPTY_CONTENT = { title: "", subtitle: "", cta_label: "", sections: [] };
const FIELD_CLASS =
  "sales-funnel-field tw-mt-1 tw-w-full tw-rounded-xl tw-px-3 tw-py-2.5 tw-text-sm focus:tw-outline-none focus:tw-ring-2";
const CARD_CLASS = "sales-funnel-card tw-rounded-2xl tw-border tw-p-4";

function readGuestFunnels() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(GUEST_FUNNELS_KEY) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved
      .filter((entry) => Number.isSafeInteger(Number(entry?.id)) && /^[A-Za-z0-9_-]{43}$/.test(entry?.token || "") && entry?.funnel)
      .map((entry) => ({
        ...entry.funnel,
        id: Number(entry.id),
        guest_access_token: entry.token,
        is_guest: true,
      }));
  } catch {
    return [];
  }
}

function guestTokenFor(id) {
  return readGuestFunnels().find((item) => item.id === Number(id))?.guest_access_token || "";
}

function rememberGuestFunnel(funnel) {
  if (!funnel?.guest_access_token) return true;
  try {
    const saved = JSON.parse(window.localStorage.getItem(GUEST_FUNNELS_KEY) || "[]");
    const current = Array.isArray(saved) ? saved : [];
    const entry = {
      id: Number(funnel.id),
      token: funnel.guest_access_token,
      funnel: Object.fromEntries(
        Object.entries(funnel).filter(([key]) => key !== "guest_access_token" && key !== "is_guest")
      ),
    };
    window.localStorage.setItem(
      GUEST_FUNNELS_KEY,
      JSON.stringify([entry, ...current.filter((item) => Number(item?.id) !== entry.id)].slice(0, 20))
    );
    return true;
  } catch {
    return false;
  }
}

function makeSlug(value, id) {
  const slug = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  return slug || (id ? `tunnel-${id}` : "");
}

function productImage(product) {
  const first = Array.isArray(product.photos) ? product.photos[0] : null;
  return product.image || (typeof first === "string" ? first : first?.thumb) || "";
}

function ProductPicker({ products, selected, onToggle, t, unavailable = false }) {
  if (unavailable) {
    return <p className="tw-mt-3 tw-rounded-xl tw-bg-amber-50 tw-p-3 tw-text-sm tw-text-amber-900">{t("Produits disponibles uniquement pour les comptes Boutique et Créateur.")}</p>;
  }
  if (!products.length) {
    return <p className="tw-mt-3 tw-rounded-xl tw-bg-slate-50 tw-p-3 tw-text-sm tw-text-slate-600">{t("Aucun produit disponible pour le moment.")}</p>;
  }
  return (
    <div className="tw-mt-3 tw-grid tw-gap-2 sm:tw-grid-cols-2">
      {products.map((product) => {
        const checked = selected.includes(Number(product.id));
        const disabled = !checked && selected.length >= 10;
        const image = productImage(product);
        return (
          <label
            key={product.id}
            className={`tw-flex tw-min-w-0 tw-cursor-pointer tw-items-center tw-gap-3 tw-rounded-xl tw-border tw-p-3 ${
              checked ? "tw-border-emerald-500 tw-bg-emerald-50" : "tw-border-slate-200"
            } ${disabled ? "tw-cursor-not-allowed tw-opacity-50" : ""}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => onToggle(Number(product.id))}
              className="tw-h-4 tw-w-4 tw-accent-emerald-600"
            />
            {image ? (
              <img src={image} alt="" className="tw-h-12 tw-w-12 tw-shrink-0 tw-rounded-lg tw-object-cover" />
            ) : (
              <span className="tw-flex tw-h-12 tw-w-12 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-lg tw-bg-slate-100">📦</span>
            )}
            <span className="tw-min-w-0">
              <span className="tw-block tw-truncate tw-text-sm tw-font-semibold tw-text-slate-900">{product.name}</span>
              <span className="tw-block tw-truncate tw-text-xs tw-text-slate-500">
                {Number(product.price || 0).toLocaleString("fr-FR")} {product.currency || "XAF"}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function PosterUploader({ value, busy, onSelect, onRemove, t }) {
  return (
    <div className="tw-rounded-xl tw-border tw-border-dashed tw-border-slate-300 tw-p-3">
      <p className="tw-text-sm tw-font-semibold tw-text-slate-700">{t("Affiche du produit ou du service")}</p>
      <p className="tw-mt-1 tw-text-xs tw-text-slate-500">{t("Ajoutez une image qui sera affichée sur votre page de vente.")}</p>
      {value && (
        <img
          src={value}
          alt={t("Aperçu de l’affiche")}
          className="tw-mt-3 tw-max-h-56 tw-w-full tw-rounded-xl tw-object-cover"
        />
      )}
      <div className="tw-mt-3 tw-flex tw-flex-wrap tw-gap-2">
        <label className="tw-inline-flex tw-cursor-pointer tw-items-center tw-rounded-lg tw-bg-slate-900 tw-px-3 tw-py-2 tw-text-sm tw-font-bold tw-text-white">
          {busy ? t("Téléversement…") : t(value ? "Changer l’image" : "Ajouter une image")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onSelect(file);
            }}
            className="tw-sr-only"
          />
        </label>
        {value && (
          <button type="button" disabled={busy} onClick={onRemove} className="tw-rounded-lg tw-border tw-border-slate-300 tw-px-3 tw-py-2 tw-text-sm tw-font-semibold tw-text-slate-700 disabled:tw-opacity-50">
            {t("Supprimer l’image")}
          </button>
        )}
      </div>
    </div>
  );
}

export default function SalesFunnelBuilder() {
  const { t } = useLang();
  const [funnels, setFunnels] = useState([]);
  const [products, setProducts] = useState([]);
  const [productAccessUnavailable, setProductAccessUnavailable] = useState(false);
  const [loadingFunnels, setLoadingFunnels] = useState(true);
  const [guestMode, setGuestMode] = useState(false);
  const [current, setCurrent] = useState(null);
  const [brief, setBrief] = useState(EMPTY_BRIEF);
  const [content, setContent] = useState(EMPTY_CONTENT);
  const [contactUrl, setContactUrl] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [posterPreview, setPosterPreview] = useState("");
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const [theme, setTheme] = useState("ocean");
  const [productIds, setProductIds] = useState([]);
  const [slug, setSlug] = useState("");
  const [step, setStep] = useState(1);
  const [previewMode, setPreviewMode] = useState("desktop");
  const [metrics, setMetrics] = useState(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [metricsError, setMetricsError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrError, setQrError] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    api.salesFunnelsMine()
      .then((data) => {
        if (!active) return;
        const accountFunnels = Array.isArray(data.funnels) ? data.funnels : [];
        const guests = readGuestFunnels();
        const accountIds = new Set(accountFunnels.map((item) => Number(item.id)));
        setGuestMode(false);
        setFunnels([...guests.filter((item) => !accountIds.has(Number(item.id))), ...accountFunnels]);
        api.myProducts()
          .then((productsData) => {
            if (active) setProducts(Array.isArray(productsData.products) ? productsData.products : Array.isArray(productsData) ? productsData : []);
          })
          .catch((requestError) => {
            if (!active) return;
            if (requestError.status === 403) {
              setProductAccessUnavailable(true);
              return;
            }
            setError(t("Impossible de charger vos produits."));
          });
      })
      .catch((requestError) => {
        if (!active) return;
        if (requestError.status === 401) {
          setGuestMode(true);
          setFunnels(readGuestFunnels());
        } else {
          setError(t("Impossible de charger vos tunnels."));
        }
      })
      .finally(() => {
        if (active) setLoadingFunnels(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  const selectFunnel = (funnel) => {
    const savedFunnel = {
      ...funnel,
      guest_access_token: funnel.guest_access_token || guestTokenFor(funnel.id),
    };
    setStep(1);
    setCurrent(savedFunnel);
    setBrief({ ...EMPTY_BRIEF, ...(savedFunnel.brief || {}) });
    setContent({ ...EMPTY_CONTENT, ...(savedFunnel.content || {}) });
    setContactUrl(savedFunnel.contact_url || "");
    setWhatsappPhone(savedFunnel.whatsapp_phone || "");
    setPosterUrl(savedFunnel.poster_url || "");
    setPosterPreview(savedFunnel.poster_url || "");
    setTheme(savedFunnel.theme || "ocean");
    setProductIds((savedFunnel.product_ids || []).map(Number));
    setSlug(savedFunnel.slug || makeSlug(savedFunnel.content?.title || savedFunnel.title, savedFunnel.id));
    setError("");
    setNotice("");
    setQrDataUrl("");
    setQrError("");
  };

  const startNew = () => {
    setStep(1);
    setCurrent(null);
    setBrief(EMPTY_BRIEF);
    setContent(EMPTY_CONTENT);
    setContactUrl("");
    setWhatsappPhone("");
    setPosterUrl("");
    setPosterPreview("");
    setTheme("ocean");
    setProductIds([]);
    setSlug("");
    setError("");
    setNotice("");
    setQrDataUrl("");
    setQrError("");
  };

  const toggleProduct = (id) => {
    setProductIds((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id]
    );
  };

  const continueStep = () => {
    setError("");
    if (step === 1 && (!brief.business_name.trim() || !brief.offer.trim())) {
      setError(t("Renseignez le nom de votre activité et votre offre."));
      return;
    }
    setStep((value) => Math.min(3, value + 1));
  };

  const updateFunnelList = (funnel) => {
    const previous = funnels.find((item) => Number(item.id) === Number(funnel.id));
    const accessToken =
      funnel.guest_access_token ||
      current?.guest_access_token ||
      previous?.guest_access_token ||
      guestTokenFor(funnel.id);
    const nextFunnel = {
      ...funnel,
      ...(accessToken ? { guest_access_token: accessToken, is_guest: true } : {}),
    };
    const savedLocally = !accessToken || rememberGuestFunnel(nextFunnel);
    if (!savedLocally) {
      setNotice(t("Le navigateur n’a pas pu mémoriser l’accès à ce tunnel. Gardez cette page ouverte."));
    }
    setCurrent(nextFunnel);
    setFunnels((items) => [nextFunnel, ...items.filter((item) => item.id !== nextFunnel.id)]);
    setContent({ ...EMPTY_CONTENT, ...(nextFunnel.content || {}) });
    setBrief({ ...EMPTY_BRIEF, ...(nextFunnel.brief || {}) });
    setContactUrl(nextFunnel.contact_url || "");
    setWhatsappPhone(nextFunnel.whatsapp_phone || "");
    setPosterUrl(nextFunnel.poster_url || "");
    setPosterPreview(nextFunnel.poster_url || "");
    setTheme(nextFunnel.theme || "ocean");
    setProductIds((nextFunnel.product_ids || []).map(Number));
    return savedLocally;
  };

  const handlePosterFile = async (file) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError(t("Choisissez une image JPEG, PNG ou WebP."));
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError(t("L’image est trop volumineuse. Choisissez une image plus légère."));
      return;
    }
    setError("");
    setUploadingPoster(true);
    try {
      const image = await compressImage(file, 1600, 0.78);
      if (image.length > 2_500_000) {
        throw new Error("L’image est trop volumineuse. Choisissez une image plus légère.");
      }
      setPosterPreview(image);
      const uploaded = await api.uploadSalesFunnelPoster(image);
      setPosterUrl(uploaded.poster_url);
      setPosterPreview(uploaded.poster_url);
      setNotice(t("Affiche téléversée."));
    } catch (requestError) {
      setPosterPreview(posterUrl);
      setError(t(requestError.message) || requestError.message);
    } finally {
      setUploadingPoster(false);
    }
  };

  const handleGenerate = async (event) => {
    event.preventDefault();
    if (step < 3) {
      continueStep();
      return;
    }
    if (!brief.business_name.trim() || !brief.offer.trim()) {
      setStep(1);
      setError(t("Renseignez le nom de votre activité et votre offre."));
      return;
    }
    setError("");
    setNotice("");
    setBusy("generate");
    try {
      const generate = guestMode ? api.generateGuestSalesFunnel : api.generateSalesFunnel;
      const data = await generate({
        brief,
        theme,
        contact_url: contactUrl,
        whatsapp_phone: whatsappPhone,
        poster_url: posterUrl,
        product_ids: productIds,
      });
      const funnel = data.access_token
        ? { ...data.funnel, guest_access_token: data.access_token, is_guest: true }
        : data.funnel;
      const savedLocally = updateFunnelList(funnel);
      setSlug(makeSlug(funnel.content?.title || funnel.title, funnel.id));
      setNotice(savedLocally
        ? t("Le tunnel a été généré. Vous pouvez maintenant modifier chaque texte.")
        : t("Le navigateur n’a pas pu mémoriser l’accès à ce tunnel. Gardez cette page ouverte."));
    } catch (requestError) {
      setError(t(requestError.message) || requestError.message);
    } finally {
      setBusy("");
    }
  };

  const payload = () => ({
    brief,
    content,
    theme,
    contact_url: contactUrl,
    whatsapp_phone: whatsappPhone,
    poster_url: posterUrl,
    product_ids: productIds,
  });

  const handleSave = async () => {
    if (!current) return;
    setError("");
    setNotice("");
    setBusy("save");
    try {
      const data = current.guest_access_token
        ? await api.saveGuestSalesFunnel(current.id, current.guest_access_token, payload())
        : await api.saveSalesFunnel(current.id, payload());
      const savedLocally = updateFunnelList(data.funnel);
      setNotice(savedLocally
        ? t("Brouillon enregistré.")
        : t("Le navigateur n’a pas pu mémoriser l’accès à ce tunnel. Gardez cette page ouverte."));
    } catch (requestError) {
      setError(t(requestError.message) || requestError.message);
    } finally {
      setBusy("");
    }
  };

  const handlePublish = async () => {
    if (!current) return;
    setError("");
    setNotice("");
    setBusy("publish");
    try {
      const saved = current.guest_access_token
        ? await api.saveGuestSalesFunnel(current.id, current.guest_access_token, payload())
        : await api.saveSalesFunnel(current.id, payload());
      const saveStoredLocally = updateFunnelList(saved.funnel);
      const publish = current.guest_access_token
        ? api.publishGuestSalesFunnel
        : api.publishSalesFunnel;
      const result = await publish(current.id, ...(current.guest_access_token ? [current.guest_access_token] : []), {
        published: !current.is_published,
        slug: slug || makeSlug(content.title, current.id),
      });
      const publishStoredLocally = updateFunnelList(result.funnel);
      setSlug(result.funnel.slug || slug);
      setNotice(saveStoredLocally && publishStoredLocally
        ? t(result.funnel.is_published ? "Tunnel publié." : "Tunnel dépublié.")
        : t("Le navigateur n’a pas pu mémoriser l’accès à ce tunnel. Gardez cette page ouverte."));
    } catch (requestError) {
      setError(t(requestError.message) || requestError.message);
    } finally {
      setBusy("");
    }
  };

  const copyPublicLink = async () => {
    const url = `${BASE_URL}/tunnel/${current.slug}`;
    if (!navigator.clipboard?.writeText) {
      setError(t("Copie indisponible dans ce navigateur."));
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice(t("Lien copié."));
    } catch {
      setError(t("Copie indisponible dans ce navigateur."));
    }
  };

  const sharePublicLink = () => {
    const url = `${BASE_URL}/tunnel/${current.slug}`;
    const shareData = {
      title: current.content?.title || current.title,
      text: current.content?.subtitle || current.title,
      url,
    };
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${shareData.title}\n${shareData.text}\n${url}`)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const generateQrCode = async () => {
    setQrError("");
    setQrLoading(true);
    try {
      const QR = await import("qrcode");
      const dataUrl = await QR.toDataURL(`${BASE_URL}/tunnel/${current.slug}`, {
        width: 320,
        margin: 1,
        errorCorrectionLevel: "M",
      });
      setQrDataUrl(dataUrl);
    } catch {
      setQrError(t("Impossible de créer le QR code."));
    } finally {
      setQrLoading(false);
    }
  };

  useEffect(() => {
    if (!current?.id || !current.is_published) {
      setMetrics(null);
      setMetricsError("");
      return undefined;
    }
    let active = true;
    setLoadingMetrics(true);
    setMetrics(null);
    setMetricsError("");
    const loadMetrics = current.guest_access_token
      ? api.guestSalesFunnelMetrics(current.id, current.guest_access_token)
      : api.salesFunnelMetrics(current.id);
    loadMetrics
      .then((data) => {
        if (active) setMetrics(data);
      })
      .catch(() => {
        if (active) setMetricsError(t("Impossible de charger les statistiques."));
      })
      .finally(() => {
        if (active) setLoadingMetrics(false);
      });
    return () => {
      active = false;
    };
  }, [current?.id, current?.is_published, current?.guest_access_token, t]);

  const palette = getSalesFunnelPalette(theme);
  const previewFunnel = current
    ? {
        title: brief.business_name || current.title,
        content,
        contact_url: contactUrl,
        whatsapp_phone: whatsappPhone,
        poster_url: posterPreview || posterUrl,
        theme,
        products: products
          .filter((product) => productIds.includes(Number(product.id)))
          .map((product) => ({
            id: Number(product.id),
            name: product.name,
            description: product.description || "",
            price: product.price,
            currency: product.currency || "XAF",
            image: productImage(product),
          })),
      }
    : null;

  return (
    <main className="sales-funnel-page tw-min-h-screen tw-bg-slate-50 tw-px-3 tw-py-8 sm:tw-px-6 lg:tw-py-12">
      <Seo title={`${t("Tunnel de Vente")} | MboppiShop`} description={t("Créez un tunnel de vente à votre image")} noindex />
      <div className="tw-mx-auto tw-max-w-6xl">
        <header className="tw-mb-8 tw-rounded-3xl tw-bg-gradient-to-br tw-from-slate-950 tw-via-slate-800 tw-to-emerald-950 tw-p-6 tw-text-white sm:tw-p-9">
          <p className="tw-text-xs tw-font-bold tw-uppercase tw-tracking-[0.2em] tw-text-emerald-300">MboppiShop · {t("Tunnel de Vente")}</p>
          <h1 className="tw-mt-3 tw-max-w-3xl tw-text-3xl tw-font-black sm:tw-text-4xl">{t("Créez un tunnel de vente à votre image")}</h1>
          <p className="tw-mt-3 tw-max-w-2xl tw-text-sm tw-leading-6 tw-text-slate-200 sm:tw-text-base">{t("Décrivez votre activité, choisissez vos produits et laissez l’IA préparer une page de vente modifiable.")}</p>
        </header>

        {(error || notice) && (
          <div
            role={error ? "alert" : "status"}
            className={`tw-mb-5 tw-rounded-xl tw-p-3 tw-text-sm ${error ? "tw-bg-rose-50 tw-text-rose-800" : "tw-bg-emerald-50 tw-text-emerald-800"}`}
          >
            {error || notice}
          </div>
        )}

        {(guestMode || Boolean(current?.guest_access_token)) && (
          <p className="tw-mb-5 tw-rounded-xl tw-border tw-border-amber-200 tw-bg-amber-50 tw-p-3 tw-text-sm tw-leading-6 tw-text-amber-900">
            {t("Sans compte, le code d’accès à vos tunnels est conservé sur cet appareil. Ne videz pas les données du navigateur, sinon vous ne pourrez plus les modifier.")}
          </p>
        )}

        <div className="tw-grid tw-items-start tw-gap-6 lg:tw-grid-cols-[280px_minmax(0,1fr)]">
          <aside className={`${CARD_CLASS} tw-static lg:tw-sticky lg:tw-top-24`}>
            <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
              <h2 className="tw-font-bold tw-text-slate-900">{t("Mes tunnels")}</h2>
              <button type="button" onClick={startNew} className="tw-rounded-lg tw-bg-emerald-700 tw-px-3 tw-py-2 tw-text-xs tw-font-bold tw-text-white hover:tw-bg-emerald-800">
                + {t("Créer un tunnel")}
              </button>
            </div>
            {loadingFunnels ? (
              <p className="tw-mt-4 tw-text-sm tw-text-slate-500">{t("Chargement…")}</p>
            ) : funnels.length ? (
              <div className="tw-mt-4 tw-space-y-2">
                {funnels.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => selectFunnel(item)}
                    className={`tw-w-full tw-rounded-xl tw-border tw-p-3 tw-text-left ${
                      current?.id === item.id ? "tw-border-emerald-500 tw-bg-emerald-50" : "tw-border-slate-200 hover:tw-bg-slate-50"
                    }`}
                  >
                    <span className="tw-block tw-truncate tw-text-sm tw-font-semibold tw-text-slate-900">{item.content?.title || item.title}</span>
                    <span className="tw-mt-1 tw-block tw-text-xs tw-text-slate-500">{item.is_published ? t("Tunnel publié.") : t("Brouillon enregistré.")}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="tw-mt-4 tw-text-sm tw-leading-6 tw-text-slate-500">{t("Aucun tunnel enregistré.")} {t("Choisissez un tunnel existant ou décrivez-en un nouveau.")}</p>
            )}
          </aside>

          <section className="tw-space-y-5">
            {!current ? (
              <form onSubmit={handleGenerate} className={`${CARD_CLASS} sales-funnel-form-card tw-space-y-5`}>
                <div>
                  <h2 className="tw-text-xl tw-font-bold tw-text-slate-900">{t("Nouveau tunnel")}</h2>
                  <p className="tw-mt-1 tw-text-sm tw-text-slate-500">{t("Trois étapes simples pour préparer votre page.")}</p>
                </div>
                <ol className="tw-grid tw-list-none tw-grid-cols-3 tw-gap-2" aria-label={t("Progression de création")}>
                  {[
                    t("Votre offre"),
                    t("Style et audience"),
                    t("Contact et produits"),
                  ].map((label, index) => (
                    <li key={label}>
                      <button
                        type="button"
                        disabled={index + 1 > step}
                        onClick={() => setStep(index + 1)}
                        aria-current={step === index + 1 ? "step" : undefined}
                        className={`tw-w-full tw-rounded-xl tw-border tw-p-2 tw-text-left tw-text-xs tw-font-bold sm:tw-p-3 ${
                          step === index + 1
                            ? "tw-border-emerald-600 tw-bg-emerald-50 tw-text-emerald-900"
                            : index + 1 < step
                              ? "tw-border-emerald-200 tw-bg-white tw-text-emerald-800"
                              : "tw-border-slate-200 tw-bg-slate-50 tw-text-slate-400"
                        } disabled:tw-cursor-default`}
                      >
                        <span className="tw-block tw-text-[10px] tw-uppercase tw-tracking-wider">{t("Étape")} {index + 1}</span>
                        <span className="tw-mt-1 tw-block">{label}</span>
                      </button>
                    </li>
                  ))}
                </ol>

                {step === 1 && (
                  <div className="tw-space-y-4">
                    <label className="tw-block tw-text-sm tw-font-semibold tw-text-slate-700">
                      {t("Nom de l’activité ou de la marque")} *
                      <input className={FIELD_CLASS} required maxLength={100} value={brief.business_name} onChange={(event) => setBrief({ ...brief, business_name: event.target.value })} />
                    </label>
                    <label className="tw-block tw-text-sm tw-font-semibold tw-text-slate-700">
                      {t("Décrivez le produit ou le service à vendre")} *
                      <textarea className={`${FIELD_CLASS} tw-min-h-28`} required maxLength={1200} value={brief.offer} onChange={(event) => setBrief({ ...brief, offer: event.target.value })} />
                    </label>
                    <div className="tw-flex tw-flex-wrap tw-gap-2">
                      {[
                        ["Exemple : une formation", t("Je propose une formation pratique avec des modules, des exercices et un accompagnement.")],
                        ["Exemple : un produit local", t("Je vends des produits fabriqués localement et disponibles à la commande.")],
                        ["Exemple : un service", t("J’aide les petites entreprises à améliorer leur présence en ligne.")],
                      ].map(([label, offer]) => (
                        <button key={label} type="button" onClick={() => setBrief({ ...brief, offer })} className="tw-rounded-full tw-border tw-border-slate-300 tw-px-3 tw-py-1.5 tw-text-xs tw-font-semibold tw-text-slate-600 hover:tw-border-emerald-600 hover:tw-text-emerald-800">
                          {t(label)}
                        </button>
                      ))}
                    </div>
                    <p className="tw-rounded-xl tw-bg-slate-50 tw-p-3 tw-text-xs tw-leading-5 tw-text-slate-600">{t("L’IA n’inventera pas de prix, de résultats garantis ni de témoignages.")}</p>
                  </div>
                )}

                {step === 2 && (
                  <div className="tw-space-y-4">
                    <label className="tw-block tw-text-sm tw-font-semibold tw-text-slate-700">
                      {t("À qui s’adresse cette offre ?")}
                      <input className={FIELD_CLASS} maxLength={300} value={brief.audience} onChange={(event) => setBrief({ ...brief, audience: event.target.value })} />
                    </label>
                    <div>
                      <label className="tw-block tw-text-sm tw-font-semibold tw-text-slate-700">{t("Objectif de la page")}</label>
                      <div className="tw-mt-2 tw-flex tw-flex-wrap tw-gap-2">
                        {[
                          "Vendre mes produits",
                          "Recevoir des demandes",
                          "Présenter une formation",
                        ].map((goal) => (
                          <button key={goal} type="button" onClick={() => setBrief({ ...brief, goal })} className={`tw-rounded-full tw-border tw-px-3 tw-py-2 tw-text-xs tw-font-semibold ${brief.goal === goal ? "tw-border-emerald-600 tw-bg-emerald-50 tw-text-emerald-900" : "tw-border-slate-300 tw-text-slate-600"}`}>
                            {t(goal)}
                          </button>
                        ))}
                      </div>
                      <input className={FIELD_CLASS} aria-label={t("Objectif personnalisé")} placeholder={t("Vente de produits et services")} maxLength={200} value={brief.goal} onChange={(event) => setBrief({ ...brief, goal: event.target.value })} />
                    </div>
                    <label className="tw-block tw-text-sm tw-font-semibold tw-text-slate-700">
                      {t("Ton rédactionnel")}
                      <input className={FIELD_CLASS} placeholder={t("Ex. professionnel, chaleureux, direct")} maxLength={200} value={brief.style} onChange={(event) => setBrief({ ...brief, style: event.target.value })} />
                    </label>
                    <label className="tw-block tw-text-sm tw-font-semibold tw-text-slate-700">
                      {t("Instructions de design")}
                      <textarea className={`${FIELD_CLASS} tw-min-h-20`} placeholder={t("Ex. couleurs, ambiance, style des images…")} maxLength={500} value={brief.design_notes} onChange={(event) => setBrief({ ...brief, design_notes: event.target.value })} />
                    </label>
                    <label className="tw-block tw-text-sm tw-font-semibold tw-text-slate-700">
                      {t("Thème visuel")}
                      <select className={FIELD_CLASS} value={theme} onChange={(event) => setTheme(event.target.value)}>
                        {SALES_FUNNEL_THEMES.map((option) => <option key={option.id} value={option.id}>{t(option.label)}</option>)}
                      </select>
                    </label>
                  </div>
                )}

                {step === 3 && (
                  <div className="tw-space-y-5">
                    <PosterUploader
                      value={posterPreview}
                      busy={uploadingPoster}
                      onSelect={handlePosterFile}
                      onRemove={() => {
                        setPosterUrl("");
                        setPosterPreview("");
                      }}
                      t={t}
                    />
                    <label className="tw-block tw-text-sm tw-font-semibold tw-text-slate-700">
                      {t("Lien de contact (WhatsApp, site, e-mail ou téléphone)")}
                      <input className={FIELD_CLASS} placeholder="https://wa.me/237..." value={contactUrl} onChange={(event) => setContactUrl(event.target.value)} />
                    </label>
                    <label className="tw-block tw-text-sm tw-font-semibold tw-text-slate-700">
                      {t("Numéro WhatsApp (indicatif pays inclus)")}
                      <input
                        className={FIELD_CLASS}
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="+237 6XX XX XX XX"
                        maxLength={40}
                        value={whatsappPhone}
                        onChange={(event) => setWhatsappPhone(event.target.value)}
                      />
                      <span className="tw-mt-1 tw-block tw-text-xs tw-font-normal tw-text-slate-500">
                        {t("Saisissez le numéro avec l’indicatif du pays, par exemple +237 6XX XX XX XX. Le bouton ouvrira WhatsApp.")}
                      </span>
                    </label>
                    <div>
                      <h3 className="tw-text-sm tw-font-bold tw-text-slate-800">{t("Sélection des produits")}</h3>
                      <p className="tw-mt-1 tw-text-xs tw-text-slate-500">{t("Sélectionnez un ou plusieurs produits (10 maximum).")}</p>
                      <ProductPicker products={products} selected={productIds} onToggle={toggleProduct} t={t} unavailable={guestMode || productAccessUnavailable} />
                    </div>
                    <p className="tw-rounded-xl tw-bg-slate-50 tw-p-3 tw-text-xs tw-leading-5 tw-text-slate-600">{t("Vous pouvez publier sans produit Mboppi en ajoutant une affiche et un moyen de contact, comme votre numéro WhatsApp.")}</p>
                  </div>
                )}

                <div className="sales-funnel-sticky-actions">
                  {step > 1 && (
                    <button type="button" disabled={busy !== ""} onClick={() => setStep((value) => Math.max(1, value - 1))} className="tw-rounded-xl tw-border tw-border-slate-300 tw-bg-white tw-px-4 tw-py-3 tw-text-sm tw-font-bold tw-text-slate-700 disabled:tw-opacity-50">
                      {t("Précédent")}
                    </button>
                  )}
                  {step < 3 ? (
                    <button type="button" onClick={continueStep} className="tw-ml-auto tw-rounded-xl tw-bg-emerald-700 tw-px-5 tw-py-3 tw-text-sm tw-font-bold tw-text-white hover:tw-bg-emerald-800">
                      {t("Continuer")} →
                    </button>
                  ) : (
                    <button type="submit" disabled={busy !== "" || uploadingPoster || loadingFunnels} className="tw-ml-auto tw-w-full tw-rounded-xl tw-bg-emerald-700 tw-px-5 tw-py-3 tw-font-bold tw-text-white hover:tw-bg-emerald-800 disabled:tw-cursor-wait disabled:tw-opacity-60 sm:tw-w-auto">
                      {loadingFunnels ? t("Chargement…") : busy === "generate" ? t("Génération…") : `✨ ${t("Générer mon tunnel")}`}
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <div className="tw-space-y-5">
                <section className={`${CARD_CLASS} tw-space-y-4`}>
                  <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
                    <div>
                      <p className="tw-text-xs tw-font-bold tw-uppercase tw-tracking-widest tw-text-emerald-700">{t("Éditeur de page")}</p>
                      <h2 className="tw-mt-1 tw-text-xl tw-font-bold tw-text-slate-900">{current.content?.title || current.title}</h2>
                    </div>
                    <button type="button" onClick={startNew} className="tw-rounded-lg tw-border tw-border-slate-300 tw-px-3 tw-py-2 tw-text-sm tw-font-semibold tw-text-slate-700 hover:tw-bg-slate-50">{t("Créer un autre tunnel")}</button>
                  </div>
                  <div className="tw-grid tw-gap-4 sm:tw-grid-cols-2">
                    <label className="tw-text-sm tw-font-semibold tw-text-slate-700">
                      {t("Titre principal")}
                      <input className={FIELD_CLASS} maxLength={120} value={content.title} onChange={(event) => {
                        const nextTitle = event.target.value;
                        setContent({ ...content, title: nextTitle });
                        if (!slug || slug === makeSlug(content.title, current.id)) setSlug(makeSlug(nextTitle, current.id));
                      }} />
                    </label>
                    <label className="tw-text-sm tw-font-semibold tw-text-slate-700">
                      {t("Texte du bouton")}
                      <input className={FIELD_CLASS} maxLength={60} value={content.cta_label} onChange={(event) => setContent({ ...content, cta_label: event.target.value })} />
                    </label>
                  </div>
                  <label className="tw-block tw-text-sm tw-font-semibold tw-text-slate-700">
                    {t("Sous-titre")}
                    <textarea className={`${FIELD_CLASS} tw-min-h-20`} maxLength={400} value={content.subtitle} onChange={(event) => setContent({ ...content, subtitle: event.target.value })} />
                  </label>
                  <label className="tw-block tw-text-sm tw-font-semibold tw-text-slate-700">
                    {t("Lien de contact (WhatsApp, site, e-mail ou téléphone)")}
                    <input className={FIELD_CLASS} value={contactUrl} onChange={(event) => setContactUrl(event.target.value)} />
                  </label>
                  <label className="tw-block tw-text-sm tw-font-semibold tw-text-slate-700">
                    {t("Numéro WhatsApp (indicatif pays inclus)")}
                    <input
                      className={FIELD_CLASS}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+237 6XX XX XX XX"
                      maxLength={40}
                      value={whatsappPhone}
                      onChange={(event) => setWhatsappPhone(event.target.value)}
                    />
                    <span className="tw-mt-1 tw-block tw-text-xs tw-font-normal tw-text-slate-500">
                      {t("Saisissez le numéro avec l’indicatif du pays, par exemple +237 6XX XX XX XX. Le bouton ouvrira WhatsApp.")}
                    </span>
                  </label>
                  <PosterUploader
                    value={posterPreview}
                    busy={uploadingPoster}
                    onSelect={handlePosterFile}
                    onRemove={() => {
                      setPosterUrl("");
                      setPosterPreview("");
                    }}
                    t={t}
                  />
                  <div>
                    <div className="tw-flex tw-items-center tw-justify-between tw-gap-3">
                      <h3 className="tw-font-bold tw-text-slate-900">{t("Sections de la page")}</h3>
                      <button type="button" disabled={content.sections.length >= 6} onClick={() => setContent({ ...content, sections: [...content.sections, { title: "", body: "" }] })} className="tw-rounded-lg tw-border tw-border-emerald-700 tw-px-3 tw-py-2 tw-text-xs tw-font-bold tw-text-emerald-800 disabled:tw-opacity-40">{t("Ajouter une section")}</button>
                    </div>
                    <div className="tw-mt-3 tw-space-y-3">
                      {content.sections.map((section, index) => (
                        <div key={`${current.id}-${index}`} className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-3">
                          <div className="tw-flex tw-items-center tw-justify-between tw-gap-3">
                            <span className="tw-text-xs tw-font-bold tw-uppercase tw-tracking-wider tw-text-slate-500">{t("Titre de section")} {index + 1}</span>
                            <button type="button" onClick={() => setContent({ ...content, sections: content.sections.filter((_, itemIndex) => itemIndex !== index) })} className="tw-text-xs tw-font-semibold tw-text-rose-700">{t("Supprimer")}</button>
                          </div>
                          <input className={FIELD_CLASS} maxLength={100} value={section.title} onChange={(event) => setContent({
                            ...content,
                            sections: content.sections.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item),
                          })} />
                          <textarea aria-label={t("Texte de la section")} className={`${FIELD_CLASS} tw-min-h-24`} maxLength={700} value={section.body} onChange={(event) => setContent({
                            ...content,
                            sections: content.sections.map((item, itemIndex) => itemIndex === index ? { ...item, body: event.target.value } : item),
                          })} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="tw-font-bold tw-text-slate-900">{t("Vos produits")}</h3>
                    <ProductPicker
                      products={products}
                      selected={productIds}
                      onToggle={toggleProduct}
                      t={t}
                      unavailable={Boolean(current.guest_access_token) || productAccessUnavailable}
                    />
                  </div>
                  <div className="tw-grid tw-gap-4 sm:tw-grid-cols-2">
                    <label className="tw-text-sm tw-font-semibold tw-text-slate-700">
                      {t("Thème visuel")}
                      <select className={FIELD_CLASS} value={theme} onChange={(event) => setTheme(event.target.value)}>
                        {SALES_FUNNEL_THEMES.map((option) => <option key={option.id} value={option.id}>{t(option.label)}</option>)}
                      </select>
                    </label>
                    <div className="tw-flex tw-items-end">
                      <div className="tw-flex tw-w-full tw-items-center tw-gap-3 tw-rounded-xl tw-p-3" style={{ background: palette.background, color: palette.text }}>
                        <span className="tw-h-7 tw-w-7 tw-rounded-full" style={{ background: palette.accent }} />
                        <span className="tw-text-xs tw-font-semibold">{t("Thème visuel")} · {t(SALES_FUNNEL_THEMES.find((item) => item.id === theme)?.label || "Océan")}</span>
                      </div>
                    </div>
                  </div>
                  <div className="tw-flex tw-flex-wrap tw-gap-2">
                    <button type="button" disabled={busy !== "" || uploadingPoster} onClick={handleSave} className="tw-rounded-xl tw-bg-slate-900 tw-px-4 tw-py-2.5 tw-text-sm tw-font-bold tw-text-white hover:tw-bg-slate-700 disabled:tw-opacity-50">
                      {busy === "save" ? t("Enregistrement…") : t("Enregistrer les modifications")}
                    </button>
                    <button type="button" disabled={busy !== "" || uploadingPoster} onClick={handlePublish} className="tw-rounded-xl tw-bg-emerald-700 tw-px-4 tw-py-2.5 tw-text-sm tw-font-bold tw-text-white hover:tw-bg-emerald-800 disabled:tw-opacity-50">
                      {busy === "publish" ? t("Enregistrement…") : t(current.is_published ? "Dépublier" : "Publier")}
                    </button>
                  </div>
                </section>

                <section className={`${CARD_CLASS} tw-space-y-4`}>
                  <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
                    <div>
                      <h3 className="tw-font-bold tw-text-slate-900">{t("Aperçu en direct")}</h3>
                      <p className="tw-mt-1 tw-text-xs tw-text-slate-500">{t("Les changements apparaissent ici avant l’enregistrement.")}</p>
                    </div>
                    <div className="tw-flex tw-gap-2" role="group" aria-label={t("Taille de l’aperçu")}>
                      {[
                        ["desktop", t("Ordinateur")],
                        ["mobile", t("Téléphone")],
                      ].map(([mode, label]) => (
                        <button key={mode} type="button" aria-pressed={previewMode === mode} onClick={() => setPreviewMode(mode)} className={`tw-rounded-lg tw-border tw-px-3 tw-py-2 tw-text-xs tw-font-bold ${previewMode === mode ? "tw-border-emerald-700 tw-bg-emerald-50 tw-text-emerald-900" : "tw-border-slate-300 tw-text-slate-600"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={`tw-mx-auto tw-max-h-[75vh] tw-overflow-y-auto tw-rounded-2xl tw-border tw-border-slate-300 tw-bg-slate-100 tw-p-2 ${previewMode === "mobile" ? "tw-max-w-[390px] tw-border-[8px] tw-border-slate-900" : "tw-max-w-full"}`}>
                    <SalesFunnelPageView funnel={previewFunnel} preview />
                  </div>
                </section>

                {current.is_published && (
                  <section className={`${CARD_CLASS} tw-space-y-4`}>
                    <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
                      <div>
                        <h3 className="tw-font-bold tw-text-slate-900">{t("Statistiques du tunnel")}</h3>
                        <p className="tw-mt-1 tw-text-xs tw-text-slate-500">{t("Depuis la publication · les visites répétées dans une même session ne sont comptées qu’une fois.")}</p>
                      </div>
                      <button type="button" disabled={loadingMetrics} onClick={() => {
                        setLoadingMetrics(true);
                        setMetricsError("");
                        (current.guest_access_token
                          ? api.guestSalesFunnelMetrics(current.id, current.guest_access_token)
                          : api.salesFunnelMetrics(current.id))
                          .then(setMetrics)
                          .catch(() => setMetricsError(t("Impossible de charger les statistiques.")))
                          .finally(() => setLoadingMetrics(false));
                      }} className="tw-rounded-lg tw-border tw-border-slate-300 tw-px-3 tw-py-2 tw-text-xs tw-font-bold tw-text-slate-700 disabled:tw-opacity-50">
                        {loadingMetrics ? t("Chargement…") : t("Actualiser les statistiques")}
                      </button>
                    </div>
                    {metricsError && <p role="alert" className="tw-rounded-lg tw-bg-rose-50 tw-p-3 tw-text-sm tw-text-rose-800">{metricsError}</p>}
                    <div className="tw-grid tw-grid-cols-3 tw-gap-2">
                      {[
                        [t("Visites"), metrics?.totals?.views || 0],
                        [t("Clics de contact"), metrics?.totals?.contact_clicks || 0],
                        [t("Clics produit"), metrics?.totals?.product_clicks || 0],
                      ].map(([label, count]) => (
                        <div key={label} className="tw-rounded-xl tw-bg-slate-50 tw-p-3">
                          <p className="tw-text-[11px] tw-font-semibold tw-text-slate-500">{label}</p>
                          <p className="tw-mt-1 tw-text-xl tw-font-black tw-text-slate-900">{loadingMetrics ? "…" : Number(count).toLocaleString("fr-FR")}</p>
                        </div>
                      ))}
                    </div>
                    {(metrics?.product_clicks || []).length > 0 && (
                      <div className="tw-space-y-2">
                        <h4 className="tw-text-sm tw-font-bold tw-text-slate-800">{t("Produits les plus cliqués")}</h4>
                        {metrics.product_clicks.map((item) => {
                          const product = products.find((candidate) => Number(candidate.id) === item.product_id);
                          return (
                            <div key={item.product_id} className="tw-flex tw-justify-between tw-gap-3 tw-text-sm">
                              <span className="tw-truncate tw-text-slate-700">{product?.name || `${t("Produit")} #${item.product_id}`}</span>
                              <span className="tw-shrink-0 tw-font-bold tw-text-slate-900">{Number(item.clicks).toLocaleString("fr-FR")}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}

                <section className={`${CARD_CLASS} tw-space-y-3`}>
                  <h3 className="tw-font-bold tw-text-slate-900">{t("Votre page publique")}</h3>
                  <label className="tw-block tw-text-sm tw-font-semibold tw-text-slate-700">
                    {t("Adresse de la page")}
                    <div className="tw-mt-1 tw-flex tw-overflow-hidden tw-rounded-xl tw-border tw-border-slate-300">
                      <span className="tw-flex tw-items-center tw-bg-slate-100 tw-px-3 tw-text-xs tw-text-slate-500">/tunnel/</span>
                      <input className="tw-min-w-0 tw-flex-1 tw-px-3 tw-py-2.5 tw-text-sm tw-text-slate-900 focus:tw-outline-none" value={slug} onChange={(event) => setSlug(makeSlug(event.target.value))} />
                    </div>
                  </label>
                  {current.is_published && current.slug && (
                    <div className="tw-flex tw-flex-wrap tw-gap-2">
                      <Link to={`/tunnel/${current.slug}`} target="_blank" className="tw-rounded-lg tw-bg-emerald-50 tw-px-3 tw-py-2 tw-text-sm tw-font-bold tw-text-emerald-800">{t("Voir la page")}</Link>
                      <button type="button" onClick={copyPublicLink} className="tw-rounded-lg tw-border tw-border-slate-300 tw-px-3 tw-py-2 tw-text-sm tw-font-semibold tw-text-slate-700">{t("Copier le lien")}</button>
                      <button type="button" onClick={sharePublicLink} className="tw-rounded-lg tw-border tw-border-slate-300 tw-px-3 tw-py-2 tw-text-sm tw-font-semibold tw-text-slate-700">{t("Partager sur WhatsApp")}</button>
                      <button type="button" disabled={qrLoading} onClick={generateQrCode} className="tw-rounded-lg tw-border tw-border-slate-300 tw-px-3 tw-py-2 tw-text-sm tw-font-semibold tw-text-slate-700 disabled:tw-opacity-50">
                        {qrLoading ? t("Création du QR code…") : t(qrDataUrl ? "Actualiser le QR code" : "Créer un QR code")}
                      </button>
                    </div>
                  )}
                  {qrError && <p role="alert" className="tw-text-sm tw-text-rose-700">{qrError}</p>}
                  {qrDataUrl && (
                    <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-4 tw-rounded-xl tw-bg-slate-50 tw-p-3">
                      <img src={qrDataUrl} alt={t("QR code de la page publique")} className="tw-h-36 tw-w-36 tw-rounded-lg tw-bg-white tw-p-2" />
                      <a href={qrDataUrl} download={`tunnel-${current.slug}.png`} className="tw-rounded-lg tw-bg-slate-900 tw-px-3 tw-py-2 tw-text-sm tw-font-bold tw-text-white">{t("Télécharger le QR code")}</a>
                    </div>
                  )}
                </section>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
