import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import ProductCard, { formatMoney } from "../components/ProductCard.jsx";
import Seo from "../components/Seo.jsx";
import { useAuth } from "../App.jsx";
import { smartProcessImageFile, formatBytes } from "../imageKit.js";
import DigitalProductPicker from "../components/DigitalProductPicker.jsx";
import { countryPhone, countrySymbol, DIGITAL_CATEGORIES } from "../config.js";
import { useLang } from "../i18n.jsx";
import { useRefreshOnFocus } from "../useRefreshOnFocus.js";
import MiniChart from "../components/MiniChart.jsx";
import { dailyBuckets } from "../utils.js";
import ExportSalesButton from "../components/ExportSalesButton.jsx";
import CopyCode from "../components/CopyCode.jsx";
import OnlineEarningsCard from "../components/OnlineEarningsCard.jsx";
import VideoAccessPanel from "../components/VideoAccessPanel.jsx";

const EMPTY_FORM = {
  name: "",
  description: "",
  // Catégorie du produit digital (métadonnée de classement ; miroir serveur
  // PUBLISH_CATEGORIES du Générateur).
  category: "Digital",
  warranty: "",
  delivery_fee: "",
  contact: "",
  quantity: "1",
  price: "",
  old_price: "",
  commission_percent: "0",
  commission_amount: "",
  photos: [],
  // Une CRÉATION est toujours un produit DIGITAL (fichier payant téléchargé
  // par le client) : `key` = clé Storage du fichier déjà téléversé DIRECTEMENT
  // par le navigateur dans le bucket PRIVÉ (URL d'upload signée, jusqu'à 20 Mo).
  // Sans fichier, la publication est refusée (validation avant envoi).
  digital: { enabled: true, name: null, size: 0, mime: null, key: null },
  // CONTENU PROTÉGÉ — deux natures possibles pour une création :
  //   • "file"    : fichier téléchargeable (comportement historique) ;
  //   • "youtube" : vidéo hébergée sur YouTube en « Non répertoriée » — son ID
  //     n'est JAMAIS exposé publiquement : le serveur ne le remet qu'après
  //     vérification du droit d'accès (achat + paiement confirmé + révocation
  //     + durée d'accès). `access_days` = durée d'accès en jours après
  //     confirmation du paiement ("" = illimité).
  digital_kind: "file",
  youtube_url: "",
  access_days: "",
  modules: [],
  // TUNNEL DE VENTE (/f/:id) — réservé au compte propriétaire (le serveur
  // vérifie aussi l'e-mail). `group_url` n'est jamais public : il n'est remis
  // qu'à l'acheteur après paiement ET téléchargement du reçu.
  funnel: {
    enabled: false,
    headline: "",
    seats_total: "30",
    countdown_minutes: "90",
    group_url: "https://chat.whatsapp.com/IkP0cv2vjybDwOgmYYUmJv",
    bonuses: [],
    testimonials: [],
    teaser_url: "",
    trainer_bio: "",
  },
};
const MAX_PHOTOS = 1;

// Durées d'accès proposées pour une VIDÉO PROTÉGÉE (jours après confirmation
// du paiement) : "" = illimité, "custom" = saisie libre.
const ACCESS_DAY_PRESETS = ["7", "30", "90", "365"];

// Prompt ChatGPT conseillé pour améliorer les photos produits. La clé française
// est aussi la valeur exacte copiée dans le presse-papiers (toutes langues).
const PHOTO_PROMPT =
  "/branding Améliore cette image pour la présentation dans une marketplace.";

export default function CreatorDashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isFormation, setIsFormation] = useState(false);
  // Fichier digital existant de la création en cours d'édition.
  const [editingDigital, setEditingDigital] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [picking, setPicking] = useState(false);
  const [modulesLoading, setModulesLoading] = useState(false);
  // Suppression VOLONTAIRE de la photo en cours d'édition (bouton ✕) : seule
  // cette intention est transmise au serveur (`remove_photos`). Sans elle, une
  // modification du produit ne peut plus effacer la photo existante.
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const formRef = useRef(null);
  const [proofSale, setProofSale] = useState(null);
  const [proofLoading, setProofLoading] = useState(false);
  // Création vidéo dont on gère les accès (modale) — null = modale fermée.
  const [accessProduct, setAccessProduct] = useState(null);
  // Valeurs de rendu du bloc « Contenu protégé » : type choisi et valeur du
  // sélecteur de durée d'accès (preset ou « Autre durée… »).
  const isYoutubeForm = form.digital_kind === "youtube";
  const accessDaysText = String(form.access_days ?? "");
  const accessPreset = ACCESS_DAY_PRESETS.includes(accessDaysText)
    ? accessDaysText
    : accessDaysText === ""
      ? ""
      : "custom";
  const symbol = countrySymbol(user?.country);
  const prefix = countryPhone(user?.country);
  const moduleList = Array.isArray(form.modules) ? form.modules : [];
  // Tunnel de vente : interface réservée au compte propriétaire (garde serveur
  // identique — 403 FUNNEL_FORBIDDEN pour tout autre compte).
  const canUseFunnel =
    String(user?.email || "").trim().toLowerCase() === "bestrong9124@gmail.com";
  const funnelForm = form.funnel || EMPTY_FORM.funnel;
  const funnelEnabled = canUseFunnel && funnelForm.enabled === true;
  const showModuleEditor =
    isFormation || form.category === "Éducation & Formation" || funnelEnabled;

  const setFunnel = (patch) =>
    setForm((f) => ({
      ...f,
      funnel: { ...EMPTY_FORM.funnel, ...(f.funnel || {}), ...patch },
    }));

  const funnelBonuses = Array.isArray(funnelForm.bonuses) ? funnelForm.bonuses : [];
  const funnelTestimonials = Array.isArray(funnelForm.testimonials)
    ? funnelForm.testimonials
    : [];

  const addFunnelBonus = () =>
    setForm((f) => {
      const funnel = { ...EMPTY_FORM.funnel, ...(f.funnel || {}) };
      const bonuses = Array.isArray(funnel.bonuses) ? funnel.bonuses : [];
      if (bonuses.length >= 6) return f;
      return {
        ...f,
        funnel: {
          ...funnel,
          bonuses: [...bonuses, { title: "", description: "", image: "" }],
        },
      };
    });

  const updateFunnelBonus = (index, patch) =>
    setForm((f) => {
      const funnel = { ...EMPTY_FORM.funnel, ...(f.funnel || {}) };
      const bonuses = (Array.isArray(funnel.bonuses) ? funnel.bonuses : []).map((b, i) =>
        i === index ? { ...b, ...patch } : b
      );
      return { ...f, funnel: { ...funnel, bonuses } };
    });

  const removeFunnelBonus = (index) =>
    setForm((f) => {
      const funnel = { ...EMPTY_FORM.funnel, ...(f.funnel || {}) };
      const bonuses = (Array.isArray(funnel.bonuses) ? funnel.bonuses : []).filter(
        (_, i) => i !== index
      );
      return { ...f, funnel: { ...funnel, bonuses } };
    });

  const addFunnelBonusImage = async (index, files) => {
    const file = Array.from(files || [])[0];
    if (!file) return;
    setError("");
    try {
      const { entry } = await smartProcessImageFile(file);
      updateFunnelBonus(index, { image: entry.thumb });
    } catch (err) {
      setError(err.message);
    }
  };

  const addFunnelTestimonial = () =>
    setForm((f) => {
      const funnel = { ...EMPTY_FORM.funnel, ...(f.funnel || {}) };
      const testimonials = Array.isArray(funnel.testimonials) ? funnel.testimonials : [];
      if (testimonials.length >= 6) return f;
      return {
        ...f,
        funnel: {
          ...funnel,
          testimonials: [...testimonials, { name: "", role: "", text: "", image: "" }],
        },
      };
    });

  const updateFunnelTestimonial = (index, patch) =>
    setForm((f) => {
      const funnel = { ...EMPTY_FORM.funnel, ...(f.funnel || {}) };
      const testimonials = (Array.isArray(funnel.testimonials)
        ? funnel.testimonials
        : []
      ).map((item, i) => (i === index ? { ...item, ...patch } : item));
      return { ...f, funnel: { ...funnel, testimonials } };
    });

  const removeFunnelTestimonial = (index) =>
    setForm((f) => {
      const funnel = { ...EMPTY_FORM.funnel, ...(f.funnel || {}) };
      const testimonials = (Array.isArray(funnel.testimonials)
        ? funnel.testimonials
        : []
      ).filter((_, i) => i !== index);
      return { ...f, funnel: { ...funnel, testimonials } };
    });

  const addFunnelTestimonialImage = async (index, files) => {
    const file = Array.from(files || [])[0];
    if (!file) return;
    setError("");
    try {
      const { entry } = await smartProcessImageFile(file);
      updateFunnelTestimonial(index, { image: entry.thumb });
    } catch (err) {
      setError(err.message);
    }
  };

  const addModule = () =>
    setForm((f) => {
      const list = Array.isArray(f.modules) ? f.modules : [];
      if (list.length >= 30) return f;
      return {
        ...f,
        modules: [...list, { title: "", subtitle: "", description: "", duration: "" }],
      };
    });

  const updateModule = (index, patch) =>
    setForm((f) => ({
      ...f,
      modules: (Array.isArray(f.modules) ? f.modules : []).map((m, i) =>
        i === index ? { ...m, ...patch } : m
      ),
    }));

  const removeModule = (index) =>
    setForm((f) => ({
      ...f,
      modules: (Array.isArray(f.modules) ? f.modules : []).filter((_, i) => i !== index),
    }));

  const moveModule = (index, delta) =>
    setForm((f) => {
      const list = [...(Array.isArray(f.modules) ? f.modules : [])];
      const target = index + delta;
      if (target < 0 || target >= list.length) return f;
      [list[index], list[target]] = [list[target], list[index]];
      return { ...f, modules: list };
    });

  const generateModules = async () => {
    setError("");
    setSuccess("");
    if (String(form.name || "").trim().length < 3) {
      setError(t("Renseignez d'abord le nom de la formation."));
      return;
    }
    setModulesLoading(true);
    try {
      const d = await api.generateProductModules({
        name: form.name,
        description: form.description,
        category: form.category,
        digital_kind: form.digital_kind,
      });
      const list = Array.isArray(d.modules) ? d.modules : [];
      if (!list.length) {
        setError(t("L'IA n'a proposé aucun module. Réessayez."));
        return;
      }
      setForm((f) => ({ ...f, modules: list }));
      setSuccess(t("Modules générés : relisez et ajustez avant de publier."));
    } catch (err) {
      setError(err.message);
    } finally {
      setModulesLoading(false);
    }
  };

  const openProof = async (s) => {
    setError("");
    setProofLoading(true);
    try {
      const d = await api.saleProof(s.id);
      if (!d.proof) {
        setError(t("Aucune preuve disponible pour cette vente."));
      } else {
        setProofSale({ sale: s, proof: d.proof });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setProofLoading(false);
    }
  };

  const addPhotos = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setPicking(true);
    setError("");
    try {
      const remaining = MAX_PHOTOS - form.photos.length;
      const batch = list.slice(0, remaining);
      const processed = await Promise.allSettled(batch.map((f) => smartProcessImageFile(f, { requireProductResolution: true })));
      const entries = [];
      for (const p of processed) {
        if (p.status === "fulfilled") {
          entries.push(p.value.entry);
        } else if (p.reason) {
          setError(p.reason.message || t("Impossible de traiter une image"));
        }
      }
      setForm((f) => ({ ...f, photos: [...f.photos, ...entries].slice(0, MAX_PHOTOS) }));
      // Une nouvelle photo remplace l'ancienne : l'intention de suppression
      // éventuelle n'a plus lieu d'être.
      setPhotoRemoved(false);
    } finally {
      setPicking(false);
    }
  };

  const removePhoto = (i) => {
    setForm((f) => ({ ...f, photos: f.photos.filter((_, idx) => idx !== i) }));
    // Le clic sur ✕ est la SEULE suppression volontaire transmise au serveur.
    setPhotoRemoved(true);
  };

  const load = useCallback(async () => {
    try {
      const [prodData, saleData] = await Promise.all([api.myProducts(), api.shopSales(user.id)]);
      setProducts(prodData.products);
      setSales(saleData.sales);
      setStats(saleData.stats);
    } catch (e) {
      setError(e.message);
    }
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);
  useRefreshOnFocus(load);

  // Un clic sur « Modifier » doit afficher immédiatement le formulaire, même si
  // la recharge des détails du produit est lente. Le défilement rend aussi le
  // résultat visible quand la carte se trouve plus bas dans la page.
  useEffect(() => {
    if (!showForm) return;
    const id = requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
  }, [showForm, editingId]);

  // Temps réel : rafraîchit créations et statistiques toutes les 30 s
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      load();
    }, 60000);
    return () => clearInterval(id);
  }, [load]);

  const submitProduct = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const priceNum = form.price === "" ? null : Number(form.price);
    const oldNum = form.old_price === "" ? null : Number(form.old_price);
    if (priceNum === null && oldNum === null) {
      setError(t("Renseignez au moins un prix (normal ou de vente)."));
      return;
    }
    // --- Produit DIGITAL -----------------------------------------------
    // Fichier téléversé DIRECTEMENT par le navigateur vers le bucket PRIVÉ
    // Supabase (URL d'upload signée) → le produit ne transporte que `key`.
    // `remove: true` retire le fichier (refusé côté serveur si des clients
    // l'ont déjà acheté).
    const wantsDigital = Boolean(form.digital?.enabled);
    const isYoutube = form.digital_kind === "youtube";
    const hasNewDigitalFile = Boolean(form.digital?.key);
    // Tunnel de vente actif : le contenu (fichier/vidéo) devient FACULTATIF —
    // l'offre vend l'accès au groupe privé et les visuels bonus, pas un fichier.
    const funnelActive = canUseFunnel && form.funnel?.enabled === true;
    // Type de contenu déjà enregistré pour la création en cours d'édition :
    // « youtube » (vidéo protégée) ou « file » (fichier téléchargeable).
    const editingKind = editingDigital?.kind || (editingDigital?.name ? "file" : null);
    // La vidéo / le fichier existant peut être CONSERVÉ si le type ne change
    // pas : seul un changement de type exige un nouveau contenu.
    const keepsYoutube = isYoutube && editingKind === "youtube" && Boolean(editingDigital?.youtube);
    const keepsFile = !isYoutube && Boolean(editingDigital?.name) && editingKind !== "youtube";
    // Vidéo PROTÉGÉE : le contenu vit sur YouTube (non répertoriée) — un lien
    // est exigé à la création ; en modification, l'ancienne vidéo peut être
    // conservée (le serveur garde l'ID existant si aucun lien n'est fourni).
    if (isYoutube && !String(form.youtube_url || "").trim() && !keepsYoutube) {
      setError(t("Collez le lien de la vidéo YouTube (publiée en « Non répertoriée »)."));
      return;
    }
    // Fichier : obligatoire à la création, et obligatoire aussi quand une
    // ancienne vidéo YouTube est convertie en fichier téléchargeable — sauf
    // pour un tunnel de vente (le produit peut vendre l'accès + les bonus).
    if (!isYoutube && wantsDigital && !hasNewDigitalFile && !keepsFile && !funnelActive) {
      setError(t("Choisissez le fichier que le client téléchargera pour ce produit digital."));
      return;
    }
    // Tunnel actif : on ne touche JAMAIS au contenu existant (pas de
    // `remove:true` pour un produit sans fichier déjà vendu).
    const digitalPayload = funnelActive
      ? undefined
      : wantsDigital
        ? hasNewDigitalFile
          ? {
              name: form.digital.name,
              mime: form.digital.mime,
              size: form.digital.size,
              key: form.digital.key,
            }
          : undefined
        : editingDigital
          ? { remove: true }
          : undefined;
    const payload = {
      ...form,
      price: priceNum !== null ? priceNum : oldNum,
      old_price: priceNum !== null ? oldNum : null,
      // Le créateur saisit la commission en MONTANT (par article) : conversion
      // en pourcentage précis (6 décimales) pour la base.
      commission_percent: (() => {
        const base = priceNum !== null ? priceNum : oldNum;
        const amt = Number(form.commission_amount || 0);
        if (!base || base <= 0 || !amt) return 0;
        return Math.min(100, Math.round((amt / base) * 1e8) / 1e6);
      })(),
      // Un produit digital n'a NI stock NI livraison : valeurs imposées (le
      // serveur force déjà delivery_fee à 0 et ne décrémente aucun stock pour
      // un digital — les champs correspondants ont été retirés du formulaire).
      delivery_fee: 0,
      quantity: 1,
      warranty: form.warranty.trim() || null,
      contact: form.contact ? `${prefix}${form.contact.trim()}` : "",
      digital: digitalPayload,
      // Contenu PROTÉGÉ : « youtube » = vidéo hébergée sur YouTube (non
      // répertoriée, ID jamais exposé au client), « file » = fichier
      // téléchargeable téléversé dans le bucket privé.
      digital_kind: isYoutube ? "youtube" : "file",
      // Durée d'accès après confirmation du paiement : champ vide = accès
      // illimité (null) — le validateur zod refuse une chaîne vide.
      access_days: String(form.access_days || "").trim() === "" ? null : Number(form.access_days),
      // Suppression explicite de la photo (bouton ✕) : sans ce drapeau, le
      // serveur CONSERVE la photo existante quand aucune nouvelle n'est envoyée.
      remove_photos: photoRemoved,
      // Modules pédagogiques : vides pour une création hors formation.
      modules: moduleList
        .map((m) => ({
          title: String(m.title || "").trim(),
          subtitle: String(m.subtitle || "").trim(),
          description: String(m.description || "").trim(),
          duration: String(m.duration || "").trim(),
        }))
        .filter((m) => m.title || m.subtitle || m.description || m.duration),
      // Configuration du tunnel : `undefined` pour un compte non autorisé
      // (le serveur ignore le champ), `{ enabled:false }` pour le désactiver.
      funnel: canUseFunnel
        ? funnelActive
          ? {
              enabled: true,
              headline: String(funnelForm.headline || "").trim(),
              bonuses: funnelBonuses
                .map((b) => ({
                  title: String(b.title || "").trim(),
                  description: String(b.description || "").trim(),
                  image: String(b.image || ""),
                }))
                .filter((b) => b.title || b.description || b.image),
              testimonials: funnelTestimonials
                .map((item) => ({
                  name: String(item.name || "").trim(),
                  role: String(item.role || "").trim(),
                  text: String(item.text || "").trim(),
                  image: String(item.image || ""),
                }))
                .filter((item) => item.name || item.text || item.image),
              teaser_url: String(funnelForm.teaser_url || "").trim(),
              trainer_bio: String(funnelForm.trainer_bio || "").trim(),
              seats_total: Number(funnelForm.seats_total || 30),
              countdown_minutes: Number(funnelForm.countdown_minutes || 90),
              group_url: String(funnelForm.group_url || "").trim(),
            }
          : { enabled: false }
        : undefined,
    };
    try {
      if (editingId) {
        await api.updateProduct(editingId, payload);
        setSuccess(t("Création mise à jour !"));
      } else {
        await api.createProduct(payload);
        setSuccess(t("Création publiée avec succès."));
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setEditingDigital(null);
      setPhotoRemoved(false);
      setShowForm(false);
      setIsFormation(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const editProduct = async (p) => {
    if (!p) return;
    setError("");
    setSuccess("");
    setPhotoRemoved(false);
    // Produit issu du Générateur MboppiShop : ouvrir le document source et son
    // éditeur. La publication existante sera mise à jour depuis le Générateur,
    // sans recréer un second produit.
    const documentId = Number(p.generator_document_id || 0);
    if (p.is_digital === true && documentId > 0) {
      navigate(`/generateur?document=${documentId}`);
      return;
    }

    const currentPrefix = countryPhone(user?.country);
    const contact =
      p.contact && p.contact.startsWith(currentPrefix)
        ? p.contact.slice(currentPrefix.length)
        : p.contact || "";
    setForm({
      name: p.name || "",
      description: p.description || "",
      category: p.category || "Digital",
      warranty: p.warranty || "",
      delivery_fee: p.delivery_fee != null ? String(p.delivery_fee) : "",
      contact,
      quantity: p.quantity != null ? String(p.quantity) : "1",
      price: p.price != null ? String(p.price) : "",
      old_price: p.old_price != null ? String(p.old_price) : "",
      commission_percent: p.commission_percent != null ? String(p.commission_percent) : "0",
      commission_amount:
        p.price != null && p.commission_percent != null
          ? String(Math.round(Number(p.price) * Number(p.commission_percent)) / 100)
          : "",
      photos: Array.isArray(p.photos) ? p.photos : [],
      digital: { enabled: true, name: null, size: 0, mime: null, key: null },
      digital_kind: p.digital_kind === "youtube" ? "youtube" : "file",
      youtube_url: p.youtube_id ? `https://www.youtube.com/watch?v=${p.youtube_id}` : "",
      access_days:
        p.access_days !== null && p.access_days !== undefined ? String(p.access_days) : "",
      modules: Array.isArray(p.modules) ? p.modules : [],
      funnel:
        canUseFunnel && p.funnel
          ? {
              enabled: p.funnel.enabled !== false,
              headline: p.funnel.headline || "",
              seats_total: String(p.funnel.seats_total ?? 30),
              countdown_minutes: String(p.funnel.countdown_minutes ?? 90),
              group_url:
                p.funnel.group_url || EMPTY_FORM.funnel.group_url,
              bonuses: (Array.isArray(p.funnel.bonuses) ? p.funnel.bonuses : []).map((b) => ({
                title: b.title || "",
                description: b.description || "",
                image: b.image || "",
              })),
              testimonials: (Array.isArray(p.funnel.testimonials)
                ? p.funnel.testimonials
                : []
              ).map((item) => ({
                name: item.name || "",
                role: item.role || "",
                text: item.text || "",
                image: item.image || "",
              })),
              teaser_url: p.funnel.teaser_url || "",
              trainer_bio: p.funnel.trainer_bio || "",
            }
          : EMPTY_FORM.funnel,
    });
    setEditingDigital(
      p.is_digital === true
        ? {
            name: p.digital_name || t("Fichier du produit"),
            size: Number(p.digital_size || 0),
            kind: p.digital_kind === "youtube" ? "youtube" : "file",
            youtube: Boolean(p.youtube_id),
          }
        : null
    );
    setEditingId(p.id);
    // Afficher le formulaire sans attendre le fetch de détail : le clic doit
    // toujours produire un retour visible, même sur une connexion lente.
    setShowForm(true);
    setIsFormation(p.category === "Éducation & Formation");

    try {
      const detail = await api.getProduct(p.id);
      const dp = detail.product || {};
      if (Array.isArray(dp.modules)) {
        setForm((current) => ({ ...current, modules: dp.modules }));
      }
      const mediums = Array.isArray(dp.photos) ? dp.photos : [];
      if (mediums.length) {
        const thumbs =
          Array.isArray(dp.photos_thumb) && dp.photos_thumb.length
            ? dp.photos_thumb
            : Array.isArray(p.photos)
              ? p.photos
              : [];
        const larges = Array.isArray(dp.photos_large) ? dp.photos_large : [];
        setForm((current) => ({
          ...current,
          photos: mediums.map((medium, i) => ({
            thumb: thumbs[i] || medium,
            medium,
            large: larges[i] || medium,
          })),
        }));
      }
    } catch {
      /* le formulaire est déjà affiché avec les données de la carte */
    }
  };

  const removeProduct = async (p) => {
    if (!window.confirm(t("Retirer cette création ?"))) return;
    try {
      await api.deleteProduct(p.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="container boost-page">
      <Seo
        title={t("Mon espace créateur") + " — MboppiShop"}
        description={t("Publiez et gérez vos créations.")}
        noindex
      />
      <section className="dash-header">
        <div>
          <h1>🎨 {t("Mon espace créateur")}</h1>
          <p>
            {t("Publiez vos créations : elles rejoignent la catégorie Arts & Artisanat du marché.")}
          </p>
        </div>
        <div className="dash-actions">
          <Link to={`/createur/${user.id}`} className="btn btn-outline">
            🔗 {t("Voir ma vitrine")}
          </Link>
          <Link to="/creator/paiements" className="btn btn-outline">
            💳 {t("Mes moyens de paiement")}
          </Link>
<div className="tw-flex tw-gap-2 tw-flex-wrap">
          <button
            className="btn btn-primary"
            onClick={() => {
              if (showForm) {
                setForm(EMPTY_FORM);
                setEditingId(null);
                setEditingDigital(null);
                setIsFormation(false);
              } else {
                setIsFormation(false);
              }
              setShowForm(!showForm);
            }}
          >
            {showForm ? t("Annuler") : t("+ Publier une création")}
          </button>
          <button
            className="btn btn-outline"
            onClick={() => {
              setForm({ ...EMPTY_FORM, category: "Éducation & Formation" });
              setEditingId(null);
              setEditingDigital(null);
              setIsFormation(true);
              setShowForm(true);
            }}
          >
            {t("📚 Publier une formation")}
          </button>
        </div>
        </div>
      </section>

      <div className="info-banner">
        <strong>💳 {t("Paiements automatiques disponibles")}</strong>
        <p>
          {t(
            "Configurez votre moyen de paiement pour recevoir automatiquement les montants qui vous reviennent après confirmation du paiement client."
          )}
        </p>
      </div>

      <OnlineEarningsCard role="creator" />

      {showForm && (
        <div className="card form-card" ref={formRef}>
          <h2>{editingId ? t("Modifier la création") : isFormation ? t("Nouvelle formation") : t("Nouvelle création")}</h2>
          <div className="photo-tip">
            <strong>{t("📸 Astuce : des photos de qualité pour vos produits")}</strong>
            <p>
              {t(
                "Pour donner une forte impression et un visuel professionnel à vos produits, suivez ces étapes :"
              )}
            </p>
            <ol>
              <li>{t("Téléchargez l'application ChatGPT si vous ne l'avez pas encore.")}</li>
              <li>
                {t("Dans ChatGPT, téléversez votre image puis copiez-collez ce prompt :")}
              </li>
            </ol>
            <div className="photo-tip-prompt">
              <span>{t(PHOTO_PROMPT)}</span>
              <CopyCode code={PHOTO_PROMPT} label={t("Copier")} />
            </div>
            <ol start={3}>
              <li>
                {t("Téléchargez l'image améliorée puis ajoutez-la à votre produit.")}
              </li>
            </ol>
          </div>
          <form onSubmit={submitProduct}>
            <label>{t("Photo (1 max)")}</label>
            <div className="photo-input">
              <label className="photo-picker">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  disabled={picking || form.photos.length >= MAX_PHOTOS}
                  onChange={(e) => addPhotos(e.target.files)}
                />
                {picking
                  ? t("Compression…")
                  : form.photos.length >= MAX_PHOTOS
                    ? t("Photos complètes")
                    : t("📷 Ajouter des photos")}
              </label>
              <div className="photo-previews">
                {form.photos.map((photo, i) => (
                  <div key={i} className="photo-thumb">
                    <img src={photo.thumb || photo} alt={`${t("Photo")} ${i + 1}`} />
                    {photo.meta && photo.meta.original_bytes ? (
                      <span
                        className="photo-saved"
                        title={`${photo.meta.strategy || "optimisée"} — ${formatBytes(photo.meta.original_bytes)} → ${formatBytes(photo.meta.bytes)} · ${photo.meta.original_width}×${photo.meta.original_height}px`}
                      >
                        {formatBytes(photo.meta.bytes)} · -
                        {Math.max(
                          0,
                          Math.round((1 - photo.meta.bytes / photo.meta.original_bytes) * 100)
                        )}
                        %
                      </span>
                    ) : null}
                    <button type="button" className="photo-remove" onClick={() => removePhoto(i)}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {/* 🔐 CONTENU PROTÉGÉ — deux natures possibles : fichier
                téléchargeable (bucket PRIVÉ Supabase) ou vidéo hébergée sur
                YouTube « Non répertoriée ». L'identifiant vidéo n'est JAMAIS
                exposé publiquement : le serveur ne le délivre qu'aux acheteurs
                dont le paiement est confirmé, l'accès non révoqué et non
                expiré. */}
            <label>{t("Contenu protégé")}</label>
            <div className="video-kind-choice">
              <label className="terms-check">
                <input
                  type="radio"
                  name="digital-kind"
                  checked={!isYoutubeForm}
                  onChange={() => setForm((f) => ({ ...f, digital_kind: "file" }))}
                />
                <span>📁 {t("Fichier téléchargeable")}</span>
              </label>
              <label className="terms-check">
                <input
                  type="radio"
                  name="digital-kind"
                  checked={isYoutubeForm}
                  onChange={() => setForm((f) => ({ ...f, digital_kind: "youtube" }))}
                />
                <span>▶️ {t("Vidéo YouTube protégée")}</span>
              </label>
            </div>

            {isYoutubeForm ? (
              <>
                <label>{t("Lien de la vidéo YouTube *")}</label>
                <input
                  className="input"
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={form.youtube_url}
                  onChange={(e) => setForm((f) => ({ ...f, youtube_url: e.target.value }))}
                />
                <p className="hint">
                  {t(
                    "Publiez la vidéo en « Non répertoriée » : son identifiant reste côté serveur et n'est délivré qu'aux acheteurs dont l'accès est confirmé."
                  )}
                </p>
                <label>{t("Durée d'accès après confirmation du paiement")}</label>
                <select
                  className="input"
                  value={accessPreset}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({
                      ...f,
                      access_days:
                        v === "custom"
                          ? ACCESS_DAY_PRESETS.includes(String(f.access_days)) || !f.access_days
                            ? "180"
                            : String(f.access_days)
                          : v,
                    }));
                  }}
                >
                  <option value="">{t("Illimité")}</option>
                  <option value="7">7 {t("jours")}</option>
                  <option value="30">30 {t("jours")}</option>
                  <option value="90">90 {t("jours")}</option>
                  <option value="365">365 {t("jours")}</option>
                  <option value="custom">{t("Autre durée…")}</option>
                </select>
                {accessPreset === "custom" && (
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="3650"
                    placeholder={t("Nombre de jours")}
                    value={form.access_days}
                    onChange={(e) => setForm((f) => ({ ...f, access_days: e.target.value }))}
                  />
                )}
                <p className="hint">
                  {t(
                    "Passé ce délai, la vidéo se bloque automatiquement : vous pouvez prolonger ou révoquer chaque acheteur dans « Accès aux vidéos protégées »."
                  )}
                </p>
              </>
            ) : (
              <DigitalProductPicker
                required={!funnelEnabled}
                value={form.digital}
                existing={editingDigital}
                onChange={(digital) => setForm((f) => ({ ...f, digital }))}
              />
            )}
            {canUseFunnel && (
              <div className="creator-modules funnel-editor">
                <div className="creator-modules-head">
                  <div>
                    <label className="terms-check funnel-toggle">
                      <input
                        type="checkbox"
                        checked={funnelEnabled}
                        onChange={(e) => setFunnel({ enabled: e.target.checked })}
                      />
                      <span>🔥 {t("Activer le tunnel de vente (/f/:id)")}</span>
                    </label>
                    <p className="hint creator-modules-hint">
                      {t(
                        "Page de vente professionnelle : accroche, places limitées, compte à rebours, modules, bonus avec visuels et groupe WhatsApp privé. Le fichier ou la vidéo devient facultatif."
                      )}
                    </p>
                  </div>
                  {editingId && funnelEnabled ? (
                    <a
                      className="btn btn-outline"
                      href={`/f/${editingId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      🔗 {t("Ouvrir le tunnel")}
                    </a>
                  ) : null}
                </div>

                {funnelEnabled && (
                  <>
                    <label>{t("Accroche de la page de vente")}</label>
                    <input
                      className="input"
                      maxLength={200}
                      placeholder={t("ex : Transformez votre budget en liberté en 7 jours")}
                      value={funnelForm.headline || ""}
                      onChange={(e) => setFunnel({ headline: e.target.value })}
                    />

                    <div className="row2">
                      <div>
                        <label>{t("Places disponibles")}</label>
                        <input
                          className="input"
                          type="number"
                          min="1"
                          max="1000"
                          value={funnelForm.seats_total}
                          onChange={(e) => setFunnel({ seats_total: e.target.value })}
                        />
                      </div>
                      <div>
                        <label>{t("Compte à rebours (minutes)")}</label>
                        <input
                          className="input"
                          type="number"
                          min="5"
                          max="1440"
                          value={funnelForm.countdown_minutes}
                          onChange={(e) => setFunnel({ countdown_minutes: e.target.value })}
                        />
                      </div>
                    </div>

                    <label>{t("Lien du groupe WhatsApp privé")}</label>
                    <input
                      className="input"
                      type="url"
                      placeholder="https://chat.whatsapp.com/..."
                      value={funnelForm.group_url || ""}
                      onChange={(e) => setFunnel({ group_url: e.target.value })}
                    />
                    <p className="hint">
                      {t(
                        "Ce lien n'est JAMAIS visible publiquement : il n'est débloqué qu'après le téléchargement du reçu par l'acheteur."
                      )}
                    </p>

                    <label>{t("Vidéo de présentation (YouTube, facultatif)")}</label>
                    <input
                      className="input"
                      type="url"
                      maxLength={300}
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={funnelForm.teaser_url || ""}
                      onChange={(e) => setFunnel({ teaser_url: e.target.value })}
                    />
                    <p className="hint">
                      {t(
                        "Vidéo « Non répertoriée » : elle est lue dans un lecteur intégré (youtube-nocookie), sans lien public. Laissez vide pour masquer la section."
                      )}
                    </p>

                    <label>{t("Présentation du formateur (facultatif)")}</label>
                    <textarea
                      className="input"
                      rows="3"
                      maxLength={600}
                      placeholder={t(
                        "Quelques lignes sur votre parcours, votre expérience et votre méthode…"
                      )}
                      value={funnelForm.trainer_bio || ""}
                      onChange={(e) => setFunnel({ trainer_bio: e.target.value })}
                    />
                    <p className="hint">
                      {t(
                        "Affichée sur la page de vente avec votre nom, votre ville et votre photo de profil."
                      )}
                    </p>

                    <div className="creator-modules-head funnel-bonuses-head">
                      <div>
                        <label>{t("Bonus de l'offre")}</label>
                        <p className="hint creator-modules-hint">
                          {t("Jusqu'à 6 bonus : titre, description et visuel.")}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={addFunnelBonus}
                        disabled={funnelBonuses.length >= 6}
                      >
                        + {t("Ajouter un bonus")}
                      </button>
                    </div>

                    {funnelBonuses.length === 0 ? (
                      <p className="hint creator-modules-hint">
                        {t("Aucun bonus pour le moment.")}
                      </p>
                    ) : (
                      <div className="creator-module-list">
                        {funnelBonuses.map((b, i) => (
                          <div className="creator-module" key={i}>
                            <div className="creator-module-head">
                              <strong>{t("Bonus {n}", { n: i + 1 })}</strong>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => removeFunnelBonus(i)}
                                title={t("Supprimer ce bonus")}
                              >
                                ✕
                              </button>
                            </div>
                            <div className="row2">
                              <div>
                                <label>{t("Titre")}</label>
                                <input
                                  className="input"
                                  maxLength={160}
                                  value={b.title || ""}
                                  onChange={(e) => updateFunnelBonus(i, { title: e.target.value })}
                                />
                              </div>
                              <div>
                                <label>{t("Visuel")}</label>
                                <input
                                  className="input"
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => {
                                    addFunnelBonusImage(i, e.target.files);
                                    e.target.value = "";
                                  }}
                                />
                              </div>
                            </div>
                            <label>{t("Description")}</label>
                            <textarea
                              className="input"
                              rows="2"
                              maxLength={600}
                              value={b.description || ""}
                              onChange={(e) =>
                                updateFunnelBonus(i, { description: e.target.value })
                              }
                            />
                            {b.image ? (
                              <div className="photo-previews">
                                <div className="photo-thumb">
                                  <img src={b.image} alt={b.title || t("Visuel bonus")} />
                                  <button
                                    type="button"
                                    className="photo-remove"
                                    onClick={() => updateFunnelBonus(i, { image: "" })}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="creator-modules-head funnel-bonuses-head">
                      <div>
                        <label>{t("Témoignages d'acheteurs")}</label>
                        <p className="hint creator-modules-hint">
                          {t("Jusqu'à 6 témoignages : nom, rôle, message et photo (facultative).")}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={addFunnelTestimonial}
                        disabled={funnelTestimonials.length >= 6}
                      >
                        + {t("Ajouter un témoignage")}
                      </button>
                    </div>

                    {funnelTestimonials.length === 0 ? (
                      <p className="hint creator-modules-hint">
                        {t("Aucun témoignage pour le moment.")}
                      </p>
                    ) : (
                      <div className="creator-module-list">
                        {funnelTestimonials.map((item, i) => (
                          <div className="creator-module" key={i}>
                            <div className="creator-module-head">
                              <strong>{t("Témoignage {n}", { n: i + 1 })}</strong>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => removeFunnelTestimonial(i)}
                                title={t("Supprimer ce témoignage")}
                              >
                                ✕
                              </button>
                            </div>
                            <div className="row2">
                              <div>
                                <label>{t("Nom affiché")}</label>
                                <input
                                  className="input"
                                  maxLength={80}
                                  value={item.name || ""}
                                  onChange={(e) =>
                                    updateFunnelTestimonial(i, { name: e.target.value })
                                  }
                                />
                              </div>
                              <div>
                                <label>{t("Rôle / ville (facultatif)")}</label>
                                <input
                                  className="input"
                                  maxLength={80}
                                  placeholder={t("ex : Entrepreneure, Douala")}
                                  value={item.role || ""}
                                  onChange={(e) =>
                                    updateFunnelTestimonial(i, { role: e.target.value })
                                  }
                                />
                              </div>
                            </div>
                            <label>{t("Témoignage")}</label>
                            <textarea
                              className="input"
                              rows="2"
                              maxLength={400}
                              value={item.text || ""}
                              onChange={(e) =>
                                updateFunnelTestimonial(i, { text: e.target.value })
                              }
                            />
                            <label>{t("Photo (facultatif)")}</label>
                            <input
                              className="input"
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                addFunnelTestimonialImage(i, e.target.files);
                                e.target.value = "";
                              }}
                            />
                            {item.image ? (
                              <div className="photo-previews">
                                <div className="photo-thumb">
                                  <img src={item.image} alt={item.name || t("Témoignage")} />
                                  <button
                                    type="button"
                                    className="photo-remove"
                                    onClick={() => updateFunnelTestimonial(i, { image: "" })}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            <label>{t("Nom de la création *")}</label>
            <input
              className="input"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <label>{t("Description")}</label>
            <textarea
              className="input"
              rows="2"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />

            <label>{t("Catégorie du fichier")}</label>
            <select
              className="input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {DIGITAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(c)}
                </option>
              ))}
            </select>

            {showModuleEditor && (
              <div className="creator-modules">
                <div className="creator-modules-head">
                  <div>
                    <label>{t("Modules de la formation")}</label>
                    <p className="hint creator-modules-hint">
                      {t(
                        "Présentez le contenu module par module : ils s'affichent dans « Ce que vous allez apprendre »."
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={generateModules}
                    disabled={modulesLoading}
                  >
                    {modulesLoading ? t("Génération…") : t("✨ Générer avec l'IA")}
                  </button>
                </div>
                {moduleList.length === 0 ? (
                  <p className="hint creator-modules-hint">
                    {t("Aucun module pour le moment : ajoutez-les ou laissez l'IA les proposer.")}
                  </p>
                ) : (
                  <div className="creator-module-list">
                    {moduleList.map((m, i) => (
                      <div className="creator-module" key={i}>
                        <div className="creator-module-head">
                          <strong>{t("Module {n}", { n: i + 1 })}</strong>
                          <div className="creator-module-actions">
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => moveModule(i, -1)}
                              disabled={i === 0}
                              title={t("Monter")}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => moveModule(i, 1)}
                              disabled={i === moduleList.length - 1}
                              title={t("Descendre")}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => removeModule(i)}
                              title={t("Supprimer ce module")}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <div className="row2">
                          <div>
                            <label>{t("Titre du module")}</label>
                            <input
                              className="input"
                              value={m.title || ""}
                              onChange={(e) => updateModule(i, { title: e.target.value })}
                              placeholder={t("ex : Les fondamentaux")}
                            />
                          </div>
                          <div>
                            <label>{t("Durée (ex : 45 min)")}</label>
                            <input
                              className="input"
                              value={m.duration || ""}
                              onChange={(e) => updateModule(i, { duration: e.target.value })}
                              placeholder={t("ex : 45 min")}
                            />
                          </div>
                        </div>
                        <label>{t("Sous-titre")}</label>
                        <input
                          className="input"
                          value={m.subtitle || ""}
                          onChange={(e) => updateModule(i, { subtitle: e.target.value })}
                          placeholder={t("ex : Comprendre les bases")}
                        />
                        <label>{t("Description du module")}</label>
                        <textarea
                          className="input"
                          rows="2"
                          value={m.description || ""}
                          onChange={(e) => updateModule(i, { description: e.target.value })}
                          placeholder={t("Ce que ce module apporte…")}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" className="btn btn-outline" onClick={addModule}>
                  {t("+ Ajouter un module")}
                </button>
              </div>
            )}

            <div className="row2">
              <div>
                <label>{t("Quantité")}</label>
                <p className="hint" style={{ margin: 0 }}>
                  {t("Illimitée — un fichier ne s'épuise pas.")}
                </p>
              </div>
              <div>
                <label>{t("Livraison")}</label>
                <p className="hint" style={{ margin: 0 }}>
                  {t("Offerte — le client télécharge le fichier.")}
                </p>
              </div>
            </div>

            <div className="row2">
              <div>
                <label>{t("Prix de vente ({symbol}) *", { symbol })}</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="ex : 5000"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div>
                <label>{t("Prix normal (barré, optionnel)")}</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="ex : 6500"
                  value={form.old_price}
                  onChange={(e) => setForm({ ...form, old_price: e.target.value })}
                />
              </div>
            </div>

            <div className="row2">
              <div>
                <label>{t("Commission pour les vendeurs ({symbol}) par article *", { symbol })}</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="any"
                  placeholder={t("ex : 1000")}
                  value={form.commission_amount}
                  onChange={(e) => setForm({ ...form, commission_amount: e.target.value })}
                />
              </div>
              <div>
                <label>{t("Contact")}</label>
                <div className="phone-input">
                  <span className="phone-prefix">{prefix}</span>
                  <input
                    className="input"
                    type="tel"
                    placeholder="ex : 6 90 00 00 00"
                    value={form.contact}
                    onChange={(e) =>
                      setForm({ ...form, contact: e.target.value.replace(/\D/g, "") })
                    }
                  />
                </div>
              </div>
            </div>

            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-block">
              {editingId ? t("Enregistrer") : t("Publier")}
            </button>
          </form>
        </div>
      )}

      {success && <p className="success">{success}</p>}
      {error && <p className="error">{error}</p>}

      <section className="card" style={{ marginBottom: 14 }}>
        <h2>📈 {t("Chiffre d'affaires des 14 derniers jours")}</h2>
        <MiniChart
          label={t("Chiffre d'affaires")}
          data={dailyBuckets(sales, {
            days: 14,
            dateKey: "created_at",
            valueFn: (s) => Number(s.total_price || 0) - Number(s.commission || 0),
          })}
        />
      </section>
      <section className="card stats">
        <h2>{t("Mes créations")}</h2>
        {products.length === 0 ? (
          <p className="empty">
            {t("Aucune création publiée pour le moment. Publiez votre première création !")}
          </p>
        ) : (
          <div className="grid">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                showCommission
                action={t("Modifier")}
                onAction={(selected) => editProduct(selected || p)}
                secondaryAction={t("Rétirer")}
                onSecondaryAction={() => removeProduct(p)}
                extraAction={
                  canUseFunnel && p.funnel_enabled
                    ? {
                        label: `🔥 ${t("Ouvrir le tunnel")}`,
                        onClick: (e) => {
                          e?.preventDefault?.();
                          e?.stopPropagation?.();
                          window.open(`/f/${p.id}`, "_blank", "noopener");
                        },
                      }
                    : null
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* Vidéos protégées : révocation / prolongation de l'accès de chaque
          acheteur (le composant ne rend rien si le compte n'en publie aucune). */}
      <VideoAccessPanel />

      <section className="card stats">
        <div className="stats-head">
          <h2>{t("Statistiques de mes créations")}</h2>
          <ExportSalesButton />
        </div>
        {stats ? (
          <div className="stats-row">
            <div>
              <span className="label">{t("Ventes enregistrées")}</span>
              <strong>{stats.total_sales}</strong>
            </div>
            <div>
              <span className="label">{t("Chiffre d'affaires")}</span>
              <strong>
                {formatMoney(stats.revenue)} {symbol}
              </strong>
            </div>
            <div>
              <span className="label">{t("Commissions pour les vendeurs")}</span>
              <strong>
                {formatMoney(stats.total_commission)} {symbol}
              </strong>
            </div>
          </div>
        ) : null}
        {sales.length === 0 ? (
          <p className="empty">{t("Aucune vente enregistrée pour le moment.")}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("Produit")}</th>
                  <th>{t("Vendeur")}</th>
                  <th>{t("Acheteur")}</th>
                  <th>{t("Qté")}</th>
                  <th>{t("Total")}</th>
                  <th>{t("Statut")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td>{s.product_name}</td>
                    <td>{s.seller_name || "—"}</td>
                    <td>{s.buyer_name || "—"}</td>
                    <td>{s.quantity}</td>
                    <td>
                      {formatMoney(s.total_price)} {countrySymbol(s.shop_country)}
                    </td>
                    <td>
                      {s.status === "pending" && (
                        <span className="badge badge-pending">{t("En attente de vente")}</span>
                      )}
                      {s.status === "delivered" && (
                        <span className="badge badge-bought">{t("Livré")}</span>
                      )}
                      {!["pending", "delivered"].includes(s.status) && (
                        <span className={`badge badge-${s.status}`}>{t(s.status)}</span>
                      )}
                    </td>
                    <td>
                      {s.status === "delivered" && (
                        <button
                          className="btn btn-small"
                          disabled={proofLoading}
                          onClick={() => openProof(s)}
                        >
                          📷 {t("Preuve")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {proofSale && (
        <div className="modal-overlay" onClick={() => setProofSale(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                📷 {t("Preuve de paiement")} — {proofSale.sale.product_name}
              </h3>
              <button className="drawer-close" onClick={() => setProofSale(null)}>
                ✕
              </button>
            </div>
            {String(proofSale.proof).startsWith("data:") || proofSale.proof?.startsWith("http") ? (
              <img
                src={proofSale.proof}
                alt={t("Preuve de paiement")}
                style={{ width: "100%", borderRadius: 10, maxHeight: 420, objectFit: "contain" }}
              />
            ) : null}
            <p className="hint" style={{ marginBottom: 0 }}>
              {t("Preuve fournie par la boutique lors du paiement de la commission.")}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
