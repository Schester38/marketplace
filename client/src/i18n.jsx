import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export const LANGS = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ar", label: "العربية", flag: "🇸🇦" },
  { code: "es", label: "Español", flag: "🇪🇸" },
];

const EN = {
  // Navbar / App
  Produits: "Products",
  "Vitrine d'offre": "Offers showcase",
  Connexion: "Sign in",
  "Créer un compte": "Create an account",
  "Ma boutique": "My shop",
  "Mon espace vendeur": "My seller space",
  "Mon espace client": "My client space",
  "Mon espace créateur": "My creator space",
  "Mon compte": "My account",
  Déconnexion: "Sign out",
  "Ouvrir le menu": "Open menu",
  "Fermer le menu": "Close menu",
  "Basculer le mode sombre ou clair": "Toggle dark or light mode",
  "Passer en mode clair": "Switch to light mode",
  "Passer en mode sombre": "Switch to dark mode",
  "Changer la langue du site": "Change site language",
  "Suivez sur": "Follow on",
  "Suivez-nous sur les réseaux sociaux": "Follow us on social media",
  "Espace réservé. Entrez le mot de passe administrateur.":
    "Restricted area. Enter the administrator password.",
  "Mot de passe": "Password",
  "Vérification…": "Checking…",
  Entrer: "Enter",
  "Se déconnecter": "Log out",
  boutique: "shop",
  vendeur: "seller",
  client: "client",
  créateur: "creator",
  "Mon espace": "My space",
  "Chargement…": "Loading…",
  "Page introuvable": "Page not found",
  "Retour à l'accueil": "Back to home",
  Retour: "Back",

  // Footer
  "À propos": "About",
  Contact: "Contact",
  "Marché en ligne pour boutiques, vendeurs, clients et créateurs. Commandez facilement via WhatsApp.":
    "Online marketplace for shops, sellers, clients and creators. Order easily via WhatsApp.",
  Navigation: "Navigation",
  Accueil: "Home",
  Compte: "Account",
  "Tous droits réservés.": "All rights reserved.",

  // Newsletter
  "Restez informé": "Stay informed",
  "Recevez nos bons plans et nouveautés directement par email.":
    "Get our deals and news directly by email.",
  "Votre adresse email": "Your email address",
  "S'abonner": "Subscribe",
  "Envoi…": "Sending…",
  "Merci ! Vous êtes bien inscrit(e) à la newsletter.":
    "Thank you! You are subscribed to the newsletter.",
  "Adresse invalide ou problème lors de l'inscription. Réessayez.":
    "Invalid address or problem during signup. Try again.",
  "Désinscription possible à tout moment via le lien présent dans chaque email.":
    "You can unsubscribe at any time via the link in each email.",

  // Support / menu
  "Je soutiens": "Support us",
  "Formations et Digital": "Training & Digital",
  "Formation Mboppi": "Mboppi Training",
  "Je soutiens Mboppi": "Support Mboppi",
  "Chaque geste compte pour faire grandir Mboppi": "Every gesture counts to grow Mboppi",
  "Votre soutien nous aide à payer les frais du site, à améliorer la plateforme et à accompagner nos boutiques et vendeurs. Chaque contribution, même petite, fait avancer le projet.":
    "Your support helps us pay for the site, improve the platform and support our shops and sellers. Every contribution, however small, moves the project forward.",
  "Comment pouvez-vous soutenir le projet ?": "How can you support the project?",
  "Choisissez le moyen qui vous convient.": "Choose the method that suits you.",
  "Orange Money": "Orange Money",
  "MTN Mobile Money": "MTN Mobile Money",
  PayPal: "PayPal",
  "Virement bancaire (UBA)": "Bank transfer (UBA)",
  "Merci pour votre soutien !": "Thank you for your support!",
  "Avec votre aide, Mboppi continue de connecter les boutiques, les vendeurs et les clients de toute la communauté.":
    "With your help, Mboppi keeps connecting shops, sellers and customers across the community.",
  "Soutenez Mboppi : Orange Money, MTN Mobile Money, PayPal ou virement bancaire UBA.":
    "Support Mboppi: Orange Money, MTN Mobile Money, PayPal or UBA bank transfer.",

  // ProductCard
  "Boutique : {shop}": "Shop: {shop}",
  "Garantie {n} mois": "{n}-month warranty",
  "Livraison {price} {symbol}": "Delivery {price} {symbol}",
  "Livraison gratuite": "Free delivery",
  "Prix de vente": "Sale price",
  "Commission ({n}%)": "Commission ({n}%)",
  "En stock : {n}": "In stock: {n}",
  "Rupture de stock": "Out of stock",
  Vendre: "Sell",

  // OfferCard
  "Économisez {n} {symbol}": "Save {n} {symbol}",

  // Seo
  "Mboppi - {title}": "Mboppi - {title}",
  "Mboppi : boutique en ligne, vendeurs, créateurs.":
    "Mboppi: online marketplace, sellers, creators.",
  "Marché en ligne Mboppi.": "Mboppi online marketplace.",

  // Home
  "Bienvenue sur Mboppi": "Welcome to Mboppi",
  "Le marché où boutiques, vendeurs et créateurs se rencontrent. Commandez directement sur WhatsApp !":
    "The marketplace where shops, sellers and creators meet. Order directly on WhatsApp!",
  "Voir les offres": "View offers",
  "Créer un compte gratuit": "Create a free account",
  "Produits récents": "Recent products",
  "Offres du moment": "Current offers",
  "Aucun produit disponible pour le moment.": "No products available right now.",
  "Bienvenue chez Mboppi": "Welcome to Mboppi",
  "BIENVENUE SUR MBOPPI": "WELCOME TO MBOPPI",
  "Rechercher un produit, une boutique…": "Search for a product, a shop…",
  "Rechercher un produit": "Search a product",
  "Rechercher une boutique": "Search a shop",
  "Rechercher une création": "Search a creation",
  "Type de recherche": "Search type",
  "Catégories populaires": "Popular categories",
  "Voir toutes les offres": "View all offers",
  "Réinitialiser les filtres": "Reset filters",
  "Filtrer par catégorie": "Filter by category",
  Trier: "Sort",
  "Aucun produit dans cette catégorie.": "No product in this category.",
  "Aucun résultat pour votre recherche.": "No results for your search.",
  "Aucun produit disponible.": "No products available.",
  "Prix normal ({symbol})": "Normal price ({symbol})",
  "ex : 5000 (s'affiche barré)": "ex: 5000 (shown crossed out)",
  "ex : 3500 (s'affiche en vert)": "ex: 3500 (shown in green)",
  "Garantie (chiffres ou lettres)": "Warranty (digits or words)",
  "Renseignez au moins un prix (normal ou de vente).": "Enter at least one price (normal or sale).",
  "Rejoignez Mboppi": "Join Mboppi",
  "Boutiques en ligne": "Online shops",
  "Créez votre vitrine et publiez vos produits.": "Create your showcase and publish your products.",
  Vendeurs: "Sellers",
  "Vendez les produits des boutiques et gagnez des commissions.":
    "Sell shop products and earn commissions.",
  Clients: "Clients",
  "Parcourez le marché et commandez sur WhatsApp.": "Browse the marketplace and order on WhatsApp.",
  Créateurs: "Creators",
  "Faites rayonner vos créations.": "Showcase your creations.",
  "Les créateurs": "The creators",
  "Créateurs de Mboppi": "Creators of Mboppi",
  "Découvrez les créateurs de Mboppi et leurs créations artisanales.":
    "Discover the creators of Mboppi and their handcrafted creations.",
  "Créations de {name}": "Creations by {name}",
  "Créations sur Mboppi": "Creations on Mboppi",
  "Vitrine de créations sur Mboppi.": "Creator showcase on Mboppi.",
  "Voir ma vitrine": "View my showcase",
  "Voir les créations": "View the creations",
  "Aucun créateur pour le moment.": "No creators yet.",
  Commencer: "Get started",

  // Register
  Inscription: "Registration",
  "Pays *": "Country *",
  "Choisir votre pays…": "Choose your country…",
  "Je veux m'inscrire en tant que :": "I want to register as:",
  "Boutique (shop)": "Shop",
  "Je crée et gère ma boutique.": "I create and manage my shop.",
  "Vendeur (seller)": "Seller",
  "Je vends les produits des boutiques et gagne une commission.":
    "I sell shop products and earn a commission.",
  Client: "Client",
  "Je consulte le marché et je commande.": "I browse the marketplace and order.",
  "Créateur (creator)": "Creator",
  "Je mets en valeur mes créations.": "I showcase my creations.",
  "Nom complet *": "Full name *",
  "Adresse e-mail *": "Email address *",
  "Mot de passe *": "Password *",
  "6 caractères minimum": "At least 6 characters",
  "S'inscrire": "Register",
  "Déjà un compte ?": "Already have an account?",
  "Se connecter": "Sign in",
  "ou s'inscrire avec Google": "or register with Google",
  "Veuillez remplir tous les champs.": "Please fill in all fields.",
  "Une erreur est survenue, réessayez.": "An error occurred, try again.",

  // Login
  "Connexion à Mboppi": "Sign in to Mboppi",
  "Ravi de vous revoir !": "Glad to see you again!",
  "Se connecter à mon compte": "Sign in to my account",
  "Mot de passe": "Password",
  "Pas encore de compte ?": "No account yet?",
  "S'inscrire ici": "Register here",
  "Email ou mot de passe incorrect.": "Incorrect email or password.",
  "Numéro de téléphone": "Phone number",

  // Email verification
  "Vérifiez votre email": "Verify your email",
  "Un email de confirmation a été envoyé à": "A confirmation email was sent to",
  "Cliquez sur le lien qu'il contient pour activer votre compte, puis connectez-vous.":
    "Click the link inside it to activate your account, then sign in.",
  "Vous ne l'avez pas reçu ? Vérifiez les spams ou": "Did not receive it? Check your spam or",
  "renvoyer l'email": "resend the email",
  "Envoi…": "Sending…",
  "Aller à la connexion": "Go to sign in",
  "Confirmation de l'email": "Email confirmation",
  "Confirmation…": "Confirming…",
  "Nous vérifions votre adresse email…": "We are checking your email address…",
  "Email confirmé !": "Email confirmed!",
  "Votre adresse email est confirmée. Votre compte est maintenant actif.":
    "Your email address is confirmed. Your account is now active.",
  "Confirmation impossible": "Unable to confirm",
  "Votre adresse email": "Your email address",
  "Renvoyer un lien de confirmation": "Resend a confirmation link",
  "Renseignez votre adresse email.": "Enter your email address.",
  "Un nouveau lien de confirmation a été envoyé. Vérifiez votre boîte mail.":
    "A new confirmation link was sent. Check your inbox.",
  "Lien de confirmation invalide ou manquant.": "Missing or invalid confirmation link.",
  "Votre adresse email n'est pas encore confirmée. Cliquez sur le lien reçu par email pour activer votre compte.":
    "Your email address is not confirmed yet. Click the link you received by email to activate your account.",
  "Renvoyer le lien de confirmation": "Resend the confirmation link",
  "Un nouveau lien de confirmation vient d'être envoyé. Vérifiez votre boîte mail.":
    "A new confirmation link has just been sent. Check your inbox.",

  // AuthGoogle
  "Connexion en cours…": "Signing in…",
  "Merci de patienter pendant la connexion à votre compte Google.":
    "Please wait while we sign you in with your Google account.",
  "Connexion réussie, redirection…": "Sign-in successful, redirecting…",

  // MyAccount
  Profil: "Profile",
  "Votre nom, votre adresse e-mail et votre pays.": "Your name, email address and country.",
  Nom: "Name",
  "E-mail": "Email",
  Pays: "Country",
  "Localisation (ville)": "Location (city)",
  "Votre ville ou quartier (affiché sur vos produits).":
    "Your city or area (shown on your products).",
  Enregistrer: "Save",
  "Profil mis à jour !": "Profile updated!",
  Sécurité: "Security",
  "Modifier mon mot de passe": "Change my password",
  "Vous pouvez changer votre mot de passe à tout moment.":
    "You can change your password at any time.",
  "Mot de passe actuel": "Current password",
  "Nouveau mot de passe": "New password",
  "Confirmer le mot de passe": "Confirm password",
  "Confirmer le nouveau mot de passe": "Confirm new password",
  "Changer le mot de passe": "Change password",
  "Mot de passe modifié !": "Password changed!",
  "Les mots de passe ne correspondent pas.": "Passwords do not match.",
  "Mot de passe actuel incorrect.": "Current password is incorrect.",
  "Zone dangereuse": "Danger zone",
  "Supprimer mon compte": "Delete my account",
  "La suppression est définitive : produits et ventes seront retirés.":
    "Deletion is permanent: products and sales will be removed.",
  "Confirmer la suppression": "Confirm deletion",
  "Entrez votre mot de passe pour confirmer :": "Enter your password to confirm:",
  "Compte supprimé. À bientôt !": "Account deleted. See you soon!",
  "Mot de passe incorrect.": "Incorrect password.",
  "Veuillez entrer votre mot de passe.": "Please enter your password.",
  "Le mot de passe doit contenir au moins 6 caractères.":
    "The password must be at least 6 characters.",

  // ShopDashboard
  "Gérez vos produits et suivez vos ventes.": "Manage your products and track your sales.",
  "+ Ajouter un produit": "+ Add a product",
  Annuler: "Cancel",
  Retirer: "Remove",
  "Ajouter un produit": "Add a product",
  "Nom du produit *": "Product name *",
  "Catégorie *": "Category *",
  "Choisir une catégorie…": "Choose a category…",
  Description: "Description",
  "Photos (3 max)": "Photos (max 3)",
  "Ajouter une photo": "Add a photo",
  "Vos produits": "Your products",
  "Aucun produit pour le moment.": "No products yet.",
  "Garantie (mois)": "Warranty (months)",
  "Quantité *": "Quantity *",
  "Frais de livraison ({symbol})": "Delivery fee ({symbol})",
  "Contact de la boutique": "Shop contact",
  "Prix de vente ({symbol}) *": "Sale price ({symbol}) *",
  "Commission vendeur (%) *": "Seller commission (%) *",
  "Produit ajouté !": "Product added!",
  "Produit mis à jour !": "Product updated!",
  "Produit supprimé.": "Product deleted.",
  "Enregistrer les modifications": "Save changes",
  "Ventes enregistrées": "Recorded sales",
  "Chiffre d'affaires": "Revenue",
  "Commissions versées aux vendeurs": "Commissions paid to sellers",
  "Aucune vente pour le moment.": "No sales yet.",
  "Historique des ventes": "Sales history",
  Produit: "Product",
  Vendeur: "Seller",
  Acheteur: "Buyer",
  Date: "Date",
  Quantité: "Quantity",
  Total: "Total",
  Commission: "Commission",
  "Le vendeur affichera : {price} {symbol} et gagnera {commission} {symbol} de commission.":
    "The seller will display: {price} {symbol} and earn {commission} {symbol} commission.",
  Modifier: "Edit",
  Rétirer: "Remove",
  "Retrait…": "Removing…",

  // SellerDashboard
  "Produits disponibles": "Available products",
  "Commission totale générée": "Total commission generated",
  "Commission confirmée": "Confirmed commission",
  "Vendre : {name}": "Sell: {name}",
  "Prix : {price} {symbol} — Votre commission : {commission} {symbol} par unité":
    "Price: {price} {symbol} — Your commission: {commission} {symbol} per unit",
  "Nom de l'acheteur *": "Buyer name *",
  "Téléphone de l'acheteur": "Buyer phone",
  "Vente enregistrée !": "Sale recorded!",
  "Mes ventes": "My sales",
  "Total de la vente": "Sale total",
  "Votre commission": "Your commission",
  Statut: "Status",
  Confirmée: "Confirmed",
  "En attente de confirmation": "Pending confirmation",

  // ClientDashboard
  "Bienvenue {name} !": "Welcome {name}!",
  "Découvrez les produits et offres des boutiques.": "Discover shop products and offers.",
  "Voir les produits": "View products",
  "Compte créé le {date}": "Account created on {date}",
  "Derniers produits": "Latest products",
  "Mes informations": "My information",

  // CreatorDashboard
  "Bienvenue {name} ! Faites rayonner vos créations sur le marché Mboppi.":
    "Welcome {name}! Showcase your creations on the Mboppi marketplace.",
  "Bientôt disponible : une vitrine dédiée à vos créations.":
    "Coming soon: a dedicated showcase for your creations.",

  // ProductDetail
  "Retour aux produits": "Back to products",
  Boutique: "Shop",
  "Quantité disponible : {n}": "Available quantity: {n}",
  "Commandez sur WhatsApp": "Order on WhatsApp",
  "Message par défaut": "Default message",
  "Rétirer ce produit": "Remove this product",
  "Produit introuvable.": "Product not found.",
  "Votre message WhatsApp :": "Your WhatsApp message:",

  // OfferDetail
  "Retour aux offres": "Back to offers",
  "Prix d'origine : {price} {symbol}": "Original price: {price} {symbol}",
  "Commandez cette offre": "Order this offer",
  "Offre introuvable.": "Offer not found.",
  "Catégorie : {cat}": "Category: {cat}",
  "Garantie : {warranty}": "Warranty: {warranty}",
  "Disponible : {n}": "Available: {n}",

  // VitrineOffre
  "Vitrine d'offres": "Offers showcase",
  "Découvrez les meilleures offres du moment.": "Discover the best current offers.",
  "Rechercher une offre…": "Search an offer…",
  "Catégorie :": "Category:",
  Toutes: "All",
  "Économies totales : {n} {symbol}": "Total savings: {n} {symbol}",
  "Aucune offre trouvée.": "No offers found.",
  "Résultat : {n} offre(s)": "Result: {n} offer(s)",

  // Verone
  "Gestion des offres": "Offers management",
  "Zone réservée.": "Restricted area.",
  "Fermer le formulaire": "Close form",
  "+ Ajouter une Offre": "+ Add an offer",
  "Nom de l'offre *": "Offer name *",
  Catégorie: "Category",
  "ex : Électronique, Mode, Alimentation…": "e.g. Electronics, Fashion, Food…",
  Garantie: "Warranty",
  "ex : 6 mois, 1 an, 2 ans": "e.g. 6 months, 1 year, 2 years",
  "Prix promotionnel ({symbol}) *": "Promo price ({symbol}) *",
  "Publier l'offre": "Publish offer",
  "Offre publiée !": "Offer published!",
  "Mise à jour réussie !": "Updated successfully!",
  Supprimer: "Delete",
  "Mot de passe requis": "Password required",
  "Supprimer cette offre ?": "Delete this offer?",
  "Photo :": "Photo:",
  "Prix original : {price} {symbol}": "Original price: {price} {symbol}",
  "Prix promotionnel : {price} {symbol}": "Promo price: {price} {symbol}",

  // About
  "À propos de Mboppi": "About Mboppi",
  "Mboppi est un marché en ligne conçu pour connecter boutiques, vendeurs, clients et créateurs.":
    "Mboppi is an online marketplace designed to connect shops, sellers, clients and creators.",
  "Notre mission": "Our mission",
  "Faciliter le commerce local en donnant à chacun une vitrine simple et accessible, avec commande directe via WhatsApp.":
    "Facilitate local commerce by giving everyone a simple and accessible storefront, with direct ordering via WhatsApp.",
  "Nos valeurs": "Our values",
  Simplicité: "Simplicity",
  "Une prise en main rapide pour tous.": "Quick onboarding for everyone.",
  Transparence: "Transparency",
  "Des commissions claires et visibles.": "Clear and visible commissions.",
  Communauté: "Community",
  "Boutiques, vendeurs et créateurs grandissent ensemble.":
    "Shops, sellers and creators grow together.",
  "Pour qui ?": "Who is it for?",
  Boutiques: "Shops",
  "Vendez vos produits à travers des vendeurs partenaires.":
    "Sell your products through partner sellers.",
  "Gagnez des commissions sur chaque vente.": "Earn a commission on every sale.",
  "Commandez facilement sur WhatsApp.": "Order easily on WhatsApp.",
  "Présentez vos créations au marché.": "Showcase your creations to the market.",
  "Contactez-nous": "Contact us",
  "Une question ? Écrivez-nous sur WhatsApp.": "A question? Write to us on WhatsApp.",

  // Contact
  "Une question, un problème ou une suggestion ? Écrivez-nous, nous répondons rapidement.":
    "A question, an issue or a suggestion? Write to us, we reply quickly.",
  "Nom *": "Name *",
  "Votre nom": "Your name",
  "E-mail *": "Email *",
  "Votre e-mail": "Your email",
  "Message *": "Message *",
  "Votre message…": "Your message…",
  "Envoyer via WhatsApp": "Send via WhatsApp",
  "Ou directement sur WhatsApp": "Or directly on WhatsApp",
  "Votre message :": "Your message:",

  // Privacy
  "Données personnelles": "Privacy policy",
  "Quelles données collectons-nous ?": "What data do we collect?",
  "Nom, adresse e-mail, pays et rôle sur la plateforme.":
    "Name, email address, country and role on the platform.",
  "À quoi servent vos données ?": "What are your data used for?",
  "Gérer votre compte, afficher vos produits et enregistrer vos ventes.":
    "Manage your account, display your products and record your sales.",
  "Combien de temps sont-elles conservées ?": "How long are they kept?",
  "Tant que votre compte est actif. Vous pouvez le supprimer à tout moment depuis votre espace.":
    "As long as your account is active. You can delete it at any time from your space.",
  "Les mots de passe sont chiffrés et les données sont protégées.":
    "Passwords are encrypted and data is protected.",
  "Comment supprimer mes données ?": "How do I delete my data?",
  "Allez dans « Mon compte » puis « Supprimer mon compte ».":
    'Go to "My account" then "Delete my account".',

  // Shared
  "Tout le monde": "Everyone",
  Tous: "All",
  "Rechercher…": "Search…",
  Recherche: "Search",
  Favoris: "Favorites",
  Panier: "Cart",
  "Oups, une erreur est survenue.": "Oops, something went wrong.",
  "Réessayez ou rechargez la page. Vos données sont en sécurité.":
    "Try again or reload the page. Your data is safe.",
  "Pas de connexion internet": "No internet connection",
  "Vous êtes actuellement hors ligne. Vérifiez votre connexion puis réessayez.":
    "You are currently offline. Check your connection and try again.",
  "Mes fonds & transactions": "My funds & transactions",
  "Solde": "Balance",
  "Reçus": "Received",
  "Sortis": "Paid out",
  "Reversement en ligne": "Online payout",
  "Encaissement en ligne": "Online collection",
  "Aucune transaction de fonds pour le moment.": "No fund transactions yet.",
  "Fonds indisponibles pour le moment.": "Funds currently unavailable.",
  "Erreurs récentes (client)": "Recent errors (client)",
  "Journal des erreurs de rendu remontées par les navigateurs. Si l'écran « Oups, une erreur est survenue » apparaît, sa cause exacte (message + pile) est enregistrée ici.":
    "Rendering errors reported by browsers. If the “Oops, something went wrong” screen appears, its exact cause (message + stack) is recorded here.",
  "Pile (début)": "Stack (start)",
  "Aucune erreur enregistrée": "No errors recorded",
  Réessayer: "Retry",
  "Désolé, Mboppi ne peut pas se connecter à internet en ce moment. Vérifiez votre réseau (Wi-Fi ou données mobiles) puis réessayez.":
    "Sorry, Mboppi cannot connect to the internet right now. Check your network (Wi-Fi or mobile data) and try again.",
  "Toujours pas de connexion. Vérifiez votre réseau puis réessayez.":
    "Still no connection. Check your network and try again.",
  "Vos informations sont en sécurité sur votre appareil : rien n'est perdu.":
    "Your information is safe on your device: nothing is lost.",
  Rechercher: "Search",
  "Aucun résultat": "No results",
  "Données & confidentialité": "Privacy & data",
  Appeler: "Call",
  "{n} photos": "{n} photos",
  "Commander sur WhatsApp": "Order on WhatsApp",
  "Disponibilité : {n} unité(s)": "Availability: {n} unit(s)",
  Offre: "Offer",
  "Bonjour, je suis intéressé(e) par votre offre « {name} » : {url}":
    'Hello, I am interested in your offer "{name}": {url}',
  "Bonjour, je suis intéressé(e) par le produit « {name} » : {url}":
    'Hello, I am interested in the product "{name}": {url}',
  "Je publie mes produits (max 5) et je fixe les commissions":
    "I publish my products (max 5) and set the commissions",
  "Je vends les produits des boutiques et je gagne des commissions":
    "I sell shop products and earn commissions",
  "Je consulte les offres et les produits, je commande facilement":
    "I browse offers and products, and order easily",
  "Je présente et vends mes créations au marché Mboppi":
    "I showcase and sell my creations on the Mboppi marketplace",
  "Nom complet / Nom de la boutique": "Full name / Shop name",
  Email: "Email",
  "Mot de passe (6 caractères minimum)": "Password (at least 6 characters)",
  ou: "or",
  "S'inscrire avec Google": "Register with Google",
  "Se connecter avec Google": "Sign in with Google",
  "Déjà inscrit ?": "Already registered?",
  "Retour à l'inscription": "Back to registration",
  "Produits publiés : {n} / 5": "Published products: {n} / 5",
  "Limite atteinte": "Limit reached",
  "Nouveau produit": "New product",
  "Modifier le produit": "Edit product",
  "Photos (maximum {n})": "Photos (max {n})",
  "Compression…": "Compressing…",
  "Photos complètes": "Photos complete",
  "📷 Ajouter des photos": "📷 Add photos",
  "Quantité en stock *": "Stock quantity *",
  "Garantie (en mois)": "Warranty (months)",
  "Publier le produit": "Publish product",
  "Produit publié avec succès.": "Product published successfully.",
  "Supprimer ce produit ?": "Delete this product?",
  "Aucun produit pour le moment. Ajoutez votre premier produit (max 5).":
    "No products yet. Add your first product (max 5).",
  "Statistiques des ventes": "Sales statistics",
  "Aucune vente enregistrée par les vendeurs.": "No sales recorded by sellers.",
  Qté: "Qty",
  Confirmer: "Confirm",
  "Sélectionnez un produit des boutiques et enregistrez une vente.":
    "Select a shop product and record a sale.",
  "Ventes réalisées": "Sales made",
  "Vendre ce produit": "Sell this product",
  "Téléphone (optionnel)": "Phone (optional)",
  "Enregistrer la vente": "Record the sale",
  "Aucun produit disponible à vendre pour le moment.": "No products available to sell right now.",
  "Mes ventes et commissions": "My sales and commissions",
  "Vous n'avez pas encore enregistré de vente.": "You have not recorded a sale yet.",
  "Vente enregistrée. Commission créditée sur votre compte.":
    "Sale recorded. Commission credited to your account.",
  "Commissions sur les produits": "Product commissions",
  "Commissions fixées par les boutiques sur chaque produit. Cliquez sur une colonne pour trier.":
    "Commissions set by shops on each product. Click a column to sort.",
  "Commission %": "Commission %",
  Montant: "Amount",
  "Publication de produit": "Product published",
  "Commission payée": "Commission paid",
  "Commission de parrainage": "Referral commission",
  Activité: "Activity",
  "Voir plus de produits": "Show more products",
  "Télécharger le tableau (Excel)": "Download the table (Excel)",
  "Le fichier téléchargé liste chaque activité du compte : publications de produits, ventes, commissions payées, achats et commandes.":
    "The downloaded file lists every account activity: product publications, sales, paid commissions, purchases and orders.",
  "Mon code vendeur": "My seller code",
  "Générer mon code": "Generate my code",
  "Votre code identifie vos ventes auprès des boutiques. Communiquez-le à vos clients ou partagez votre lien de vente.":
    "Your code identifies your sales with the shops. Give it to your clients or share your sale link.",
  "Code copié !": "Code copied!",
  "Copier le code": "Copy the code",
  "Aucune commande trouvée avec ce code.": "No order found with this code.",
  Copier: "Copy",
  "Copié !": "Copied!",
  "Code vendeur généré : {code}": "Seller code generated: {code}",
  "Lien du produit": "Product link",
  "Lien de vente": "Sale link",
  "Générez votre code vendeur pour obtenir le lien de vente.":
    "Generate your seller code to get the sale link.",
  "La boutique va livrer le produit. Partagez le lien de vente à votre client : il confirmera l'achat avec votre code {code}.":
    "The shop will deliver the product. Share the sale link with your client: they will confirm the purchase with your code {code}.",
  "Prix unitaire : {price} {symbol} — Votre commission : {commission} {symbol} par unité":
    "Unit price: {price} {symbol} — Your commission: {commission} {symbol} per unit",
  "Vente en attente": "Pending sale",
  Acheté: "Bought",
  Annulée: "Cancelled",
  "Code vendeur": "Seller code",
  "Prix payé": "Price paid",
  Acheter: "Buy",
  "Achat confirmé !": "Purchase confirmed!",
  "Produit non trouvé": "Product not found",
  "Confirmer l'achat": "Confirm purchase",
  "Code du vendeur *": "Seller code *",
  "Prix d'achat ({symbol}) *": "Purchase price ({symbol}) *",
  "Nom de l'acheteur": "Buyer name",
  "Vous devez être connecté pour confirmer l'achat.":
    "You must be signed in to confirm the purchase.",
  "La boutique et le vendeur ont été notifiés. Retrouvez cet achat dans votre espace client.":
    "The shop and the seller have been notified. Find this purchase in your client space.",
  "Voir mes achats": "View my purchases",
  "Continuer mes achats": "Continue shopping",
  "Mes achats": "My purchases",
  "Aucun achat pour le moment.": "No purchases yet.",
  "Ce produit vous est proposé par un vendeur Mboppi.":
    "This product is offered by a Mboppi seller.",
  "Code du vendeur : {code} — Confirmez votre achat pour le notifier, lui et la boutique.":
    "Seller code: {code} — Confirm your purchase to notify them and the shop.",
  "Confirmez votre achat : la boutique et le vendeur seront notifiés.":
    "Confirm your purchase: the shop and the seller will be notified.",
  "Ce produit vous est proposé par un vendeur Mboppi. Entrez son code et le prix convenu pour confirmer l'achat.":
    "This product is offered by a Mboppi seller. Enter their code and the agreed price to confirm the purchase.",
  "Vendeur : {seller}": "Seller: {seller}",
  Notifications: "Notifications",
  "Tout marquer comme lu": "Mark all as read",
  "Aucune notification": "No notifications",
  "Supprimer la notification": "Delete notification",
  "Installer l'application": "Install the app",
  "Pour installer Mboppi : ouvrez le menu Partager de votre navigateur (Safari) puis choisissez « Sur l'écran d'accueil ».":
    'To install Mboppi: open your browser (Safari) Share menu, then choose "Add to Home Screen".',
  "Pour installer Mboppi : ouvrez le menu de votre navigateur (⋮ ou ⋯) puis choisissez « Ajouter à l'écran d'accueil » ou « Installer l'application ».":
    'To install Mboppi: open your browser menu (⋮ or ⋯) and choose "Add to Home Screen" or "Install app".',
  "Votre vente de « {product} » a été achetée par {buyer}.":
    'Your sale of "{product}" was bought by {buyer}.',
  "Votre vente de « {product} » a été confirmée par la boutique pour {buyer}.":
    'Your sale of "{product}" was confirmed by the shop for {buyer}.',
  "Votre commande « {product} » a été confirmée par la boutique.":
    'Your order "{product}" was confirmed by the shop.',
  "Votre vente de « {product} » a été annulée par la boutique.":
    'Your sale of "{product}" was cancelled by the shop.',
  "Votre commande « {product} » a été annulée par la boutique.":
    'Your order "{product}" was cancelled by the shop.',
  "Vente de « {product} » annulée — vendeur : {seller} ({code}), acheteur : {buyer}.":
    'Sale of "{product}" cancelled — seller: {seller} ({code}), buyer: {buyer}.',
  "Votre filleul {buyer} a commandé « {product} » chez {shop} — 2% ({amount} {symbol}) à recevoir après livraison.":
    'Your referred client {buyer} ordered "{product}" from {shop} — 2% ({amount} {symbol}) to receive after delivery.',
  "Le parrain {parrain} réclame 2% ({amount} {symbol}) pour « {product} ».":
    'The referrer {parrain} claims 2% ({amount} {symbol}) for "{product}".',
  "Votre commission de parrainage ({amount} {symbol}) pour « {product} » a été payée par {shop}.":
    'Your referral commission ({amount} {symbol}) for "{product}" was paid by {shop}.',
  "Commande parrainée de {buyer} pour « {product} » — 2% ({amount} {symbol}) à verser au parrain après livraison.":
    'Referred order from {buyer} for "{product}" — 2% ({amount} {symbol}) to pay to the referrer after delivery.',
  "Parrainage en attente": "Referral pending",
  "Parrainage payé": "Referral paid",
  "Mes filleuls — commissions de parrainage (2%)":
    "My referred clients — referral commissions (2%)",
  "Commissions de parrainage vendeur": "Seller referral commissions",
  "Chaque vendeur ou créateur qui s'inscrit via votre lien et paie son adhésion (1 500 F) vous fait gagner 1 000 F (net 900 F après frais) ; 500 F sont reversés à Mboppi.":
    "Each seller or creator who signs up through your link and pays their membership (1,500 F) earns you 1,000 F (net 900 F after fees); 500 F is paid to Mboppi.",
  "Actuellement tout le monde a accès gratuitement (même les parrainés) tant que l'administrateur ne ferme pas le compte : la commission de 1 000 F n'est donc versée que lorsqu'un affilié paie réellement son adhésion.":
    "Currently everyone has free access (including referred members) as long as the administrator does not close the account: the 1,000 F commission is therefore only paid out when a referred member actually pays their membership.",
  "Vendeurs / créateurs parrainés — commission de 1 000 F":
    "Referred sellers / creators — 1,000 F commission",
  "Chaque vendeur ou créateur qui s'inscrit via votre lien et paie son adhésion (1 500 F) vous fait gagner 1 000 F. Actuellement tout le monde a accès gratuitement (même les parrainés) tant que l'administrateur ne ferme pas le compte : la commission n'est donc versée que lorsqu'un affilié paie réellement son adhésion.":
    "Each seller or creator who signs up through your link and pays their membership (1,500 F) earns you 1,000 F (net 900 F after fees); 500 F is paid to Mboppi. Currently everyone has free access (including referred members) as long as the administrator does not close the account: the commission is only paid out when a referred member actually pays their membership.",
  "Chaque vendeur ou créateur qui s'inscrit via votre lien et paie son adhésion (1 500 F) vous fait gagner 1 000 F":
    "Each seller or creator who signs up through your link and pays their membership (1,500 F) earns you 1,000 F",
  "Chaque vendeur ou créateur qui s'inscrit via votre lien et paie son adhésion (1 500 F) vous fait gagner 1 000 F. La commission est versée manuellement par l'administration.":
    "Each seller or creator who signs up through your link and pays their membership (1,500 F) earns you 1,000 F. The commission is paid out manually by the administration.",
  "Membre": "Member",
  "Rôle": "Role",
  "Adhésion": "Membership",
  "Commission": "Commission",
  "Statut": "Status",
  "Versée": "Paid out",
  "En cours": "In progress",
  "En attente d'adhésion": "Awaiting membership payment",
  "Non payée": "Not paid",
  "Adhésion payée": "Membership paid",
  Payé: "Paid",
  "Marquer l'adhésion de {name} comme payée et avertir son parrain ?":
    "Mark {name}'s membership as paid and notify their referrer?",
  "Montant disponible": "Available amount",
  "Demande de retrait": "Withdrawal request",
  "Références des parrainés (adhésion confirmée)": "Referred members' references (confirmed membership)",
  "Montant à retirer": "Amount to withdraw",
  "Le montant doit être inférieur ou égal à votre solde disponible (multiple de 1 000 F).":
    "The amount must be less than or equal to your available balance (multiple of 1,000 F).",
  "Aucun moyen de paiement configuré": "No payment method configured",
  "Moyen de paiement parrain": "Referrer payment method",
  "Commentaire (optionnel)": "Comment (optional)",
  "Un petit commentaire…": "A short comment…",
  "Confirmer le retrait": "Confirm withdrawal",
  "Demande reçue": "Request received",
  "Votre demande de retrait de {amount} F a bien été reçue par l'équipe Mboppi. Elle sera traitée dans un délai maximum de 24 h.":
    "Your withdrawal request of {amount} F has been received by the Mboppi team. It will be processed within 24 hours.",
  "Chaque vendeur ou créateur qui s'inscrit via votre lien et paie son adhésion (1 500 F) vous fait gagner 1 000 F, validé par l'administration. Retrait possible dès 5 000 F.":
    "Each seller or creator who signs up through your link and pays their membership (1,500 F) earns you 1,000 F, validated by the administration. Withdrawal possible from 5,000 F.",
  "Demandes de retrait (commissions d'activation)": "Withdrawal requests (activation commissions)",
  "Parrainés (adhésion confirmée)": "Referred members (confirmed membership)",
  Commentaire: "Comment",
  "Aucune demande de retrait": "No withdrawal requests",
  Payer: "Pay",
  "Payer la demande de retrait de {amount} F pour {name} ?": "Pay the withdrawal request of {amount} F for {name}?",
  "Votre demande de retrait de {amount} F a bien été reçue. Elle sera traitée dans un délai maximum de 24 h.":
    "Your withdrawal request of {amount} F has been received. It will be processed within 24 hours.",
  "Votre demande de retrait de {amount} F a été payée par l'équipe Mboppi.":
    "Your withdrawal request of {amount} F has been paid by the Mboppi team.",
  "Un de vos filleuls a payé son adhésion — votre commission de 1 000 F est en attente de versement.":
    "One of your referred members has paid their membership — your 1,000 F commission is awaiting payout.",
  "Parrainages (vendeurs / créateurs)": "Referrals (sellers / creators)",
  "Rechercher par numéro de référence (parrainé ou parrain)…":
    "Search by reference number (referred member or referrer)…",
  "Parrainé": "Referred member",
  "Référence": "Reference",
  "Référence parrainé": "Referred member reference",
  "Téléphone parrainé": "Referred member phone",
  "Son parrain": "Their referrer",
  "Référence parrain": "Referrer reference",
  "Téléphone parrain": "Referrer phone",
  "Aucun parrainage": "No referrals",
  "Chaque commande passée par un client inscrit avec votre lien vous rapporte 2% du montant, payés par la boutique après livraison.":
    "Each order placed by a client registered with your link earns you 2% of the amount, paid by the shop after delivery.",
  "Aucune commande de filleul pour le moment.": "No referred client order yet.",
  "En attente de livraison": "Awaiting delivery",
  "Réclamer le paiement de votre commission de parrainage pour « {name} » à la boutique ?":
    'Claim your referral commission for "{name}" from the shop?',
  "Payer le parrain": "Pay the referrer",
  "Parrain payé": "Referrer paid",
  "Paiement 2% réclamé": "2% payment claimed",
  "à payer séparément au parrain": "to be paid separately to the referrer",
  "Moyens de paiement du parrain": "Referrer payment methods",
  Parrain: "Referrer",
  "Le vendeur {seller} réclame {amount} {symbol} de commissions chez votre boutique.":
    "The seller {seller} claims {amount} {symbol} of commissions from your shop.",
  "Le parrain {parrain} réclame {amount} {symbol} de commissions de parrainage.":
    "The referrer {parrain} claims {amount} {symbol} of referral commissions.",
  "Vos commissions ({amount} {symbol}) pour vos ventes chez {shop} ont été versées.":
    "Your commissions ({amount} {symbol}) for your sales at {shop} have been paid.",
  "Votre commission de parrainage ({amount} {symbol}) chez {shop} a été versée.":
    "Your referral commission ({amount} {symbol}) at {shop} has been paid.",
  "Commissions de vente — par vendeur": "Sale commissions — by seller",
  "Parrainage (2%) — par parrain": "Referral (2%) — by referrer",
  "Commissions de vente — par boutique": "Sale commissions — by shop",
  "Parrainage (2%) — par boutique": "Referral (2%) — by shop",
  "Nombre de ventes": "Number of sales",
  "Réclamer vos commissions ({amount}) chez {shop} ?":
    "Claim your commissions ({amount}) from {shop}?",
  "Réclamer votre commission de parrainage ({amount}) chez {shop} ?":
    "Claim your referral commission ({amount}) from {shop}?",
  "Commission 2% en attente": "2% commission pending",
  "Vente de « {product} » confirmée — vendeur : {seller} ({code}), acheteur : {buyer}.":
    'Sale of "{product}" confirmed — seller: {seller} ({code}), buyer: {buyer}.',
  "le client": "the client",
  "Profil mis à jour avec succès.": "Profile updated successfully.",
  "Mot de passe modifié avec succès.": "Password changed successfully.",
  "Modifiez votre mot de passe de connexion.": "Change your login password.",
  "Vous vous êtes inscrit(e) avec Google : définissez un mot de passe pour pouvoir vous connecter sans Google.":
    "You registered with Google: set a password to sign in without Google.",
  "Votre mot de passe": "Your password",
  "📍 Localisation de la boutique": "📍 Shop location",
  "Connecté en tant que {name} ({role}) — gérez vos informations et votre sécurité.":
    "Signed in as {name} ({role}) — manage your information and security.",
  "La suppression est définitive : votre compte, vos produits, vos ventes et tout votre contenu seront supprimés de nos serveurs.":
    "Deletion is permanent: your account, products, sales and all your content will be removed from our servers.",
  "Supprimer définitivement votre compte ? Vos produits, ventes et tout votre contenu seront supprimés. Cette action est irréversible.":
    "Permanently delete your account? Your products, sales and all your content will be deleted. This action is irreversible.",
  "Les offres du moment": "Current offers",
  "Découvrez les promotions en cours avec les meilleures réductions.":
    "Discover current promotions with the best discounts.",
  "Produits des boutiques": "Shop products",
  "Parcourez les produits disponibles chez les boutiques partenaires.":
    "Browse products available at partner shops.",
  "Contactez directement la centrale Mboppi pour commander.":
    "Contact Mboppi directly to place an order.",
  Rôle: "Role",
  "Inscrit le": "Registered on",
  "Suivez les promotions en cours et repérez les bonnes affaires.":
    "Follow current promotions and spot the best deals.",
  "Présenter mes créations": "Showcase my creations",
  "Contactez la centrale Mboppi pour exposer vos créations au marché.":
    "Contact Mboppi to exhibit your creations on the market.",
  "Bonjour, je suis un client de Mboppi ({email}) et j'aimerais passer une commande.":
    "Hello, I am a Mboppi client ({email}) and I would like to place an order.",
  "Bonjour, je suis un créateur sur Mboppi ({email}) et j'aimerais présenter mes créations.":
    "Hello, I am a creator on Mboppi ({email}) and I would like to showcase my creations.",
  "Le marché du quartier, en un clic": "Your neighbourhood market, one click away",
  "Découvrez les offres du moment, commandez les produits des boutiques partenaires, ou devenez vendeur et gagnez une commission sur chaque vente.":
    "Discover current offers, order products from partner shops, or become a seller and earn a commission on every sale.",
  "Produits en boutique": "Products in shops",
  "Boutiques partenaires": "Partner shops",
  "Accéder à mon espace": "Go to my space",
  "Les boutiques publient": "Shops publish",
  "Elles mettent en ligne leurs produits et fixent la commission de vente.":
    "They put their products online and set the sales commission.",
  "Les vendeurs vendent": "Sellers sell",
  "Ils enregistrent les ventes et trouvent les clients, au quartier ou en ligne.":
    "They record sales and find customers, in the neighbourhood or online.",
  "Chacun y gagne": "Everyone wins",
  "La boutique écoule ses produits, le vendeur encaisse sa commission à chaque vente.":
    "The shop sells its products, the seller earns their commission on every sale.",
  "🏪 Produits des boutiques": "🏪 Shop products",
  "🔍 Rechercher un produit…": "🔍 Search a product…",
  "{n} photos — cliquez pour agrandir": "{n} photos — click to enlarge",
  "🗑️ Rétirer ce produit": "🗑️ Remove this product",
  "Retirer « {name} » définitivement ?": 'Remove "{name}" permanently?',
  "Disponibilité : {n} en stock": "Availability: {n} in stock",
  Fermer: "Close",
  "Photo précédente": "Previous photo",
  "Photo suivante": "Next photo",
  Photo: "Photo",
  "← Retour à la vitrine": "← Back to showcase",
  "Économisez {n} {symbol} par rapport au prix d'origine":
    "Save {n} {symbol} compared to the original price",
  "⚡ Promotions en cours": "⚡ Current promotions",
  "🔥 Les offres du moment": "🔥 Current offers",
  "Les meilleures promotions de Verone et des boutiques partenaires : prix cassés, économies garanties, commande directe par téléphone ou WhatsApp.":
    "The best promotions from Verone and partner shops: slashed prices, guaranteed savings, direct ordering by phone or WhatsApp.",
  "Offres actives": "Active offers",
  "Économies cumulées": "Cumulative savings",
  Catégories: "Categories",
  "⏰ Les offres se renouvellent dans {time}": "⏰ Offers renew in {time}",
  "Offres promotionnelles": "Promotional offers",
  "✨ Toutes ({n})": "✨ All ({n})",
  "🔥 Meilleures réductions": "🔥 Best discounts",
  "💰 Moins cher": "💰 Cheapest",
  "✨ Dernières arrivées": "✨ Latest arrivals",
  "Aucune offre pour le moment. Revenez très vite, ça va chauffer ! 🔥":
    "No offers right now. Come back soon, it's going to heat up! 🔥",
  "Aucune offre ne correspond à votre recherche.": "No offer matches your search.",
  "Espace Verone": "Verone space",
  "Ajoutez vos offres promotionnelles : elles s'affichent dans la Vitrine d'offre du site.":
    "Add your promotional offers: they appear on the site's offers showcase.",
  "Masquer mes Offres": "Hide my offers",
  "Voir mes Offres": "View my offers",
  "Partager ma Vitrine": "Share my showcase",
  "Mes offres": "My offers",
  "Aucune offre ajoutée pour le moment.": "No offers added yet.",
  "Offre retirée de la vitrine.": "Offer removed from the showcase.",
  "Maximum {n} photos par offre": "Maximum {n} photos per offer",
  "Impossible de lire une des photos": "Unable to read one of the photos",
  "Les deux prix sont requis": "Both prices are required",
  "Offre ajoutée avec succès — elle s'affiche maintenant sur la page Vitrine d'offre.":
    "Offer added successfully — it now appears on the offers showcase page.",
  "Nouvelle offre": "New offer",
  "Nom de l'Offre *": "Offer name *",
  "Garantie (en lettres ou chiffres)": "Warranty (in words or numbers)",
  "Quantité (en chiffres) *": "Quantity (in numbers) *",
  "Ajout en cours…": "Adding…",
  "Ajouter l'Offre": "Add offer",
  "Retirer l'offre": "Remove offer",
  "Confirmez le retrait de « {name} » de la vitrine.":
    'Confirm the removal of "{name}" from the showcase.',
  "Mboppi, le marché de votre quartier, en ligne": "Mboppi, your neighbourhood market, online",
  "Mboppi est née d'une idée simple : permettre à chacun de vendre et d'acheter près de chez soi, sans prix écrasant et sans dépendre des grands sites. Ici, les boutiques publient leurs produits, les créateurs exposent leurs talents, juste avec un téléphone et une connexion internet, les vendeurs vendent et gagnent des commissions, et les clients trouvent tout au même endroit avec satisfaction, sans se déplacer.":
    "Mboppi was born from a simple idea: allow everyone to buy and sell close to home, without crushing prices and without depending on big platforms. Here, shops publish their products, creators showcase their talents, just with a phone and an internet connection, sellers sell and earn commissions, and clients find everything in one place with satisfaction, without moving.",
  "Comment ça marche ?": "How does it work?",
  "Un rôle pour chacun, une plateforme pour tous.": "A role for everyone, one platform for all.",
  "Publiez vos produits et recevez les commandes.": "Publish your products and receive orders.",
  "Vendez en ligne et gagnez une commission sur chaque vente.":
    "Sell online and earn a commission on every sale.",
  "Parcourez les offres du moment et commandez en un clic.":
    "Browse current offers and order in one click.",
  "Commandez en un clic et recevez chez vous avec un livreur.":
    "Order in one click and get it delivered to your door by a courier.",
  "Produits et créations": "Products and creations",
  "Commander avec son téléphone, sans carte bancaire ni frais cachés.":
    "Order with your phone, without a bank card or hidden fees.",
  "Exposez vos créations et touchez un public plus large.":
    "Showcase your creations and reach a wider audience.",
  "Ce qui nous pousse chaque jour.": "What drives us every day.",
  "La confiance": "Trust",
  "Des commandes simples, des contacts directs avec les vendeurs.":
    "Simple orders, direct contact with sellers.",
  "La proximité": "Proximity",
  "Commander par WhatsApp, sans carte bancaire ni frais cachés.":
    "Order via WhatsApp, no bank card or hidden fees.",
  "La rapidité": "Speed",
  "Une plateforme légère, qui s'affiche vite, même en 3G.":
    "A lightweight platform that loads fast, even on 3G.",
  "Prêt à rejoindre l'aventure ?": "Ready to join the adventure?",
  "Créez votre compte gratuitement en moins d'une minute.":
    "Create your account for free in under a minute.",
  "Créer mon compte": "Create my account",
  "💬 Contact": "💬 Contact",
  "Comment pouvons-nous vous aider ?": "How can we help you?",
  "Une question, une suggestion, un souci ? Écrivez-nous, nous répondons vite.":
    "A question, a suggestion, an issue? Write to us, we reply fast.",
  "Nos coordonnées": "Our details",
  "Le moyen le plus rapide de nous joindre.": "The fastest way to reach us.",
  "Écrire sur WhatsApp": "Write on WhatsApp",
  Téléphone: "Telephone",
  "Appelez-nous aux heures de travail.": "Call us during working hours.",
  "Pour les demandes écrites détaillées.": "For detailed written requests.",
  "Envoyer un message": "Send a message",
  "Votre message est transmis directement sur notre WhatsApp.":
    "Your message is sent directly to our WhatsApp.",
  Sujet: "Subject",
  "Choisir un sujet…": "Choose a subject…",
  "Question sur une offre": "Question about an offer",
  "Je veux vendre sur Mboppi": "I want to sell on Mboppi",
  "Problème de compte": "Account problem",
  Autre: "Other",
  "Écrivez votre message ici…": "Write your message here…",
  "Bonjour Mboppi, je suis {name}.": "Hello Mboppi, I am {name}.",
  "un visiteur": "a visitor",
  "📦 Quelles données sont collectées ?": "📦 What data is collected?",
  "Lors de votre inscription : votre nom, votre e-mail et votre rôle (boutique, vendeur, client ou créateur). Si vous vous connectez avec Google, seul votre e-mail Google est utilisé. Selon votre rôle, vous pouvez publier des produits, des offres avec photos, et vos ventes sont enregistrées dans votre espace.":
    "When you register: your name, your email and your role (shop, seller, client or creator). If you sign in with Google, only your Google email is used. Depending on your role, you can publish products, offers with photos, and your sales are recorded in your space.",
  "🔐 Comment sont-elles stockées ?": "🔐 How are they stored?",
  "Toutes les données sont enregistrées dans une base de données PostgreSQL hébergée et sécurisée. Les mots de passe sont hachés (chiffrés de façon irréversible) : personne, même l'équipe Mboppi, ne peut lire votre mot de passe. Toutes les connexions passent par un protocole sécurisé (HTTPS).":
    "All data is stored in a hosted and secured PostgreSQL database. Passwords are hashed (irreversibly encrypted): no one, even the Mboppi team, can read your password. All connections use a secure protocol (HTTPS).",
  "⏳ Combien de temps sont-elles conservées ?": "⏳ How long are they kept?",
  "Vos données restent enregistrées aussi longtemps que votre compte existe. Les offres et produits que vous retirez sont supprimés définitivement, avec leurs photos. Aucune donnée n'est vendue ni transmise à des tiers.":
    "Your data stays stored as long as your account exists. Offers and products you remove are permanently deleted, with their photos. No data is sold or shared with third parties.",
  "👀 Qui peut les voir ?": "👀 Who can see them?",
  "Seule la personne concernée accède à son espace : une boutique voit ses produits, un vendeur ses ventes et commissions. Les offres de la vitrine sont publiquement visibles par les visiteurs, mais sans vos informations de compte.":
    "Only the person concerned accesses their space: a shop sees its products, a seller their sales and commissions. Showcase offers are publicly visible to visitors, but without your account information.",
  "💳 Aucun paiement en ligne": "💳 No online payment",
  "Mboppi ne demande jamais de numéro de carte bancaire. Les commandes passent par téléphone ou WhatsApp, et le paiement se fait directement avec le vendeur.":
    "Mboppi never asks for a bank card number. Orders go through phone or WhatsApp, and payment is made directly with the seller.",
  "🗑️ Supprimer vos données": "🗑️ Delete your data",
  "Vous pouvez retirer vos offres et produits à tout moment depuis votre espace.":
    "You can remove your offers and products at any time from your space.",
  "Pour supprimer votre compte, contactez-nous via la page":
    "To delete your account, contact us via the",
  "et nous le supprimerons rapidement.": "page and we will delete it quickly.",
  "Partager ma vitrine": "Share my showcase",
  "📲 Partager via l'appareil": "📲 Share via device",
  "Ma vitrine Mboppi": "My Mboppi showcase",
  "Découvre ma vitrine Mboppi": "Discover my Mboppi showcase",
  "Copier le lien": "Copy link",
  "✨ **Une offre pour presque chaque besoin !**\n🔥 Découvrez ma vitrine et explorez une sélection d'offres et de solutions dans plusieurs domaines.\n\nQue tu recherches une opportunité, un service, un produit ou simplement quelque chose d'intéressant à découvrir, **tu pourrais bien trouver ton bonheur.** 👀\n\n👉 **Découvre la vitrine ici :**\n🔗 {url}\n\n🚀 *Un clic, plusieurs possibilités !*":
    "✨ **An offer for almost every need!**\n🔥 Discover my showcase and explore a selection of offers and solutions in several fields.\n\nWhether you are looking for an opportunity, a service, a product or simply something interesting to discover, **you might just find what you need.** 👀\n\n👉 **Discover the showcase here:**\n🔗 {url}\n\n🚀 *One click, many possibilities!*",

  // Categories
  "Électronique & Téléphones": "Electronics & Phones",
  "Téléphones & Tablettes": "Phones & Tablets",
  "Ordinateurs & Accessoires": "Computers & Accessories",
  "TV, Audio & Vidéo": "TV, Audio & Video",
  "Consoles & Jeux vidéo": "Consoles & Video games",
  "Mode & Vêtements": "Fashion & Clothing",
  Chaussures: "Shoes",
  "Sacs & Accessoires": "Bags & Accessories",
  "Beauté & Cosmétiques": "Beauty & Cosmetics",
  Parfums: "Perfumes",
  "Soins capillaires": "Hair care",
  "Bijoux & Montres": "Jewelry & Watches",
  "Maison & Déco": "Home & Decor",
  Meubles: "Furniture",
  "Cuisine & Ustensiles": "Kitchen & Utensils",
  "Linge de maison": "Home textiles",
  Électroménager: "Appliances",
  "Alimentation & Épicerie": "Food & Grocery",
  "Produits frais & Marché": "Fresh produce & Market",
  Boissons: "Drinks",
  "Santé & Bien-être": "Health & Wellness",
  "Sport & Fitness": "Sports & Fitness",
  "Jouets & Jeux": "Toys & Games",
  "Bébé & Enfants": "Baby & Kids",
  "Papeterie & Bureau": "Stationery & Office",
  "Livres & Formation": "Books & Training",
  "Arts & Artisanat": "Arts & Crafts",
  "Auto & Moto": "Cars & Motorcycles",
  "Jardin & Extérieur": "Garden & Outdoor",
  "Animaux & Accessoires": "Pets & Accessories",
  "Services & Prestations": "Services",
  Immobilier: "Real estate",

  // Cart / Favorites / Orders
  "Mes favoris": "My favorites",
  "Mon panier": "My cart",
  "Votre panier est vide.": "Your cart is empty.",
  "Parcourir les produits": "Browse products",
  "Ajouter au panier": "Add to cart",
  "Ajouté au panier ✓": "Added to cart ✓",
  "Ajouter aux favoris": "Add to favorites",
  "Retirer des favoris": "Remove from favorites",
  "Articles ({n})": "Items ({n})",
  "Les frais de livraison sont confirmés avec la boutique.":
    "Delivery fees are confirmed with the shop.",
  "Connectez-vous pour passer commande.": "Log in to place your order.",
  "Votre nom *": "Your name *",
  "Votre téléphone": "Your phone",
  "Adresse de livraison": "Delivery address",
  "Quartier, ville…": "Neighborhood, city…",
  "Passer la commande": "Place the order",
  "Commande en cours…": "Placing order…",
  "Commande enregistrée !": "Order saved!",
  "Commande enregistrée": "Order saved",
  "Merci {name} ! Votre commande #{id} est bien enregistrée.":
    "Thank you {name}! Your order #{id} has been saved.",
  "Confirmez-la maintenant sur WhatsApp pour la finaliser.":
    "Now confirm it on WhatsApp to finalize it.",
  "Confirmer sur WhatsApp": "Confirm on WhatsApp",
  "Voir mes commandes": "See my orders",
  "Aucune commande pour le moment.": "No orders yet.",
  "Mes commandes": "My orders",
  "📦 Mes commandes": "📦 My orders",
  "Commande #{id}": "Order #{id}",
  "En attente": "Pending",
  Expédiée: "Shipped",
  "Suivre sur WhatsApp": "Track on WhatsApp",
  "Bonjour Mboppi, je souhaite suivre ma commande #{id}.":
    "Hello Mboppi, I would like to track my order #{id}.",
  "Bonjour Mboppi, je souhaite confirmer ma commande #{id} :":
    "Hello Mboppi, I would like to confirm my order #{id}:",
  "Total : {total} F": "Total: {total} F",
  "Nom : {name}": "Name: {name}",
  "Téléphone : {phone}": "Phone: {phone}",
  "Adresse : {address}": "Address: {address}",
  "Toutes les catégories": "All categories",
  "Plus récents": "Newest",
  "🔥 Plus populaires": "🔥 Most popular",
  "Prix croissant": "Price: low to high",
  "Prix décroissant": "Price: high to low",
  vendus: "sold",
  "✨ Produits similaires": "✨ Similar products",
  Partager: "Share",
  "Lien copié !": "Link copied!",
  "Aucun favori pour le moment.": "No favorites yet.",
  "Finalisez vos commandes en quelques clics.": "Finalize your orders in a few clicks.",
  "Retrouvez les produits que vous avez aimés.": "Find again the products you liked.",
  "En attente de vente": "Awaiting sale",
  "Générez votre code vendeur pour vendre.": "Generate your seller code to sell.",
  "Commandez « {name} » sur Mboppi avec le code vendeur {code}":
    "Order « {name} » on Mboppi with seller code {code}",
  "Découvrez cet article sur Mboppi : {name}": "Discover this item on Mboppi: {name}",
  Localisation: "Location",
  "Mes moyens de paiement": "My payment methods",
  "Ces informations seront visibles par les boutiques pour vous payer vos commissions.":
    "This information will be visible to shops to pay your commissions.",
  "Enregistrez vos portefeuilles électroniques pour recevoir vos commissions.":
    "Register your mobile wallets to receive your commissions.",
  "{count} moyen(s) de paiement enregistré(s).": "{count} payment method(s) registered.",
  "Nom complet (tel qu'il apparaît sur le compte)": "Full name (as shown on the account)",
  "Portefeuilles électroniques": "Mobile wallets",
  "Cochez vos portefeuilles et entrez le numéro associé.":
    "Tick your wallets and enter the associated number.",
  Numéro: "Number",
  "Enregistrer mes moyens de paiement": "Save my payment methods",
  "Ajoutez au moins un portefeuille avec son numéro.": "Add at least one wallet with its number.",
  "Moyens de paiement enregistrés !": "Payment methods saved!",
  "Ces informations seront visibles par vos clients sur le formulaire de commande.":
    "This information will be visible to your clients on the order form.",
  "Enregistrez vos portefeuilles électroniques pour recevoir les paiements de vos clients.":
    "Register your mobile wallets to receive payments from your clients.",
  "En espèces (à la livraison)": "In cash (on delivery)",
  "Portefeuille (Mobile Money)": "Wallet (Mobile Money)",
  "Envoyez le paiement à la boutique sur l'un de ces portefeuilles :":
    "Send the payment to the shop to one of these wallets:",
  "Titulaire : {name}": "Account holder: {name}",
  "Indiquez votre nom et votre numéro lors du transfert pour faciliter la livraison.":
    "Mention your name and number when transferring to make delivery easier.",
  "La boutique n'a pas encore configuré ses portefeuilles de paiement. Paiement à la livraison recommandé.":
    "The shop has not set up its payment wallets yet. Cash on delivery recommended.",
  "Moyens de paiement": "Payment methods",
  "La boutique n'a pas configuré de portefeuille.": "The shop has not set up a wallet.",
  "Vérone · Assistante Mboppi": "Vérone · Mboppi Assistant",
  "En ligne": "Online",
  "Écrivez votre question…": "Type your question…",
  "Bonjour 👋 Je suis Vérone, l'assistante Mboppi. Posez-moi vos questions sur la boutique, les commandes, les paiements ou la livraison !":
    "Hello 👋 I am Vérone, the Mboppi assistant. Ask me anything about the shop, orders, payments or delivery!",
  "Une erreur est survenue. Réessayez ou contactez-nous via la page Contact.":
    "An error occurred. Try again or contact us via the Contact page.",
  "Le chatbot n'est pas encore configuré (clé IA manquante côté serveur).":
    "The chatbot is not configured yet (AI key missing on the server side).",
  Envoyer: "Send",
  "Nom et prénom *": "First and last name *",
  "Ville *": "City *",
  "Adresse / Quartier *": "Address / District *",
  "Numéro de téléphone *": "Phone number *",
  "Confirmer la Commande": "Confirm Order",
  Commander: "Order",
  "Commande confirmée !": "Order confirmed!",
  "Votre article est en attente de vente. La boutique et le vendeur ont été notifiés et vous contacteront pour la livraison. Retrouvez cette commande dans votre espace client.":
    "Your item is awaiting sale. The shop and the seller have been notified and will contact you for delivery. Find this order in your client space.",
  "Vous devez être connecté pour confirmer la commande.":
    "You must be logged in to confirm the order.",
  "Ce produit vous est proposé par un vendeur Mboppi. Remplissez vos informations pour confirmer votre commande. Aucun compte requis.":
    "This product is offered by a Mboppi seller. Fill in your details to confirm your order. No account required.",
  "Confirmez votre commande : la boutique et le vendeur seront notifiés.":
    "Confirm your order: the shop and the seller will be notified.",
  "Ce produit vous est proposé par un vendeur Mboppi. Remplissez vos informations pour confirmer votre commande.":
    "This product is offered by a Mboppi seller. Fill in your details to confirm your order.",
  "Nouvelle commande pour « {product} » — {buyer}.": "New order for « {product} » — {buyer}.",
  "Nouvelle commande pour « {product} » — vendeur : {seller} ({code}).":
    "New order for « {product} » — seller: {seller} ({code}).",
  "Votre commande « {product} » a été livrée.": 'Your order "{product}" has been delivered.',
  "Votre commande « {product} » a été annulée comme demandé.":
    'Your order "{product}" has been cancelled as requested.',
  "Votre vente de « {product} » a été annulée par le client.":
    'Your sale of "{product}" was cancelled by the client.',
  "Commande « {product} » de {buyer} annulée par le client.":
    'Order "{product}" from {buyer} cancelled by the client.',
  "Nouvelle commande pour « {product} » — {buyer}. Article en attente de vente.":
    "New order for « {product} » — {buyer}. Item awaiting sale.",
  "Nouvelle commande pour « {product} » — vendeur : {seller} ({code}). Article en attente de vente.":
    "New order for « {product} » — seller: {seller} ({code}). Item awaiting sale.",
  "Votre vente de « {product} » a été livrée à {buyer}.":
    "Your sale of « {product} » has been delivered to {buyer}.",
  "Vente de « {product} » livrée — vendeur : {seller} ({code}), acheteur : {buyer}.":
    "Sale of « {product} » delivered — seller: {seller} ({code}), buyer: {buyer}.",
  Livreur: "Delivery person",
  livreur: "delivery person",
  "Mes livraisons": "My deliveries",
  Livraison: "Delivery",
  "Je livre les articles commandés et je confirme l'achat":
    "I deliver ordered items and confirm the purchase",
  "Livrez les articles en attente de vente et confirmez l'achat auprès du client.":
    "Deliver items awaiting sale and confirm the purchase with the client.",
  "Articles en attente de vente": "Items awaiting sale",
  "Aucun article en attente pour le moment.": "No items awaiting sale at the moment.",
  "Vendeur : {seller}": "Seller: {seller}",
  Livrer: "Deliver",
  Livré: "Delivered",
  "Livré le {date}": "Delivered on {date}",
  "Mes livraisons effectuées": "My completed deliveries",
  "Aucune livraison effectuée pour le moment.": "No completed deliveries at the moment.",
  "Voir la facture": "View invoice",
  Facture: "Invoice",
  "Facture livrée": "Delivered invoice",
  "Aucune vente livrée pour le moment.": "No delivered sales at the moment.",
  Propriétaire: "Owner",
  "Montant article": "Item amount",
  "Frais de livraison ({symbol}) *": "Delivery fee ({symbol}) *",
  "Paiement *": "Payment *",
  "En Espèce": "In Cash",
  "Par Mobile": "By Mobile",
  "En ligne (auto)": "Online (auto)",
  "Le client recevra une demande de paiement mobile money sur son téléphone. Confirmez l'opérateur et son numéro.":
    "The customer will receive a mobile money payment request on their phone. Confirm their operator and number.",
  Opérateur: "Operator",
  "Numéro du client": "Customer number",
  "Demande de paiement envoyée !": "Payment request sent!",
  "Ouvrir le lien de paiement": "Open payment link",
  "Envoyer la demande de paiement": "Send payment request",
  "Confirmer l'Achat": "Confirm Purchase",
  "Achat confirmé ! La facture a été téléchargée.":
    "Purchase confirmed! The invoice has been downloaded.",
  "Facture N°": "Invoice N°",
  "Date de livraison": "Delivery date",
  Nom: "Name",
  "Code vendeur": "Seller code",
  "Prix unitaire": "Unit price",
  "Total à payer": "Total to pay",
  "Facture générée par Mboppi — marchandise livrée.":
    "Invoice generated by Mboppi — merchandise delivered.",
  "Facture générée par Mboppi.": "Invoice generated by Mboppi.",
  "Payer le Vendeur": "Pay the Seller",
  "Payer le vendeur": "Pay the seller",
  "Vendeur payé": "Seller paid",
  "Commission en attente": "Pending commission",
  "Commission non payée": "Unpaid commission",
  "Cette vente ne peut pas être supprimée tant que sa commission n'est pas payée.":
    "This sale cannot be removed until its commission is paid.",
  "Cette vente ne peut pas être retirée tant que sa commission n'est pas payée.":
    "This sale cannot be removed until its commission is paid.",
  "Vente supprimée.": "Sale deleted.",
  "Commission supprimée.": "Commission deleted.",
  "Supprimer cette commission de parrainage « {name} » ?":
    "Delete this referral commission for « {name} »?",
  "Vous pouvez retirer une vente livrée (ou une commission de parrainage) uniquement une fois sa commission payée.":
    "You can remove a delivered sale (or a referral commission) only once its commission has been paid.",
  "Commission payée": "Paid commission",
  "Commissions à verser": "Commissions to pay",
  "Commission à verser": "Commission to pay",
  "Commissions versées": "Commissions paid",
  Livraisons: "Deliveries",
  "Commissions pour les vendeurs": "Commissions for sellers",
  "Moyens de paiement du vendeur": "Seller payment methods",
  "Le vendeur n'a pas encore enregistré de moyen de paiement.":
    "The seller has not registered a payment method yet.",
  "Preuve du paiement (photo ou vidéo) *": "Payment proof (photo or video) *",
  "Preuve ajoutée ✓ (cliquez pour changer)": "Proof added ✓ (click to change)",
  Preuve: "Proof",
  "Confirmer le Paiement": "Confirm Payment",
  "Vendeur payé ! La preuve a été enregistrée.": "Seller paid! The proof has been recorded.",
  "Vidéo trop lourde : limite 10 Mo.": "Video too heavy: 10 MB limit.",
  Article: "Item",
  "Votre commission pour « {product} » a été payée par {shop}.":
    "Your commission for « {product} » has been paid by {shop}.",
  "Publiez vos créations : elles rejoignent la catégorie Arts & Artisanat du marché.":
    "Publish your creations: they join the Arts & Crafts category of the marketplace.",
  "+ Publier une création": "+ Publish a creation",
  "Nouvelle création": "New creation",
  "Modifier la création": "Edit the creation",
  "Nom de la création *": "Creation name *",
  "Commission pour les vendeurs (%) *": "Commission for sellers (%) *",
  "Création mise à jour !": "Creation updated!",
  "Création publiée avec succès.": "Creation published successfully.",
  "Retirer cette création ?": "Remove this creation?",
  "Mes créations": "My creations",
  "Aucune création publiée pour le moment. Publiez votre première création !":
    "No creation published yet. Publish your first creation!",
  "Statistiques de mes créations": "Statistics of my creations",
  // Missing keys (polish pass)
  Ville: "City",
  "Ville…": "City…",
  "📍 Ville de la boutique": "📍 Shop city",
  Adresse: "Address",
  "Frais de livraison": "Delivery fee",
  Paiement: "Payment",
  "Mboppi est née d'une idée simple : permettre à chacun de vendre et d'acheter près de chez soi, sans commission écrasante et sans dépendre des grands sites. Ici, les boutiques publient leurs produits, les vendeurs gagnent des commissions, les créateurs exposent leurs talents et les clients trouvent tout au même endroit.":
    "Mboppi was born from a simple idea: letting everyone sell and buy close to home, without crushing commissions and without relying on the big platforms. Here, shops publish their products, sellers earn commissions, creators showcase their talents and clients find everything in one place.",
  "Publiez vos produits et recevez les commandes de vos clients.":
    "Publish your products and receive orders from your clients.",
  Créateur: "Creator",
  "🛒 Mon panier": "🛒 My cart",
  "Découvrir les produits": "Discover products",
  Message: "Message",
  "Publiez et gérez vos créations.": "Publish and manage your creations.",
  "Prix normal (barré, optionnel)": "Normal price (strikethrough, optional)",
  Publier: "Publish",
  "Aucune vente enregistrée pour le moment.": "No sale recorded yet.",
  "Livrez les articles commandés et confirmez l'achat.":
    "Deliver ordered items and confirm the purchase.",
  "Livrer : {name}": "Deliver: {name}",
  "Découvrez « {name} » à {price} {symbol} sur Mboppi.":
    "Discover « {name} » at {price} {symbol} on Mboppi.",
  "Comment vos données sont conservées": "How your data is kept",
  "La transparence est importante pour nous. Voici comment Mboppi collecte, stocke et protège vos données.":
    "Transparency matters to us. Here is how Mboppi collects, stores and protects your data.",
  "Découvrez « {name} » à {price} {symbol} chez {shop} sur Mboppi.":
    "Discover « {name} » at {price} {symbol} at {shop} on Mboppi.",
  "Confirmez votre commande avec le code du vendeur.": "Confirm your order with the seller code.",
  "Prix invalide": "Invalid price",
  "Livré le": "Delivered on",
  "ex : 5000 (s'affiche barré)": "e.g.: 5000 (shown strikethrough)",
  "ex : 3500 (s'affiche en vert)": "e.g.: 3500 (shown in green)",
  "📷 Ajouter une photo ou une vidéo": "📷 Add a photo or a video",
  "🔍 Rechercher une offre…": "🔍 Search for an offer…",
  Installer: "Install",
  "Installer l'application": "Install the app",
  "Sur iPhone ou iPad : touchez Partager puis « Ajouter à l'écran d'accueil ».":
    'On iPhone or iPad: tap Share, then "Add to Home Screen".',
  "Avis clients": "Customer reviews",
  "{n} avis": "{n} reviews",
  "Laisser un avis": "Leave a review",
  "Choisissez une note de 1 à 5 étoiles.": "Choose a rating from 1 to 5 stars.",
  "Votre note": "Your rating",
  "Votre commentaire (facultatif)": "Your comment (optional)",
  "Partagez votre expérience avec ce produit…": "Share your experience with this product…",
  "Publier mon avis": "Post my review",
  "Envoi…": "Sending…",
  "Merci pour votre avis !": "Thank you for your review!",
  "Connectez-vous": "Sign in",
  "pour laisser un avis.": "to leave a review.",
  "Aucun avis pour le moment. Soyez le premier !": "No reviews yet. Be the first!",
  Client: "Customer",
  Vérifiée: "Verified",
  "Boutique vérifiée": "Verified shop",
  "Contacter sur WhatsApp": "Contact on WhatsApp",
  "Produits de la boutique": "Shop products",
  "Suivi de commande": "Order tracking",
  "Entrez votre code client (reçu avec votre commande) pour suivre son état.":
    "Enter your customer code (received with your order) to track its status.",
  "Code client, ex : AB12CD3": "Customer code, e.g.: AB12CD3",
  "Suivre ma commande": "Track my order",
  "Lien de suivi": "Tracking link",
  "Commande enregistrée": "Order recorded",
  "Commande confirmée": "Order confirmed",
  "Commande livrée": "Order delivered",
  "Cette commande a été annulée.": "This order was cancelled.",
  "Annuler la commande": "Cancel order",
  "Annuler cette commande ? Cette action est définitive.":
    "Cancel this order? This action is final.",
  "Annuler cette commande « {name} » ? Cette action est définitive.":
    'Cancel this order "{name}"? This action is final.',
  "Contacter le vendeur": "Contact the seller",
  "Partager le suivi": "Share tracking",
  "Votre code client : {code}": "Your customer code: {code}",
  "Votre code client": "Your customer code",
  "Bonjour {seller}, je suis {buyer}, je vous contacte à propos de ma commande « {product} » sur Mboppi.":
    'Hello {seller}, I am {buyer}, I am contacting you about my order "{product}" on Mboppi.',
  "Bonjour {shop}, je vous contacte depuis Mboppi.":
    "Hello {shop}, I am contacting you from Mboppi.",
  "Suivez ma commande « {product} » sur Mboppi : {url}":
    'Track my order "{product}" on Mboppi: {url}',
  "La page que vous cherchez n'existe pas ou a été déplacée.":
    "The page you are looking for does not exist or has been moved.",
  Suggestions: "Suggestions",
  Administration: "Administration",
  "Vue globale de la plateforme.": "Global view of the platform.",
  Utilisateurs: "Users",
  Boutiques: "Shops",
  Créateurs: "Creators",
  Vendeurs: "Sellers",
  Clients: "Clients",
  Livreurs: "Delivery drivers",
  Ventes: "Sales",
  "En attente": "Pending",
  "en attente": "pending",
  Livrées: "Delivered",
  "Vente directe": "Direct sale",
  "Sans commission": "No commission",
  Nombre: "Count",
  Code: "Code",
  Payées: "Paid",
  "Par boutique": "By shop",
  "Par vendeur": "By seller",
  "Par statut": "By status",
  "Aucune transaction": "No transactions",
  "Dernières transactions": "Latest transactions",
  "Transactions avec vendeur": "Sales with seller",
  "Commandes directes (panier)": "Direct orders (cart)",
  "Montant commandes directes": "Direct orders amount",
  "💸 Toutes les transactions": "💸 All transactions",
  "Activité regroupée de tous les utilisateurs (boutiques, vendeurs, clients, livreurs, créateurs).":
    "Combined activity of all users (shops, sellers, clients, delivery drivers, creators).",
  "Livraison supprimée de votre espace.": "Delivery removed from your space.",
  "Inscrits aujourd'hui": "Signed up today",
  "Rechercher un utilisateur (nom ou email)…": "Search for a user (name or email)…",
  "Message de l'équipe Mboppi": "Message from the Mboppi team",
  Suggestion: "Suggestion",
  "Faire une suggestion": "Make a suggestion",
  "Aidez-nous à améliorer Mboppi : votre message s'ouvrira dans WhatsApp.":
    "Help us improve Mboppi: your message will open in WhatsApp.",
  "Votre suggestion…": "Your suggestion…",
  "Envoyer sur WhatsApp": "Send on WhatsApp",
  "Messages aux utilisateurs": "Messages to users",
  "Envoyez un message qui s'affichera en popup à la prochaine connexion des utilisateurs (une seule fois).":
    "Send a message that will show as a popup on the users' next log-in (once only).",
  "À tous les utilisateurs": "To all users",
  "À un utilisateur": "To one user",
  "Choisir un utilisateur…": "Choose a user…",
  "Message envoyé avec succès.": "Message sent successfully.",
  "Messages envoyés": "Sent messages",
  Destinataires: "Recipients",
  "Aucun message envoyé": "No message sent",
  "Tous les utilisateurs": "All users",
  Compris: "Got it",
  Newsletter: "Newsletter",
  "Abonnés newsletter": "Newsletter subscribers",
  "Envoyez une newsletter par email à tous les abonnés. Chaque abonné reçoit le lien de désabonnement automatiquement.":
    "Send a newsletter by email to all subscribers. Each subscriber automatically receives the unsubscribe link.",
  "Sujet de la newsletter": "Newsletter subject",
  "Contenu de la newsletter…": "Newsletter content…",
  "Envoyer la newsletter": "Send newsletter",
  "Aucun abonné pour le moment.": "No subscribers yet.",
  "Envoyer à {count} abonnés": "Send to {count} subscribers",
  "Newsletter envoyée à {sent} abonnés.": "Newsletter sent to {sent} subscribers.",
  "Newsletter envoyée à {sent} abonnés ({failed} échecs).":
    "Newsletter sent to {sent} subscribers ({failed} failures).",
  Rôle: "Role",
  Pays: "Country",
  Inscription: "Signup",
  Vérifier: "Verify",
  "Aucun utilisateur": "No users",
  "Aucun produit": "No products",
  admin: "admin",
  "Exporter CSV": "Export CSV",
  "Export…": "Exporting…",
  Ville: "City",
  Quantité: "Quantity",
  Total: "Total",
  Commission: "Commission",
  "Prix payé": "Price paid",
  Livraison: "Delivery",
  Statut: "Status",
  CGV: "Terms",
  CGU: "Terms of Use",
  "Mentions légales": "Legal notice",
  "Conditions générales d'utilisation": "Terms of Use",
  "Les règles pour utiliser Mboppi en tant que boutique, vendeur, client ou créateur.":
    "The rules for using Mboppi as a shop, seller, client or creator.",
  "J'ai lu et j'accepte les": "I have read and I accept the",
  "Vous devez accepter les Conditions Générales d'Utilisation pour vous inscrire.":
    "You must accept the Terms of Use to sign up.",
  "Mot de passe (8 caractères minimum)": "Password (8 characters minimum)",
  "1. Objet et acceptation": "1. Purpose and acceptance",
  "Les présentes Conditions générales d'utilisation (CGU) régissent votre accès et votre utilisation de la plateforme Mboppi. En créant votre compte, vous acceptez pleinement et sans réserve ces conditions.":
    "These Terms of Use govern your access to and use of the Mboppi platform. By creating your account, you fully and unconditionally accept these terms.",
  "2. Création d'un compte": "2. Account creation",
  "Vous vous engagez à fournir des informations exactes et à jour lors de votre inscription. Vous êtes responsable de la confidentialité de votre mot de passe et de toutes les actions réalisées avec votre compte.":
    "You agree to provide accurate and up-to-date information when registering. You are responsible for the confidentiality of your password and for all actions carried out with your account.",
  "3. Les rôles sur Mboppi": "3. Roles on Mboppi",
  "Mboppi met en relation des boutiques, des vendeurs, des clients et des créateurs. Chaque compte est associé à un rôle qui détermine les fonctionnalités disponibles : publier des produits, vendre, commander ou créer.":
    "Mboppi connects shops, sellers, clients and creators. Each account is linked to a role that determines the available features: publishing products, selling, ordering or creating.",
  "4. Commandes et paiement": "4. Orders and payment",
  "Les commandes sont passées directement avec la boutique ou le vendeur. Aucun paiement n'est effectué en ligne sur Mboppi : le paiement se fait directement avec le vendeur ou le livreur, à la livraison ou par mobile money.":
    "Orders are placed directly with the shop or seller. No payment is made online on Mboppi: payment is done directly with the seller or delivery driver, on delivery or by mobile money.",
  "5. Commissions et parrainage": "5. Commissions and referrals",
  "Les boutiques rémunèrent les vendeurs et les parrains par des commissions enregistrées sur la plateforme. Les montants et les modalités de réclamation et de paiement sont affichés dans les espaces vendeur, boutique et client.":
    "Shops pay sellers and referrers commissions recorded on the platform. Amounts and the claiming and payment terms are shown in the seller, shop and client spaces.",
  "6. Contenu publié": "6. Posted content",
  "Les boutiques, vendeurs et créateurs publient leurs propres produits, offres et créations. Ils sont seuls responsables de l'exactitude et de la légalité de leur contenu. Mboppi peut retirer tout contenu illicite ou inapproprié.":
    "Shops, sellers and creators post their own products, offers and creations. They are solely responsible for the accuracy and legality of their content. Mboppi may remove any unlawful or inappropriate content.",
  "7. Livraison": "7. Delivery",
  "La livraison est assurée par les boutiques ou des livreurs partenaires. Les délais et les frais sont indiqués sur chaque produit et convenus avec le vendeur ou la boutique lors de la commande.":
    "Delivery is handled by the shops or partner delivery drivers. Delivery times and fees are shown on each product and agreed with the seller or shop when ordering.",
  "8. Comportement interdit": "8. Prohibited conduct",
  "Il est interdit d'utiliser la plateforme de manière frauduleuse : créer de fausses commandes, usurper une identité, publier des informations fausses ou trompeuses, ou tenter de contourner les règles de la plateforme.":
    "It is forbidden to use the platform fraudulently: creating fake orders, impersonating someone, posting false or misleading information, or trying to bypass the platform's rules.",
  "9. Suspension et résiliation": "9. Suspension and termination",
  "Mboppi peut suspendre ou supprimer un compte en cas de non-respect des présentes conditions. Vous pouvez supprimer votre compte à tout moment depuis votre espace « Mon compte ».":
    'Mboppi may suspend or delete an account when these terms are not respected. You can delete your account at any time from your "My Account" space.',
  "10. Données personnelles": "10. Personal data",
  "Vos données personnelles sont traitées conformément à notre politique de confidentialité, consultable sur la page Données personnelles.":
    "Your personal data is processed in accordance with our privacy policy, available on the Personal Data page.",
  "11. Acceptation des conditions": "11. Acceptance of the terms",
  "En cochant la case lors de votre inscription, vous confirmez avoir lu et accepté ces Conditions générales d'utilisation. Pour toute question, contactez-nous via la page Contact.":
    "By ticking the box when you sign up, you confirm that you have read and accepted these Terms of Use. For any question, please contact us via the Contact page.",
  "Conditions générales de vente": "Terms and conditions of sale",
  "Les règles qui régissent les ventes sur Mboppi.": "The rules governing sales on Mboppi.",
  "Conditions générales": "Terms and conditions",
  "1. Rôle de la plateforme": "1. Role of the platform",
  "Mboppi met en relation des boutiques, des créateurs, des vendeurs et des clients. Les ventes sont conclues directement entre l'acheteur et le vendeur ou la boutique. Mboppi ne perçoit aucun paiement en ligne.":
    "Mboppi connects shops, creators, sellers and clients. Sales are concluded directly between the buyer and the seller or the shop. Mboppi never collects any online payment.",
  "2. Commandes": "2. Orders",
  "Une commande est enregistrée avec le nom et le code de l'acheteur. L'état de la commande (en attente, confirmée, livrée) peut être suivi sur la page de suivi. Une commande annulée ne donne lieu à aucun paiement.":
    "An order is recorded with the buyer's name and code. The order status (pending, confirmed, delivered) can be tracked on the tracking page. A cancelled order gives rise to no payment.",
  "3. Paiement et livraison": "3. Payment and delivery",
  "Le paiement s'effectue directement avec le vendeur ou le livreur, à la livraison ou par mobile money. Les frais de livraison sont indiqués sur chaque produit. Mboppi ne stocke aucun moyen de paiement.":
    "Payment is made directly with the seller or delivery driver, on delivery or by mobile money. Delivery fees are shown on each product. Mboppi stores no payment details.",
  "4. Garanties et retours": "4. Warranties and returns",
  "Les garanties éventuelles sont indiquées sur chaque produit. Les retours se traitent directement avec la boutique ou le vendeur. En cas de litige, Mboppi peut servir d'intermédiaire de médiation.":
    "Any warranties are stated on each product. Returns are handled directly with the shop or seller. In case of a dispute, Mboppi may act as a mediator.",
  "5. Responsabilité": "5. Liability",
  "Mboppi ne peut être tenu responsable des produits vendus par les boutiques et vendeurs, ni des retards de livraison imputables aux livreurs. Les informations publiées le sont par les vendeurs eux-mêmes.":
    "Mboppi cannot be held responsible for products sold by shops and sellers, nor for delivery delays caused by delivery drivers. Published information is provided by the sellers themselves.",
  "6. Contact": "6. Contact",
  "Pour toute question sur ces conditions, contactez-nous via la page Contact.":
    "For any question about these terms, contact us via the Contact page.",
  FAQ: "FAQ",
  "Questions fréquentes": "Frequently asked questions",
  "Tout ce que vous devez savoir sur Mboppi.": "Everything you need to know about Mboppi.",
  "Comment créer un compte ?": "How do I create an account?",
  "Créez un compte gratuitement en moins d'une minute : choisissez votre rôle (boutique, vendeur, client ou créateur), renseignez votre nom et votre e-mail. Vous pouvez aussi vous connecter avec Google.":
    "Create a free account in less than a minute: choose your role (shop, seller, client or creator), enter your name and email. You can also sign in with Google.",
  "Comment commander ?": "How do I order?",
  "Ajoutez un produit à votre panier puis validez la commande avec vos coordonnées. Vous recevez un code client pour suivre votre commande sur la page de suivi. Vous pouvez aussi contacter directement la boutique sur WhatsApp.":
    "Add a product to your cart then confirm the order with your details. You receive a customer code to track your order on the tracking page. You can also contact the shop directly on WhatsApp.",
  "Comment payer ?": "How do I pay?",
  "Aucune carte bancaire n'est nécessaire. Le paiement se fait directement avec le vendeur ou le livreur, à la livraison ou par mobile money. Mboppi ne demande jamais de paiement en ligne.":
    "No bank card is needed. Payment is made directly with the seller or delivery driver, on delivery or by mobile money. Mboppi never asks for online payment.",
  "Comment devenir vendeur ?": "How do I become a seller?",
  "Créez un compte avec le rôle « vendeur ». Vous recevrez un code vendeur à partager avec vos clients. Pour chaque vente, vous gagnez la commission affichée sur le produit.":
    'Create an account with the "seller" role. You will receive a seller code to share with your clients. For each sale, you earn the commission shown on the product.',
  "Comment est calculée ma commission ?": "How is my commission calculated?",
  "La boutique choisit un pourcentage de commission pour chaque produit. Ce pourcentage est affiché sur la fiche produit. Le vendeur reçoit le montant total moins la commission de la boutique.":
    "The shop chooses a commission percentage for each product. This percentage is shown on the product page. The seller receives the total amount minus the shop's commission.",
  "Comment suivre ma commande ?": "How do I track my order?",
  "Utilisez la page « Suivi de commande » avec votre numéro de commande et votre code client. Vous y voyez l'état en temps réel : enregistrée, confirmée ou livrée.":
    'Use the "Order tracking" page with your order number and customer code. You see the real-time status: recorded, confirmed or delivered.',
  "Comment contacter le support ?": "How do I contact support?",
  "Utilisez la page Contact ou écrivez-nous sur WhatsApp. Nous répondons généralement en moins de 24 heures.":
    "Use the Contact page or write to us on WhatsApp. We usually reply within 24 hours.",
  "Puis-je supprimer mon compte ?": "Can I delete my account?",
  "Oui, depuis votre espace « Mon compte ». Vos données sont alors supprimées définitivement de notre base.":
    'Yes, from your "My account" space. Your data is then permanently deleted from our database.',
  "Éditeur du site": "Site publisher",
  "Le site Mboppi est édité par l'équipe Mboppi. Pour toute question, utilisez la page Contact.":
    "The Mboppi website is published by the Mboppi team. For any question, use the Contact page.",
  Hébergement: "Hosting",
  "Le site est hébergé par Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis. Les données sont stockées dans une base PostgreSQL hébergée par Neon.":
    "The website is hosted by Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA. Data is stored in a PostgreSQL database hosted by Neon.",
  "Propriété intellectuelle": "Intellectual property",
  "Les contenus publiés par les boutiques et vendeurs (produits, photos, descriptions) leur appartiennent. La marque et le nom Mboppi appartiennent à leurs propriétaires.":
    "Content published by shops and sellers (products, photos, descriptions) belongs to them. The Mboppi brand and name belong to their owners.",
  "Mboppi utilise des cookies pour améliorer votre expérience (thème, langue, panier). Nous ne vendons aucune donnée.":
    "Mboppi uses cookies to improve your experience (theme, language, cart). We sell no data.",
  Accepter: "Accept",
  "En savoir plus": "Learn more",
  Cookies: "Cookies",
  "Prix min": "Min price",
  "Prix max": "Max price",
  "Prix minimum": "Minimum price",
  "Prix maximum": "Maximum price",
  "⭐ Mieux notés": "⭐ Top rated",
  "{n} vendus": "{n} sold",
  "{n} en attente": "{n} pending",
  "Votre code de confirmation": "Your confirmation code",
  "Entrez votre code de confirmation (reçu avec votre commande) pour suivre son état.":
    "Enter your confirmation code (received with your order) to track its status.",
  "Code de confirmation": "Confirmation code",
  "Communiquez ce code au livreur lors de la remise pour valider la livraison.":
    "Give this code to the delivery person at handover to validate the delivery.",
  "Code de confirmation du client *": "Client confirmation code *",
  "Demandez ce code au client. Il l'a reçu à la commande et sur le suivi de commande.":
    "Ask the client for this code. They received it at order time and on the order tracking page.",
  Confirmer: "Confirm",
  "📈 Ventes des 14 derniers jours": "📈 Sales of the last 14 days",
  "Graphique des ventes des 14 derniers jours": "Chart of sales of the last 14 days",
  "vente(s)": "sale(s)",
  "🏆 Meilleurs produits": "🏆 Top products",
  LIVRÉ: "DELIVERED",
  FACTURE: "INVOICE",
  "Marché en ligne — livraison confirmée": "Online marketplace — delivery confirmed",
  "Marché en ligne — commande enregistrée": "Online marketplace — order recorded",
  "N°": "No.",
  "Merci pour votre avis !": "Thank you for your review!",
  "Mon lien de parrainage": "My referral link",
  "Partagez ce lien : chaque personne qui s'inscrit via ce lien devient votre filleul. Vous gagnez 2% du prix de chacun de ses achats (commission payée par la boutique).":
    "Share this link: anyone who signs up through it becomes your referral. You earn 2% of the price of each of their purchases (commission paid by the shop).",
  "Copier le lien": "Copy link",
  "Générez d'abord votre code vendeur ci-dessus pour obtenir votre lien.":
    "First generate your seller code above to get your link.",
  Réclamer: "Claim",
  Réclamée: "Claimed",
  "Paiement réclamé": "Payment claimed",
  "Réclamer le paiement de vos commissions pour « {name} » à la boutique ?":
    "Claim your commissions for « {name} » from the shop?",
  "Paiement réclamé ! La boutique a été notifiée.": "Payment claimed! The shop has been notified.",
  parrainage: "referral",
  "Commission produit": "Product commission",
  "Commission parrainage (2%)": "Referral commission (2%)",
  "Vous vous inscrivez via le lien d'un vendeur Mboppi : votre inscription est gratuite, le rôle « Client » est sélectionné pour vous.":
    'You are signing up through a Mboppi seller link: it is free, and the "Client" role is preselected for you.',
  "Code du vendeur (parrainage)": "Seller code (referral)",
  "Le vendeur {seller} réclame le paiement de sa commission pour « {product} ».":
    "Seller {seller} is claiming payment of their commission for « {product} ».",
  "Voir tous les produits": "View all products",
  "Voir par ville": "View by city",
  "Choisir une ville…": "Choose a city…",
  "Sélectionnez une ville pour voir les boutiques disponibles.":
    "Select a city to see the available shops.",
  "Aucune boutique dans cette ville pour le moment. Revenez bientôt !":
    "No shops in this city for now. Come back soon!",
  "{n} produits": "{n} products",
  "Ville non renseignée": "City not provided",
  "Saisir une ville (ex : Yaoundé)…": "Enter a city (e.g. Yaoundé)…",
  "Saisissez une ville pour voir ses boutiques, ses créateurs et ses produits.":
    "Enter a city to see its shops, creators and products.",
  "Aucune boutique ni produit dans cette ville pour le moment.":
    "No shops or products in this city for now.",
  "Boutiques et créateurs": "Shops and creators",
  "ex : +237 6 00 00 00 00": "e.g. +237 6 00 00 00 00",
  "Votre nom, votre adresse e-mail, votre numéro de téléphone et votre pays.":
    "Your name, email, phone number and country.",
};

const AR = {
  // Navbar / App
  Produits: "المنتجات",
  "Vitrine d'offre": "عرض العروض",
  Connexion: "تسجيل الدخول",
  "Créer un compte": "إنشاء حساب",
  "Ma boutique": "متجري",
  "Mon espace vendeur": "فضاء البائع",
  "Mon espace client": "فضاء العميل",
  "Mon espace créateur": "فضاء المبدع",
  "Mon compte": "حسابي",
  Déconnexion: "تسجيل الخروج",
  "Ouvrir le menu": "فتح القائمة",
  "Fermer le menu": "إغلاق القائمة",
  "Basculer le mode sombre ou clair": "تبديل الوضع الداكن أو الفاتح",
  "Passer en mode clair": "التبديل إلى الوضع الفاتح",
  "Passer en mode sombre": "التبديل إلى الوضع الداكن",
  "Changer la langue du site": "تغيير لغة الموقع",
  "Suivez sur": "تابعنا على",
  "Suivez-nous sur les réseaux sociaux": "تابعنا على وسائل التواصل الاجتماعي",
  "Espace réservé. Entrez le mot de passe administrateur.": "منطقة مخصصة. أدخل كلمة مرور المشرف.",
  "Mot de passe": "كلمة المرور",
  "Vérification…": "جارٍ التحقق…",
  Entrer: "دخول",
  "Se déconnecter": "تسجيل الخروج",
  boutique: "متجر",
  vendeur: "بائع",
  client: "عميل",
  créateur: "مبدع",
  "Mon espace": "فضائي",
  "Chargement…": "جارٍ التحميل…",
  "Page introuvable": "الصفحة غير موجودة",
  "Retour à l'accueil": "العودة إلى الرئيسية",
  Retour: "رجوع",

  // Footer
  "À propos": "من نحن",
  Contact: "اتصل بنا",
  "Données personnelles": "البيانات الشخصية",
  "Marché en ligne pour boutiques, vendeurs, clients et créateurs. Commandez facilement via WhatsApp.":
    "سوق إلكتروني للمتاجر والبائعين والعملاء والمبدعين. اطلب بسهولة عبر واتساب.",
  Navigation: "التنقل",
  Accueil: "الرئيسية",
  Compte: "الحساب",
  "Tous droits réservés.": "جميع الحقوق محفوظة.",

  // Newsletter
  "Restez informé": "ابق على اطلاع",
  "Recevez nos bons plans et nouveautés directement par email.":
    "احصل على عروضنا وأخبارنا مباشرة عبر البريد الإلكتروني.",
  "Votre adresse email": "بريدك الإلكتروني",
  "S'abonner": "اشترك",
  "Envoi…": "جارٍ الإرسال…",
  "Merci ! Vous êtes bien inscrit(e) à la newsletter.": "شكرًا! تم تسجيلك في النشرة الإخبارية.",
  "Adresse invalide ou problème lors de l'inscription. Réessayez.":
    "عنوان غير صالح أو مشكلة أثناء التسجيل. حاول مرة أخرى.",
  "Désinscription possible à tout moment via le lien présent dans chaque email.":
    "يمكنك إلغاء الاشتراك في أي وقت عبر الرابط الموجود في كل بريد إلكتروني.",

  // Support / menu
  "Je soutiens": "أدعم",
  "Formations et Digital": "تدريب ورقمنة",
  "Formation Mboppi": "تدريب Mboppi",
  "Je soutiens Mboppi": "أدعم مبوّي",
  "Chaque geste compte pour faire grandir Mboppi": "كل مساهمة تصنع الفرق لتنمية مبوّي",
  "Votre soutien nous aide à payer les frais du site, à améliorer la plateforme et à accompagner nos boutiques et vendeurs. Chaque contribution, même petite, fait avancer le projet.":
    "دعمكم يساعدنا في دفع تكاليف الموقع، وتحسين المنصة، ومرافقة متاجرنا وبائعينا. كل مساهمة، مهما صغرت، تدفع المشروع إلى الأمام.",
  "Comment pouvez-vous soutenir le projet ?": "كيف يمكنك دعم المشروع؟",
  "Choisissez le moyen qui vous convient.": "اختر الطريقة التي تناسبك.",
  "Orange Money": "أورنج موني",
  "MTN Mobile Money": "إم تي إن موبايل موني",
  PayPal: "PayPal",
  "Virement bancaire (UBA)": "تحويل بنكي (UBA)",
  "Merci pour votre soutien !": "شكراً لدعمكم!",
  "Avec votre aide, Mboppi continue de connecter les boutiques, les vendeurs et les clients de toute la communauté.":
    "بمساعدتكم، تواصل مبوّي ربط المتاجر والبائعين والعملاء في كل المجتمع.",
  "Soutenez Mboppi : Orange Money, MTN Mobile Money, PayPal ou virement bancaire UBA.":
    "ادعم مبوّي: أورنج موني، إم تي إن موبايل موني، باي بال أو تحويل بنكي UBA.",

  // ProductCard
  "Boutique : {shop}": "المتجر: {shop}",
  "Garantie {n} mois": "ضمان {n} شهر",
  "Livraison {price} {symbol}": "التوصيل {price} {symbol}",
  "Livraison gratuite": "توصيل مجاني",
  "Prix de vente": "سعر البيع",
  "Commission ({n}%)": "العمولة ({n}%)",
  "En stock : {n}": "متوفر: {n}",
  "Rupture de stock": "نفدت الكمية",
  Vendre: "بيع",

  // OfferCard
  "Économisez {n} {symbol}": "وفّر {n} {symbol}",

  // Seo
  "Mboppi - {title}": "مبوبي - {title}",
  "Mboppi : boutique en ligne, vendeurs, créateurs.": "مبوبي: متجر إلكتروني، بائعون، مبدعون.",
  "Marché en ligne Mboppi.": "سوق مبوبي الإلكتروني.",

  // Home
  "Bienvenue sur Mboppi": "مرحباً بكم في مبوبي",
  "Le marché où boutiques, vendeurs et créateurs se rencontrent. Commandez directement sur WhatsApp !":
    "السوق حيث يلتقي المتاجر والبائعون والمبدعون. اطلب مباشرة عبر واتساب!",
  "Voir les offres": "عرض العروض",
  "Créer un compte gratuit": "أنشئ حساباً مجانياً",
  "Produits récents": "أحدث المنتجات",
  "Offres du moment": "عروض اللحظة",
  "Aucun produit disponible pour le moment.": "لا توجد منتجات متاحة حالياً.",
  "Bienvenue chez Mboppi": "مرحباً بكم في مبوبي",
  "BIENVENUE SUR MBOPPI": "مرحباً بكم في مبوبي",
  "Rechercher un produit, une boutique…": "ابحث عن منتج أو متجر…",
  "Rechercher un produit": "ابحث عن منتج",
  "Rechercher une boutique": "ابحث عن متجر",
  "Rechercher une création": "ابحث عن إبداع",
  "Type de recherche": "نوع البحث",
  "Catégories populaires": "فئات شائعة",
  "Voir toutes les offres": "عرض كل العروض",
  "Filtrer par catégorie": "تصفية حسب الفئة",
  Trier: "ترتيب",
  "Aucun produit dans cette catégorie.": "لا يوجد منتج في هذه الفئة.",
  "Aucun résultat pour votre recherche.": "لا توجد نتائج لبحثك.",
  "Aucun produit disponible.": "لا توجد منتجات متاحة.",
  "Prix normal ({symbol})": "السعر العادي ({symbol})",
  "ex : 5000 (s'affiche barré)": "مثال: 5000 (يظهر مشطوباً)",
  "ex : 3500 (s'affiche en vert)": "مثال: 3500 (يظهر بالأخضر)",
  "Garantie (chiffres ou lettres)": "الضمان (أرقام أو حروف)",
  "Renseignez au moins un prix (normal ou de vente).":
    "أدخل سعراً واحداً على الأقل (عادي أو ترويجي).",
  "Rejoignez Mboppi": "انضم إلى مبوبي",
  "Boutiques en ligne": "المتاجر الإلكترونية",
  "Créez votre vitrine et publiez vos produits.": "أنشئ واجهة متجرك وانشر منتجاتك.",
  Vendeurs: "البائعون",
  "Vendez les produits des boutiques et gagnez des commissions.":
    "بِع منتجات المتاجر واربح العمولات.",
  Clients: "العملاء",
  "Parcourez le marché et commandez sur WhatsApp.": "تصفح السوق واطلب عبر واتساب.",
  Créateurs: "المبدعون",
  "Faites rayonner vos créations.": "أبرز إبداعاتك.",
  "Les créateurs": "المبدعون",
  "Créateurs de Mboppi": "مبدعو Mboppi",
  "Découvrez les créateurs de Mboppi et leurs créations artisanales.":
    "اكتشف مبدعي Mboppi وإبداعاتهم الحرفية.",
  "Créations de {name}": "إبداعات {name}",
  "Créations sur Mboppi": "إبداعات على Mboppi",
  "Vitrine de créations sur Mboppi.": "واجهة عرض إبداعات على Mboppi.",
  "Voir ma vitrine": "عرض واجهتي",
  "Voir les créations": "عرض الإبداعات",
  "Aucun créateur pour le moment.": "لا يوجد مبدعون في الوقت الحالي.",
  Commencer: "ابدأ",

  // Register
  Inscription: "التسجيل",
  "Pays *": "الدولة *",
  "Choisir votre pays…": "اختر دولتك…",
  "Je veux m'inscrire en tant que :": "أريد التسجيل بصفة:",
  "Boutique (shop)": "متجر",
  "Je crée et gère ma boutique.": "أنشئ وأدير متجري.",
  "Vendeur (seller)": "بائع",
  "Je vends les produits des boutiques et gagne une commission.":
    "أبيع منتجات المتاجر وأربح عمولة.",
  Client: "عميل",
  "Je consulte le marché et je commande.": "أتصفح السوق وأطلب.",
  "Créateur (creator)": "مبدع",
  "Je mets en valeur mes créations.": "أُبرز إبداعاتي.",
  "Nom complet *": "الاسم الكامل *",
  "Adresse e-mail *": "البريد الإلكتروني *",
  "Mot de passe *": "كلمة المرور *",
  "6 caractères minimum": "6 أحرف على الأقل",
  "S'inscrire": "تسجيل",
  "Déjà un compte ?": "لديك حساب بالفعل؟",
  "Se connecter": "تسجيل الدخول",
  "ou s'inscrire avec Google": "أو التسجيل عبر جوجل",
  "Veuillez remplir tous les champs.": "يرجى ملء جميع الحقول.",
  "Une erreur est survenue, réessayez.": "حدث خطأ، حاول مرة أخرى.",

  // Login
  "Connexion à Mboppi": "تسجيل الدخول إلى مبوبي",
  "Ravi de vous revoir !": "سعدنا بعودتك!",
  "Se connecter à mon compte": "تسجيل الدخول إلى حسابي",
  "Mot de passe": "كلمة المرور",
  "Pas encore de compte ?": "ليس لديك حساب بعد؟",
  "S'inscrire ici": "سجّل هنا",
  "Email ou mot de passe incorrect.": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  Téléphone: "الهاتف",
  "Numéro de téléphone": "رقم الهاتف",

  // AuthGoogle
  "Connexion en cours…": "جارٍ تسجيل الدخول…",
  "Merci de patienter pendant la connexion à votre compte Google.":
    "يرجى الانتظار أثناء تسجيل الدخول بحساب جوجل.",
  "Connexion réussie, redirection…": "تم تسجيل الدخول بنجاح، جارٍ التحويل…",

  // MyAccount
  Profil: "الملف الشخصي",
  "Votre nom, votre adresse e-mail et votre pays.": "اسمك وبريدك الإلكتروني ودولتك.",
  Nom: "الاسم",
  "E-mail": "البريد الإلكتروني",
  Pays: "الدولة",
  "Localisation (ville)": "الموقع (المدينة)",
  "Votre ville ou quartier (affiché sur vos produits).": "مدينتك أو حيّك (يظهر على منتجاتك).",
  Enregistrer: "حفظ",
  "Profil mis à jour !": "تم تحديث الملف الشخصي!",
  Sécurité: "الأمان",
  "Modifier mon mot de passe": "تغيير كلمة المرور",
  "Vous pouvez changer votre mot de passe à tout moment.": "يمكنك تغيير كلمة المرور في أي وقت.",
  "Mot de passe actuel": "كلمة المرور الحالية",
  "Nouveau mot de passe": "كلمة المرور الجديدة",
  "Confirmer le mot de passe": "تأكيد كلمة المرور",
  "Confirmer le nouveau mot de passe": "تأكيد كلمة المرور الجديدة",
  "Changer le mot de passe": "تغيير كلمة المرور",
  "Mot de passe modifié !": "تم تغيير كلمة المرور!",
  "Les mots de passe ne correspondent pas.": "كلمتا المرور غير متطابقتين.",
  "Mot de passe actuel incorrect.": "كلمة المرور الحالية غير صحيحة.",
  "Zone dangereuse": "منطقة الخطر",
  "Supprimer mon compte": "حذف حسابي",
  "La suppression est définitive : produits et ventes seront retirés.":
    "الحذف نهائي: ستُحذف المنتجات والمبيعات.",
  "Confirmer la suppression": "تأكيد الحذف",
  "Entrez votre mot de passe pour confirmer :": "أدخل كلمة المرور للتأكيد:",
  "Compte supprimé. À bientôt !": "تم حذف الحساب. إلى اللقاء!",
  "Mot de passe incorrect.": "كلمة المرور غير صحيحة.",
  "Veuillez entrer votre mot de passe.": "يرجى إدخال كلمة المرور.",
  "Le mot de passe doit contenir au moins 6 caractères.":
    "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.",

  // ShopDashboard
  "Gérez vos produits et suivez vos ventes.": "أدر منتجاتك وتابع مبيعاتك.",
  "+ Ajouter un produit": "+ إضافة منتج",
  Annuler: "إلغاء",
  Retirer: "إزالة",
  "Ajouter un produit": "إضافة منتج",
  "Nom du produit *": "اسم المنتج *",
  "Catégorie *": "الفئة *",
  "Choisir une catégorie…": "اختر فئة…",
  Description: "الوصف",
  "Photos (3 max)": "الصور (3 كحد أقصى)",
  "Ajouter une photo": "إضافة صورة",
  "Vos produits": "منتجاتك",
  "Aucun produit pour le moment.": "لا توجد منتجات حالياً.",
  "Garantie (mois)": "الضمان (بالأشهر)",
  "Quantité *": "الكمية *",
  "Frais de livraison ({symbol})": "رسوم التوصيل ({symbol})",
  "Contact de la boutique": "رقم تواصل المتجر",
  "Prix de vente ({symbol}) *": "سعر البيع ({symbol}) *",
  "Commission vendeur (%) *": "عمولة البائع (%) *",
  "Produit ajouté !": "تمت إضافة المنتج!",
  "Produit mis à jour !": "تم تحديث المنتج!",
  "Produit supprimé.": "تم حذف المنتج.",
  "Enregistrer les modifications": "حفظ التعديلات",
  "Ventes enregistrées": "المبيعات المسجلة",
  "Chiffre d'affaires": "رقم المعاملات",
  "Commissions versées aux vendeurs": "العمولات المدفوعة للبائعين",
  "Aucune vente pour le moment.": "لا توجد مبيعات حالياً.",
  "Historique des ventes": "سجل المبيعات",
  Produit: "المنتج",
  Vendeur: "البائع",
  Acheteur: "المشتري",
  Date: "التاريخ",
  Quantité: "الكمية",
  Total: "الإجمالي",
  Commission: "العمولة",
  "Le vendeur affichera : {price} {symbol} et gagnera {commission} {symbol} de commission.":
    "سيعرض البائع: {price} {symbol} وسيربح {commission} {symbol} كعمولة.",
  Modifier: "تعديل",
  Rétirer: "إزالة",
  "Retrait…": "جارٍ الإزالة…",

  // SellerDashboard
  "Produits disponibles": "المنتجات المتاحة",
  "Commission totale générée": "إجمالي العمولة المولّدة",
  "Commission confirmée": "العمولة المؤكدة",
  "Vendre : {name}": "بيع: {name}",
  "Prix : {price} {symbol} — Votre commission : {commission} {symbol} par unité":
    "السعر: {price} {symbol} — عمولتك: {commission} {symbol} للوحدة",
  "Nom de l'acheteur *": "اسم المشتري *",
  "Téléphone de l'acheteur": "هاتف المشتري",
  "Vente enregistrée !": "تم تسجيل البيع!",
  "Mes ventes": "مبيعاتي",
  "Total de la vente": "إجمالي البيع",
  "Votre commission": "عمولتك",
  Statut: "الحالة",
  "En attente de confirmation": "بانتظار التأكيد",

  // ClientDashboard
  "Bienvenue {name} !": "مرحباً {name}!",
  "Découvrez les produits et offres des boutiques.": "اكتشف منتجات وعروض المتاجر.",
  "Voir les produits": "عرض المنتجات",
  "Compte créé le {date}": "تاريخ إنشاء الحساب: {date}",
  "Derniers produits": "أحدث المنتجات",
  "Mes informations": "معلوماتي",

  // CreatorDashboard
  "Bienvenue {name} ! Faites rayonner vos créations sur le marché Mboppi.":
    "مرحباً {name}! أبرز إبداعاتك في سوق مبوبي.",
  "Bientôt disponible : une vitrine dédiée à vos créations.": "قريباً: واجهة مخصصة لإبداعاتك.",

  // ProductDetail
  "Retour aux produits": "العودة إلى المنتجات",
  Boutique: "المتجر",
  "Quantité disponible : {n}": "الكمية المتاحة: {n}",
  "Commandez sur WhatsApp": "اطلب عبر واتساب",
  "Rétirer ce produit": "إزالة هذا المنتج",
  "Produit introuvable.": "المنتج غير موجود.",
  "Votre message WhatsApp :": "رسالتك عبر واتساب:",

  // OfferDetail
  "Retour aux offres": "العودة إلى العروض",
  "Prix d'origine : {price} {symbol}": "السعر الأصلي: {price} {symbol}",
  "Commandez cette offre": "اطلب هذا العرض",
  "Offre introuvable.": "العرض غير موجود.",
  "Catégorie : {cat}": "الفئة: {cat}",
  "Garantie : {warranty}": "الضمان: {warranty}",
  "Disponible : {n}": "متوفر: {n}",

  // VitrineOffre
  "Vitrine d'offres": "عرض العروض",
  "Découvrez les meilleures offres du moment.": "اكتشف أفضل العروض حالياً.",
  "Rechercher une offre…": "ابحث عن عرض…",
  "Catégorie :": "الفئة:",
  "Économies totales : {n} {symbol}": "إجمالي التوفير: {n} {symbol}",
  "Aucune offre trouvée.": "لم يتم العثور على عروض.",
  "Résultat : {n} offre(s)": "النتيجة: {n} عرضاً",

  // Verone
  "Gestion des offres": "إدارة العروض",
  "Zone réservée.": "منطقة مخصصة.",
  "Fermer le formulaire": "إغلاق النموذج",
  "+ Ajouter une Offre": "+ إضافة عرض",
  "Nom de l'offre *": "اسم العرض *",
  Catégorie: "الفئة",
  "ex : Électronique, Mode, Alimentation…": "مثال: إلكترونيات، أزياء، أغذية…",
  Garantie: "الضمان",
  "ex : 6 mois, 1 an, 2 ans": "مثال: 6 أشهر، سنة، سنتان",
  "Prix promotionnel ({symbol}) *": "السعر الترويجي ({symbol}) *",
  "Publier l'offre": "نشر العرض",
  "Offre publiée !": "تم نشر العرض!",
  "Mise à jour réussie !": "تم التحديث بنجاح!",
  Supprimer: "حذف",
  "Mot de passe requis": "كلمة المرور مطلوبة",
  "Supprimer cette offre ?": "حذف هذا العرض؟",
  "Photo :": "الصورة:",
  "Prix original : {price} {symbol}": "السعر الأصلي: {price} {symbol}",
  "Prix promotionnel : {price} {symbol}": "السعر الترويجي: {price} {symbol}",

  // About
  "À propos de Mboppi": "من نحن - مبوبي",
  "Mboppi est un marché en ligne conçu pour connecter boutiques, vendeurs, clients et créateurs.":
    "مبوبي هو سوق إلكتروني يربط المتاجر والبائعين والعملاء والمبدعين.",
  "Notre mission": "مهمتنا",
  "Faciliter le commerce local en donnant à chacun une vitrine simple et accessible, avec commande directe via WhatsApp.":
    "تسهيل التجارة المحلية بمنح الجميع واجهة بسيطة وسهلة، مع الطلب المباشر عبر واتساب.",
  "Nos valeurs": "قيمنا",
  Simplicité: "البساطة",
  "Une prise en main rapide pour tous.": "استخدام سريع وسهل للجميع.",
  Transparence: "الشفافية",
  "Des commissions claires et visibles.": "عمولات واضحة ومرئية.",
  Communauté: "المجتمع",
  "Boutiques, vendeurs et créateurs grandissent ensemble.":
    "المتاجر والبائعون والمبدعون ينمون معاً.",
  "Pour qui ?": "لمن هذه المنصة؟",
  Boutiques: "المتاجر",
  "Vendez vos produits à travers des vendeurs partenaires.": "بِع منتجاتك عبر بائعين شركاء.",
  "Gagnez des commissions sur chaque vente.": "اربح عمولة على كل عملية بيع.",
  "Commandez facilement sur WhatsApp.": "اطلب بسهولة عبر واتساب.",
  "Présentez vos créations au marché.": "قدّم إبداعاتك إلى السوق.",
  "Contactez-nous": "اتصل بنا",
  "Une question ? Écrivez-nous sur WhatsApp.": "لديك سؤال؟ اكتب لنا عبر واتساب.",

  // Contact
  "Une question, un problème ou une suggestion ? Écrivez-nous, nous répondons rapidement.":
    "سؤال أو مشكلة أو اقتراح؟ اكتب لنا، نرد بسرعة.",
  "Nom *": "الاسم *",
  "Votre nom": "اسمك",
  "E-mail *": "البريد الإلكتروني *",
  "Votre e-mail": "بريدك الإلكتروني",
  "Message *": "الرسالة *",
  "Votre message…": "رسالتك…",
  "Envoyer via WhatsApp": "إرسال عبر واتساب",
  "Ou directement sur WhatsApp": "أو مباشرة عبر واتساب",
  "Votre message :": "رسالتك:",

  // Privacy
  "Quelles données collectons-nous ?": "ما البيانات التي نجمعها؟",
  "Nom, adresse e-mail, pays et rôle sur la plateforme.":
    "الاسم والبريد الإلكتروني والدولة والدور على المنصة.",
  "À quoi servent vos données ?": "لأي غرض نستخدم بياناتك؟",
  "Gérer votre compte, afficher vos produits et enregistrer vos ventes.":
    "إدارة حسابك وعرض منتجاتك وتسجيل مبيعاتك.",
  "Combien de temps sont-elles conservées ?": "كم تبقى البيانات محفوظة؟",
  "Tant que votre compte est actif. Vous pouvez le supprimer à tout moment depuis votre espace.":
    "طالما حسابك نشط. يمكنك حذفه في أي وقت من مساحتك.",
  "Les mots de passe sont chiffrés et les données sont protégées.":
    "كلمات المرور مشفرة والبيانات محمية.",
  "Comment supprimer mes données ?": "كيف أحذف بياناتي؟",
  "Allez dans « Mon compte » puis « Supprimer mon compte ».": "انتقل إلى «حسابي» ثم «حذف حسابي».",

  // Shared
  "Tout le monde": "الجميع",
  Tous: "الكل",
  "Rechercher…": "ابحث…",
  Recherche: "بحث",
  Favoris: "المفضلة",
  Panier: "السلة",
  "Oups, une erreur est survenue.": "عذراً، حدث خطأ ما.",
  "Réessayez ou rechargez la page. Vos données sont en sécurité.":
    "حاول مرة أخرى أو أعد تحميل الصفحة. بياناتك في أمان.",
  "Pas de connexion internet": "لا يوجد اتصال بالإنترنت",
  "Vous êtes actuellement hors ligne. Vérifiez votre connexion puis réessayez.":
    "أنت غير متصل حالياً. تحقق من اتصالك ثم أعد المحاولة.",
  "Mes fonds & transactions": "أموالي ومعاملاتي",
  "Solde": "الرصيد",
  "Reçus": "المستلمة",
  "Sortis": "المدفوعة",
  "Reversement en ligne": "تحويل عبر الإنترنت",
  "Encaissement en ligne": "تحصيل عبر الإنترنت",
  "Aucune transaction de fonds pour le moment.": "لا توجد معاملات أموال حالياً.",
  "Fonds indisponibles pour le moment.": "الأموال غير متاحة حالياً.",
  "Erreurs récentes (client)": "الأخطاء الأخيرة (العميل)",
  "Journal des erreurs de rendu remontées par les navigateurs. Si l'écran « Oups, une erreur est survenue » apparaît, sa cause exacte (message + pile) est enregistrée ici.":
    "أخطاء العرض المبلَّغ عنها من المتصفحات. إذا ظهرت شاشة «عذراً، حدث خطأ»، يُسجَّل سببها الدقيق (الرسالة + الأثر) هنا.",
  "Pile (début)": "الأثر (البداية)",
  "Aucune erreur enregistrée": "لا توجد أخطاء مسجلة",
  Réessayer: "إعادة المحاولة",
  "Désolé, Mboppi ne peut pas se connecter à internet en ce moment. Vérifiez votre réseau (Wi-Fi ou données mobiles) puis réessayez.":
    "عذراً، لا يستطيع Mboppi الاتصال بالإنترنت حالياً. تحقق من شبكتك (Wi-Fi أو بيانات الجوال) ثم أعد المحاولة.",
  "Toujours pas de connexion. Vérifiez votre réseau puis réessayez.":
    "لا يوجد اتصال بعد. تحقق من شبكتك ثم أعد المحاولة.",
  "Vos informations sont en sécurité sur votre appareil : rien n'est perdu.":
    "معلوماتك آمنة على جهازك: لا شيء يضيع.",
  Rechercher: "بحث",
  "Aucun résultat": "لا توجد نتائج",
  "Données & confidentialité": "البيانات والخصوصية",
  Appeler: "اتصال",
  "{n} photos": "{n} صور",
  "Commander sur WhatsApp": "اطلب عبر واتساب",
  "Disponibilité : {n} unité(s)": "التوفر: {n} وحدة",
  Offre: "عرض",
  "Bonjour, je suis intéressé(e) par votre offre « {name} » : {url}":
    "مرحباً، أنا مهتم بعرضكم «{name}»: {url}",
  "Bonjour, je suis intéressé(e) par le produit « {name} » : {url}":
    "مرحباً، أنا مهتم بالمنتج «{name}»: {url}",
  "Je publie mes produits (max 5) et je fixe les commissions":
    "أنشر منتجاتي (5 كحد أقصى) وأحدد العمولات",
  "Je vends les produits des boutiques et je gagne des commissions":
    "أبيع منتجات المتاجر وأربح عمولات",
  "Je consulte les offres et les produits, je commande facilement":
    "أتصفح العروض والمنتجات وأطلب بسهولة",
  "Je présente et vends mes créations au marché Mboppi": "أقدّم وأبيع إبداعاتي في سوق مبوبي",
  "Nom complet / Nom de la boutique": "الاسم الكامل / اسم المتجر",
  Email: "البريد الإلكتروني",
  "Mot de passe (6 caractères minimum)": "كلمة المرور (6 أحرف على الأقل)",
  ou: "أو",
  "S'inscrire avec Google": "التسجيل عبر جوجل",
  "Se connecter avec Google": "تسجيل الدخول عبر جوجل",
  "Déjà inscrit ?": "مسجل بالفعل؟",
  "Retour à l'inscription": "العودة إلى التسجيل",
  "Produits publiés : {n} / 5": "المنتجات المنشورة: {n} / 5",
  "Limite atteinte": "تم بلوغ الحد",
  "Nouveau produit": "منتج جديد",
  "Modifier le produit": "تعديل المنتج",
  "Photos (maximum {n})": "الصور (بحد أقصى {n})",
  "Compression…": "جارٍ الضغط…",
  "Photos complètes": "اكتملت الصور",
  "📷 Ajouter des photos": "📷 إضافة صور",
  "Quantité en stock *": "الكمية في المخزون *",
  "Garantie (en mois)": "الضمان (بالأشهر)",
  "Publier le produit": "نشر المنتج",
  "Produit publié avec succès.": "تم نشر المنتج بنجاح.",
  "Supprimer ce produit ?": "حذف هذا المنتج؟",
  "Aucun produit pour le moment. Ajoutez votre premier produit (max 5).":
    "لا توجد منتجات حالياً. أضف منتجك الأول (5 كحد أقصى).",
  "Statistiques des ventes": "إحصائيات المبيعات",
  "Aucune vente enregistrée par les vendeurs.": "لا توجد مبيعات مسجلة من البائعين.",
  Qté: "الكمية",
  Confirmer: "تأكيد",
  "Sélectionnez un produit des boutiques et enregistrez une vente.":
    "اختر منتجاً من المتاجر وسجّل عملية بيع.",
  "Ventes réalisées": "المبيعات المنفذة",
  "Vendre ce produit": "بيع هذا المنتج",
  "Téléphone (optionnel)": "الهاتف (اختياري)",
  "Enregistrer la vente": "تسجيل البيع",
  "Aucun produit disponible à vendre pour le moment.": "لا توجد منتجات متاحة للبيع حالياً.",
  "Mes ventes et commissions": "مبيعاتي وعمولاتي",
  "Vous n'avez pas encore enregistré de vente.": "لم تسجل أي عملية بيع بعد.",
  "Vente enregistrée. Commission créditée sur votre compte.":
    "تم تسجيل البيع. أُضيفت العمولة إلى حسابك.",
  "Commissions sur les produits": "العمولات على المنتجات",
  "Commissions fixées par les boutiques sur chaque produit. Cliquez sur une colonne pour trier.":
    "العمولات التي تحددها المتاجر على كل منتج. انقر على عمود للترتيب.",
  "Commission %": "العمولة %",
  Montant: "المبلغ",
  "Publication de produit": "نشر منتج",
  "Commission payée": "عمولة مدفوعة",
  "Commission de parrainage": "عمولة الإحالة",
  Activité: "النشاط",
  "Voir plus de produits": "عرض المزيد من المنتجات",
  "Télécharger le tableau (Excel)": "تنزيل الجدول (Excel)",
  "Le fichier téléchargé liste chaque activité du compte : publications de produits, ventes, commissions payées, achats et commandes.":
    "يسرد الملف الذي تم تنزيله كل نشاط في الحساب: نشر المنتجات والمبيعات والعمولات المدفوعة والمشتريات والطلبات.",
  "Mon code vendeur": "رمز البائع الخاص بي",
  "Générer mon code": "توليد رمزي",
  "Votre code identifie vos ventes auprès des boutiques. Communiquez-le à vos clients ou partagez votre lien de vente.":
    "رمزي يعرّف مبيعاتي لدى المتاجر. أعطه لعملائك أو شارك رابط البيع الخاص بك.",
  "Code copié !": "تم نسخ الرمز!",
  "Copier le code": "نسخ الرمز",
  "Aucune commande trouvée avec ce code.": "لم يتم العثور على أي طلب بهذا الرمز.",
  Copier: "نسخ",
  "Copié !": "تم النسخ!",
  "Code vendeur généré : {code}": "تم توليد رمز البائع: {code}",
  "Lien du produit": "رابط المنتج",
  "Lien de vente": "رابط البيع",
  "Générez votre code vendeur pour obtenir le lien de vente.":
    "ولّد رمز البائع الخاص بك للحصول على رابط البيع.",
  "La boutique va livrer le produit. Partagez le lien de vente à votre client : il confirmera l'achat avec votre code {code}.":
    "سيقوم المتجر بتوصيل المنتج. شارك رابط البيع مع عميلك: سيؤكد الشراء برمزك {code}.",
  "Prix unitaire : {price} {symbol} — Votre commission : {commission} {symbol} par unité":
    "السعر للوحدة: {price} {symbol} — عمولتك: {commission} {symbol} للوحدة",
  "Vente en attente": "بيع قيد الانتظار",
  Acheté: "تم الشراء",
  "Code vendeur": "رمز البائع",
  "Prix payé": "السعر المدفوع",
  Acheter: "شراء",
  "Achat confirmé !": "تم تأكيد الشراء!",
  "Produit non trouvé": "المنتج غير موجود",
  "Confirmer l'achat": "تأكيد الشراء",
  "Code du vendeur *": "رمز البائع *",
  "Prix d'achat ({symbol}) *": "سعر الشراء ({symbol}) *",
  "Nom de l'acheteur": "اسم المشتري",
  "Vous devez être connecté pour confirmer l'achat.": "يجب تسجيل الدخول لتأكيد الشراء.",
  "La boutique et le vendeur ont été notifiés. Retrouvez cet achat dans votre espace client.":
    "تم إشعار المتجر والبائع. ستجد هذا الشراء في فضاء العميل الخاص بك.",
  "Voir mes achats": "عرض مشترياتي",
  "Continuer mes achats": "متابعة التسوق",
  "Mes achats": "مشترياتي",
  "Aucun achat pour le moment.": "لا توجد مشتريات بعد.",
  "Ce produit vous est proposé par un vendeur Mboppi.": "هذا المنتج مقدَّم من بائع مبوبي.",
  "Code du vendeur : {code} — Confirmez votre achat pour le notifier, lui et la boutique.":
    "رمز البائع: {code} — أكد شراءك لإشعاره وإشعار المتجر.",
  "Confirmez votre achat : la boutique et le vendeur seront notifiés.":
    "أكد شراءك: سيتم إشعار المتجر والبائع.",
  "Ce produit vous est proposé par un vendeur Mboppi. Entrez son code et le prix convenu pour confirmer l'achat.":
    "هذا المنتج مقدَّم من بائع مبوبي. أدخل رمزه والسعر المتفق عليه لتأكيد الشراء.",
  "Vendeur : {seller}": "البائع: {seller}",
  Notifications: "الإشعارات",
  "Tout marquer comme lu": "تحديد الكل كمقروء",
  "Aucune notification": "لا توجد إشعارات",
  "Supprimer la notification": "حذف الإشعار",
  "Installer l'application": "تثبيت التطبيق",
  "Pour installer Mboppi : ouvrez le menu Partager de votre navigateur (Safari) puis choisissez « Sur l'écran d'accueil ».":
    "لتثبيت Mboppi: افتح قائمة المشاركة في متصفحك (Safari) ثم اختر «إضافة إلى الشاشة الرئيسية».",
  "Pour installer Mboppi : ouvrez le menu de votre navigateur (⋮ ou ⋯) puis choisissez « Ajouter à l'écran d'accueil » ou « Installer l'application ».":
    "لتثبيت Mboppi: افتح قائمة متصفحك (⋮ أو ⋯) واختر «إضافة إلى الشاشة الرئيسية» أو «تثبيت التطبيق».",
  "Votre vente de « {product} » a été achetée par {buyer}.":
    "تم شراء بيعك لـ« {product} » من طرف {buyer}.",
  "Votre vente de « {product} » a été confirmée par la boutique pour {buyer}.":
    "تم تأكيد بيعك لـ« {product} » من طرف المتجر لـ{buyer}.",
  "Votre commande « {product} » a été confirmée par la boutique.":
    "تم تأكيد طلبك « {product} » من طرف المتجر.",
  "Votre vente de « {product} » a été annulée par la boutique.":
    "تم إلغاء بيعك لـ« {product} » من طرف المتجر.",
  "Votre commande « {product} » a été annulée par la boutique.":
    "تم إلغاء طلبك « {product} » من طرف المتجر.",
  "Vente de « {product} » annulée — vendeur : {seller} ({code}), acheteur : {buyer}.":
    "تم إلغاء بيع « {product} » — البائع: {seller} ({code})، المشتري: {buyer}.",
  "Votre filleul {buyer} a commandé « {product} » chez {shop} — 2% ({amount} {symbol}) à recevoir après livraison.":
    "طلب ابنك المدعو {buyer} « {product} » من {shop} — 2% ({amount} {symbol}) ستحصل عليها بعد التوصيل.",
  "Le parrain {parrain} réclame 2% ({amount} {symbol}) pour « {product} ».":
    "يطالب الكفيل {parrain} بنسبة 2% ({amount} {symbol}) مقابل « {product} ».",
  "Votre commission de parrainage ({amount} {symbol}) pour « {product} » a été payée par {shop}.":
    "تم دفع عمولة كفالتك ({amount} {symbol}) عن « {product} » من طرف {shop}.",
  "Commande parrainée de {buyer} pour « {product} » — 2% ({amount} {symbol}) à verser au parrain après livraison.":
    "طلب مكفول من {buyer} عن « {product} » — 2% ({amount} {symbol}) تُدفع للكفيل بعد التوصيل.",
  "Parrainage en attente": "الكفالة معلقة",
  "Parrainage payé": "الكفالة مدفوعة",
  "Mes filleuls — commissions de parrainage (2%)": "المكفولون لدي — عمولات الكفالة (2%)",
  "Commissions de parrainage vendeur": "عمولات كفالة البائع",
  "Chaque vendeur ou créateur qui s'inscrit via votre lien et paie son adhésion (1 500 F) vous fait gagner 1 000 F (net 900 F après frais) ; 500 F sont reversés à Mboppi.":
    "كل بائع أو مبدع يسجل عبر رابطك ويدفع اشتراكه (1500 ف) يكسبك 1000 ف (صافي 900 ف بعد الرسوم)؛ ويُحوَّل 500 ف إلى Mboppi.",
  "Actuellement tout le monde a accès gratuitement (même les parrainés) tant que l'administrateur ne ferme pas le compte : la commission de 1 000 F n'est donc versée que lorsqu'un affilié paie réellement son adhésion.":
    "حالياً يحصل الجميع على الدخول مجاناً (حتى المكفولين) ما لم يُغلق المسؤول الحساب: لذلك لا تُدفع عمولة 1000 ف إلا عندما يدفع المكفول اشتراكه فعلياً.",
  "Vendeurs / créateurs parrainés — commission de 1 000 F":
    "البائعون / المبدعون المكفولون — عمولة 1000 ف",
  "Chaque vendeur ou créateur qui s'inscrit via votre lien et paie son adhésion (1 500 F) vous fait gagner 1 000 F. Actuellement tout le monde a accès gratuitement (même les parrainés) tant que l'administrateur ne ferme pas le compte : la commission n'est donc versée que lorsqu'un affilié paie réellement son adhésion.":
    "كل بائع أو مبدع يسجل عبر رابطك ويدفع اشتراكه (1500 ف) يكسبك 1000 ف (صافي 900 ف بعد الرسوم)؛ ويُحوَّل 500 ف إلى Mboppi. حالياً يحصل الجميع على الدخول مجاناً (حتى المكفولين) ما لم يُغلق المسؤول الحساب: لذلك لا تُدفع العمولة إلا عندما يدفع المكفول اشتراكه فعلياً.",
  "Chaque vendeur ou créateur qui s'inscrit via votre lien et paie son adhésion (1 500 F) vous fait gagner 1 000 F":
    "كل بائع أو مبدع يسجل عبر رابطك ويدفع اشتراكه (1500 ف) يكسبك 1000 ف",
  "Chaque vendeur ou créateur qui s'inscrit via votre lien et paie son adhésion (1 500 F) vous fait gagner 1 000 F. La commission est versée manuellement par l'administration.":
    "كل بائع أو مبدع يسجل عبر رابطك ويدفع اشتراكه (1500 ف) يكسبك 1000 ف. تُدفع العمولة يدوياً من طرف الإدارة.",
  "Membre": "عضو",
  "Rôle": "الدور",
  "Adhésion": "الاشتراك",
  "Commission": "العمولة",
  "Statut": "الحالة",
  "Versée": "محولة",
  "En cours": "قيد التنفيذ",
  "En attente d'adhésion": "في انتظار دفع الاشتراك",
  "Non payée": "غير مدفوعة",
  "Adhésion payée": "تم دفع الاشتراك",
  Payé: "مدفوع",
  "Marquer l'adhésion de {name} comme payée et avertir son parrain ?":
    "هل تريد تحديد اشتراك {name} كمدفوع وإشعار الكفيل؟",
  "Montant disponible": "المبلغ المتاح",
  "Demande de retrait": "طلب السحب",
  "Références des parrainés (adhésion confirmée)": "مراجع المكفولين (بعد تأكيد الاشتراك)",
  "Montant à retirer": "المبلغ المراد سحبه",
  "Le montant doit être inférieur ou égal à votre solde disponible (multiple de 1 000 F).":
    "يجب أن يكون المبلغ أصغر أو يساوي رصيدك المتاح (مضاعف 1000 ف).",
  "Aucun moyen de paiement configuré": "لا توجد وسيلة دفع مُعدّة",
  "Moyen de paiement parrain": "وسيلة دفع الكفيل",
  "Commentaire (optionnel)": "تعليق (اختياري)",
  "Un petit commentaire…": "تعليق قصير…",
  "Confirmer le retrait": "تأكيد السحب",
  "Demande reçue": "تم استلام الطلب",
  "Votre demande de retrait de {amount} F a bien été reçue par l'équipe Mboppi. Elle sera traitée dans un délai maximum de 24 h.":
    "تم استلام طلب السحب الخاص بك بمبلغ {amount} ف من طرف فريق Mboppi. سيتم معالجته في غضون 24 ساعة كحد أقصى.",
  "Chaque vendeur ou créateur qui s'inscrit via votre lien et paie son adhésion (1 500 F) vous fait gagner 1 000 F, validé par l'administration. Retrait possible dès 5 000 F.":
    "كل بائع أو مبدع يسجل عبر رابطك ويدفع اشتراكه (1500 ف) يكسبك 1000 ف، بعد تأكيد الإدارة. يمكنك السحب ابتداءً من 5000 ف.",
  "Demandes de retrait (commissions d'activation)": "طلبات السحب (عمولات التفعيل)",
  "Parrainés (adhésion confirmée)": "المكفولون (بعد تأكيد الاشتراك)",
  Commentaire: "تعليق",
  "Aucune demande de retrait": "لا توجد طلبات سحب",
  Payer: "الدفع",
  "Payer la demande de retrait de {amount} F pour {name} ?": "دفع طلب السحب بمبلغ {amount} ف لـ {name}؟",
  "Votre demande de retrait de {amount} F a bien été reçue. Elle sera traitée dans un délai maximum de 24 h.":
    "تم استلام طلب السحب الخاص بك بمبلغ {amount} ف. سيتم معالجته في غضون 24 ساعة كحد أقصى.",
  "Votre demande de retrait de {amount} F a été payée par l'équipe Mboppi.":
    "تم دفع طلب السحب الخاص بك بمبلغ {amount} ف من طرف فريق Mboppi.",
  "Un de vos filleuls a payé son adhésion — votre commission de 1 000 F est en attente de versement.":
    "أحد المكفولين لديك دفع اشتراكه — عمولتك البالغة 1000 ف في انتظار التحويل.",
  "Parrainages (vendeurs / créateurs)": "الإحالات (بائعون / مبدعون)",
  "Rechercher par numéro de référence (parrainé ou parrain)…":
    "ابحث برقم المرجع (المكفول أو الكفيل)…",
  "Parrainé": "المكفول",
  "Référence": "المرجع",
  "Référence parrainé": "مرجع المكفول",
  "Téléphone parrainé": "هاتف المكفول",
  "Son parrain": "الكفيل الخاص به",
  "Référence parrain": "مرجع الكفيل",
  "Téléphone parrain": "هاتف الكفيل",
  "Aucun parrainage": "لا توجد إحالات",
  "Chaque commande passée par un client inscrit avec votre lien vous rapporte 2% du montant, payés par la boutique après livraison.":
    "كل طلب يقدمه عميل سجل عبر رابطك يمنحك 2% من المبلغ، تدفعه البوتيك بعد التوصيل.",
  "Aucune commande de filleul pour le moment.": "لا توجد طلبات للمكفولين حالياً.",
  "En attente de livraison": "في انتظار التوصيل",
  "Réclamer le paiement de votre commission de parrainage pour « {name} » à la boutique ?":
    "هل تطلب دفع عمولة الكفالة الخاصة بك عن « {name} » من البوتيك؟",
  "Payer le parrain": "دفع للكفيل",
  "Parrain payé": "تم دفع الكفيل",
  "Paiement 2% réclamé": "تم طلب دفع 2%",
  "à payer séparément au parrain": "يُدفع للكفيل بشكل منفصل",
  "Moyens de paiement du parrain": "وسائل دفع الكفيل",
  Parrain: "الكفيل",
  "Le vendeur {seller} réclame {amount} {symbol} de commissions chez votre boutique.":
    "يطالب البائع {seller} بمبلغ {amount} {symbol} من العمولات لدى بوتيكك.",
  "Le parrain {parrain} réclame {amount} {symbol} de commissions de parrainage.":
    "يطالب الكفيل {parrain} بمبلغ {amount} {symbol} من عمولات الكفالة.",
  "Vos commissions ({amount} {symbol}) pour vos ventes chez {shop} ont été versées.":
    "تم دفع عمولاتك ({amount} {symbol}) عن مبيعاتك لدى {shop}.",
  "Votre commission de parrainage ({amount} {symbol}) chez {shop} a été versée.":
    "تم دفع عمولة كفالتك ({amount} {symbol}) لدى {shop}.",
  "Commissions de vente — par vendeur": "عمولات البيع — حسب البائع",
  "Parrainage (2%) — par parrain": "الكفالة (2%) — حسب الكفيل",
  "Commissions de vente — par boutique": "عمولات البيع — حسب البوتيك",
  "Parrainage (2%) — par boutique": "الكفالة (2%) — حسب البوتيك",
  "Nombre de ventes": "عدد المبيعات",
  "Réclamer vos commissions ({amount}) chez {shop} ?": "هل تطلب عمولاتك ({amount}) من {shop}؟",
  "Réclamer votre commission de parrainage ({amount}) chez {shop} ?":
    "هل تطلب عمولة كفالتك ({amount}) من {shop}؟",
  "Commission 2% en attente": "عمولة 2% معلقة",
  "Vente de « {product} » confirmée — vendeur : {seller} ({code}), acheteur : {buyer}.":
    "تم تأكيد بيع « {product} » — البائع: {seller} ({code})، المشتري: {buyer}.",
  "le client": "العميل",
  "Profil mis à jour avec succès.": "تم تحديث الملف الشخصي بنجاح.",
  "Mot de passe modifié avec succès.": "تم تغيير كلمة المرور بنجاح.",
  "Modifiez votre mot de passe de connexion.": "غيّر كلمة مرور تسجيل الدخول.",
  "Vous vous êtes inscrit(e) avec Google : définissez un mot de passe pour pouvoir vous connecter sans Google.":
    "سجّلت عبر جوجل: حدد كلمة مرور لتتمكن من تسجيل الدخول بدون جوجل.",
  "Votre mot de passe": "كلمة المرور الخاصة بك",
  "📍 Localisation de la boutique": "📍 موقع المتجر",
  "Connecté en tant que {name} ({role}) — gérez vos informations et votre sécurité.":
    "مسجل الدخول: {name} ({role}) — أدر معلوماتك وأمانك.",
  "La suppression est définitive : votre compte, vos produits, vos ventes et tout votre contenu seront supprimés de nos serveurs.":
    "الحذف نهائي: سيتم حذف حسابك ومنتجاتك ومبيعاتك وكل محتواك من خوادمنا.",
  "Supprimer définitivement votre compte ? Vos produits, ventes et tout votre contenu seront supprimés. Cette action est irréversible.":
    "حذف حسابك نهائياً؟ ستُحذف منتجاتك ومبيعاتك وكل محتواك. هذا الإجراء لا رجعة فيه.",
  "Les offres du moment": "عروض اللحظة",
  "Découvrez les promotions en cours avec les meilleures réductions.":
    "اكتشف الترويجات الحالية مع أفضل التخفيضات.",
  "Produits des boutiques": "منتجات المتاجر",
  "Parcourez les produits disponibles chez les boutiques partenaires.":
    "تصفح المنتجات المتاحة لدى المتاجر الشريكة.",
  "Contactez directement la centrale Mboppi pour commander.": "تواصل مباشرة مع مركز مبوبي للطلب.",
  Rôle: "الدور",
  "Inscrit le": "تاريخ التسجيل",
  "Suivez les promotions en cours et repérez les bonnes affaires.":
    "تابع الترويجات الحالية واكتشف أفضل الصفقات.",
  "Présenter mes créations": "عرض إبداعاتي",
  "Contactez la centrale Mboppi pour exposer vos créations au marché.":
    "تواصل مع مركز مبوبي لعرض إبداعاتك في السوق.",
  "Bonjour, je suis un client de Mboppi ({email}) et j'aimerais passer une commande.":
    "مرحباً، أنا عميل في مبوبي ({email}) وأود تقديم طلب.",
  "Bonjour, je suis un créateur sur Mboppi ({email}) et j'aimerais présenter mes créations.":
    "مرحباً، أنا مبدع في مبوبي ({email}) وأود عرض إبداعاتي.",
  "Le marché du quartier, en un clic": "سوق الحي بنقرة واحدة",
  "Découvrez les offres du moment, commandez les produits des boutiques partenaires, ou devenez vendeur et gagnez une commission sur chaque vente.":
    "اكتشف العروض الحالية، اطلب منتجات المتاجر الشريكة، أو كن بائعاً واربح عمولة على كل عملية بيع.",
  "Produits en boutique": "منتجات المتاجر",
  "Boutiques partenaires": "المتاجر الشريكة",
  "Accéder à mon espace": "الانتقال إلى فضائي",
  "Les boutiques publient": "تنشر المتاجر",
  "Elles mettent en ligne leurs produits et fixent la commission de vente.":
    "تضع منتجاتها على الإنترنت وتحدد عمولة البيع.",
  "Les vendeurs vendent": "يبيع البائعون",
  "Ils enregistrent les ventes et trouvent les clients, au quartier ou en ligne.":
    "يسجلون المبيعات ويجدون العملاء، في الحي أو عبر الإنترنت.",
  "Chacun y gagne": "الجميع يربح",
  "La boutique écoule ses produits, le vendeur encaisse sa commission à chaque vente.":
    "يبيع المتجر منتجاته، ويحصل البائع على عمولته في كل عملية بيع.",
  "🏪 Produits des boutiques": "🏪 منتجات المتاجر",
  "🔍 Rechercher un produit…": "🔍 ابحث عن منتج…",
  "{n} photos — cliquez pour agrandir": "{n} صور — انقر للتكبير",
  "🗑️ Rétirer ce produit": "🗑️ إزالة هذا المنتج",
  "Retirer « {name} » définitivement ?": "إزالة «{name}» نهائياً؟",
  "Disponibilité : {n} en stock": "التوفر: {n} في المخزون",
  Fermer: "إغلاق",
  "Photo précédente": "الصورة السابقة",
  "Photo suivante": "الصورة التالية",
  Photo: "الصورة",
  "← Retour à la vitrine": "← العودة إلى الواجهة",
  "Économisez {n} {symbol} par rapport au prix d'origine": "وفّر {n} {symbol} مقارنة بالسعر الأصلي",
  "⚡ Promotions en cours": "⚡ الترويجات الحالية",
  "🔥 Les offres du moment": "🔥 عروض اللحظة",
  "Les meilleures promotions de Verone et des boutiques partenaires : prix cassés, économies garanties, commande directe par téléphone ou WhatsApp.":
    "أفضل الترويجات من فيرون والمتاجر الشريكة: أسعار مخفضة، توفير مضمون، طلب مباشر بالهاتف أو واتساب.",
  "Offres actives": "العروض النشطة",
  "Économies cumulées": "إجمالي التوفير",
  Catégories: "الفئات",
  "⏰ Les offres se renouvellent dans {time}": "⏰ تتجدد العروض خلال {time}",
  "Offres promotionnelles": "العروض الترويجية",
  "✨ Toutes ({n})": "✨ الكل ({n})",
  "🔥 Meilleures réductions": "🔥 أفضل التخفيضات",
  "💰 Moins cher": "💰 الأرخص",
  "✨ Dernières arrivées": "✨ أحدث العروض",
  "Aucune offre pour le moment. Revenez très vite, ça va chauffer ! 🔥":
    "لا توجد عروض حالياً. عد قريباً، سيكون مفعماً بالحماس! 🔥",
  "Aucune offre ne correspond à votre recherche.": "لا يوجد عرض يطابق بحثك.",
  "Réinitialiser les filtres": "إعادة ضبط الفلاتر",
  "Espace Verone": "فضاء فيرون",
  "Ajoutez vos offres promotionnelles : elles s'affichent dans la Vitrine d'offre du site.":
    "أضف عروضك الترويجية: ستظهر في واجهة عروض الموقع.",
  "Masquer mes Offres": "إخفاء عروضي",
  "Voir mes Offres": "عرض عروضي",
  "Partager ma Vitrine": "مشاركة واجهتي",
  "Mes offres": "عروضي",
  "Aucune offre ajoutée pour le moment.": "لا توجد عروض مضافة حالياً.",
  "Offre retirée de la vitrine.": "تمت إزالة العرض من الواجهة.",
  "Maximum {n} photos par offre": "بحد أقصى {n} صور لكل عرض",
  "Impossible de lire une des photos": "تعذر قراءة إحدى الصور",
  "Les deux prix sont requis": "كلا السعرين مطلوب",
  "Offre ajoutée avec succès — elle s'affiche maintenant sur la page Vitrine d'offre.":
    "تمت إضافة العرض بنجاح — يظهر الآن في صفحة واجهة العروض.",
  "Nouvelle offre": "عرض جديد",
  "Nom de l'Offre *": "اسم العرض *",
  "Garantie (en lettres ou chiffres)": "الضمان (بالكلمات أو الأرقام)",
  "Quantité (en chiffres) *": "الكمية (بالأرقام) *",
  "Ajout en cours…": "جارٍ الإضافة…",
  "Ajouter l'Offre": "إضافة العرض",
  "Retirer l'offre": "إزالة العرض",
  "Confirmez le retrait de « {name} » de la vitrine.": "تأكيد إزالة «{name}» من الواجهة.",
  "Mboppi, le marché de votre quartier, en ligne": "مبوبي، سوق حيّك على الإنترنت",
  "Mboppi est née d'une idée simple : permettre à chacun de vendre et d'acheter près de chez soi, sans prix écrasant et sans dépendre des grands sites. Ici, les boutiques publient leurs produits, les créateurs exposent leurs talents, juste avec un téléphone et une connexion internet, les vendeurs vendent et gagnent des commissions, et les clients trouvent tout au même endroit avec satisfaction, sans se déplacer.":
    "وُلدت مبوبي من فكرة بسيطة: تمكين الجميع من البيع والشراء بالقرب من منازلهم، دون أسعار مرهقة ودون الاعتماد على المنصات الكبرى. هنا، تنشر المتاجر منتجاتها، ويُظهر المبدعون مواهبهم، فقط بهاتف واتصال بالإنترنت، يبيع البائعون ويربحون العمولات، ويجد العملاء كل شيء في مكان واحد برضا، دون تنقل.",
  "Comment ça marche ?": "كيف يعمل؟",
  "Un rôle pour chacun, une plateforme pour tous.": "دور للجميع، ومنصة واحدة للكل.",
  "Publiez vos produits et recevez les commandes.": "انشر منتجاتك واستقبل الطلبات.",
  "Vendez en ligne et gagnez une commission sur chaque vente.":
    "بِع عبر الإنترنت واربح عمولة على كل عملية بيع.",
  "Parcourez les offres du moment et commandez en un clic.":
    "تصفح العروض الحالية واطلب بنقرة واحدة.",
  "Commandez en un clic et recevez chez vous avec un livreur.":
    "اطلب بنقرة واحدة واستلم في منزلك مع موصل.",
  "Produits et créations": "المنتجات والإبداعات",
  "Commander avec son téléphone, sans carte bancaire ni frais cachés.":
    "اطلب بهاتفك، دون بطاقة بنكية أو رسوم خفية.",
  "Exposez vos créations et touchez un public plus large.": "اعرض إبداعاتك ووصل إلى جمهور أوسع.",
  "Ce qui nous pousse chaque jour.": "ما يحفزنا كل يوم.",
  "La confiance": "الثقة",
  "Des commandes simples, des contacts directs avec les vendeurs.":
    "طلبات بسيطة، وتواصل مباشر مع البائعين.",
  "La proximité": "القرب",
  "Commander par WhatsApp, sans carte bancaire ni frais cachés.":
    "اطلب عبر واتساب، دون بطاقة بنكية أو رسوم خفية.",
  "La rapidité": "السرعة",
  "Une plateforme légère, qui s'affiche vite, même en 3G.":
    "منصة خفيفة تظهر بسرعة، حتى على شبكة 3G.",
  "Prêt à rejoindre l'aventure ?": "مستعد للانضمام إلى المغامرة؟",
  "Créez votre compte gratuitement en moins d'une minute.": "أنشئ حسابك مجاناً في أقل من دقيقة.",
  "Créer mon compte": "إنشاء حسابي",
  "💬 Contact": "💬 اتصل بنا",
  "Comment pouvons-nous vous aider ?": "كيف يمكننا مساعدتك؟",
  "Une question, une suggestion, un souci ? Écrivez-nous, nous répondons vite.":
    "سؤال أو اقتراح أو مشكلة؟ اكتب لنا، نرد بسرعة.",
  "Nos coordonnées": "بيانات التواصل",
  "Le moyen le plus rapide de nous joindre.": "أسرع طريقة للتواصل معنا.",
  "Écrire sur WhatsApp": "اكتب عبر واتساب",
  "Appelez-nous aux heures de travail.": "اتصل بنا خلال ساعات العمل.",
  "Pour les demandes écrites détaillées.": "للطلبات المكتوبة المفصلة.",
  "Envoyer un message": "إرسال رسالة",
  "Votre message est transmis directement sur notre WhatsApp.":
    "تُرسل رسالتك مباشرة إلى واتساب الخاص بنا.",
  Sujet: "الموضوع",
  "Choisir un sujet…": "اختر موضوعاً…",
  "Question sur une offre": "سؤال عن عرض",
  "Je veux vendre sur Mboppi": "أريد البيع على مبوبي",
  "Problème de compte": "مشكلة في الحساب",
  Autre: "أخرى",
  "Écrivez votre message ici…": "اكتب رسالتك هنا…",
  "Bonjour Mboppi, je suis {name}.": "مرحباً مبوبي، أنا {name}.",
  "un visiteur": "زائر",
  "📦 Quelles données sont collectées ?": "📦 ما البيانات التي تُجمع؟",
  "Lors de votre inscription : votre nom, votre e-mail et votre rôle (boutique, vendeur, client ou créateur). Si vous vous connectez avec Google, seul votre e-mail Google est utilisé. Selon votre rôle, vous pouvez publier des produits, des offres avec photos, et vos ventes sont enregistrées dans votre espace.":
    "عند تسجيلك: اسمك وبريدك الإلكتروني ودورك (متجر، بائع، عميل أو مبدع). إذا سجلت الدخول عبر جوجل، يُستخدم بريدك الإلكتروني في جوجل فقط. حسب دورك، يمكنك نشر منتجات وعروض مع صور، وتُسجل مبيعاتك في مساحتك.",
  "🔐 Comment sont-elles stockées ?": "🔐 كيف تُخزَّن؟",
  "Toutes les données sont enregistrées dans une base de données PostgreSQL hébergée et sécurisée. Les mots de passe sont hachés (chiffrés de façon irréversible) : personne, même l'équipe Mboppi, ne peut lire votre mot de passe. Toutes les connexions passent par un protocole sécurisé (HTTPS).":
    "تُخزَّن جميع البيانات في قاعدة بيانات PostgreSQL مستضافة وآمنة. كلمات المرور مُشفرة بطريقة لا رجعة فيها: لا يمكن لأحد، حتى فريق مبوبي، قراءة كلمة مرورك. جميع الاتصالات تمر عبر بروتوكول آمن (HTTPS).",
  "⏳ Combien de temps sont-elles conservées ?": "⏳ كم تبقى محفوظة؟",
  "Vos données restent enregistrées aussi longtemps que votre compte existe. Les offres et produits que vous retirez sont supprimés définitivement, avec leurs photos. Aucune donnée n'est vendue ni transmise à des tiers.":
    "تبقى بياناتك محفوظة طالما حسابك موجود. تُحذف العروض والمنتجات التي تزيلها نهائياً مع صورها. لا تُباع أي بيانات ولا تُنقل إلى أطراف ثالثة.",
  "👀 Qui peut les voir ?": "👀 من يمكنه رؤيتها؟",
  "Seule la personne concernée accède à son espace : une boutique voit ses produits, un vendeur ses ventes et commissions. Les offres de la vitrine sont publiquement visibles par les visiteurs, mais sans vos informations de compte.":
    "يصل الشخص المعني فقط إلى مساحته: يرى المتجر منتجاته، ويرى البائع مبيعاته وعمولاته. عروض الواجهة مرئية للزوار، لكن دون معلومات حسابك.",
  "💳 Aucun paiement en ligne": "💳 لا دفع إلكتروني",
  "Mboppi ne demande jamais de numéro de carte bancaire. Les commandes passent par téléphone ou WhatsApp, et le paiement se fait directement avec le vendeur.":
    "لا تطلب مبوبي أبداً رقم بطاقة بنكية. تتم الطلبات عبر الهاتف أو واتساب، ويتم الدفع مباشرة مع البائع.",
  "🗑️ Supprimer vos données": "🗑️ حذف بياناتك",
  "Vous pouvez retirer vos offres et produits à tout moment depuis votre espace.":
    "يمكنك إزالة عروضك ومنتجاتك في أي وقت من مساحتك.",
  "Pour supprimer votre compte, contactez-nous via la page": "لحذف حسابك، تواصل معنا عبر صفحة",
  "et nous le supprimerons rapidement.": "وسنحذفه بسرعة.",
  "Partager ma vitrine": "مشاركة واجهتي",
  "📲 Partager via l'appareil": "📲 مشاركة عبر الجهاز",
  "Ma vitrine Mboppi": "واجهتي على مبوبي",
  "Découvre ma vitrine Mboppi": "اكتشف واجهتي على مبوبي",
  "Copier le lien": "نسخ الرابط",
  "✨ **Une offre pour presque chaque besoin !**\n🔥 Découvrez ma vitrine et explorez une sélection d'offres et de solutions dans plusieurs domaines.\n\nQue tu recherches une opportunité, un service, un produit ou simplement quelque chose d'intéressant à découvrir, **tu pourrais bien trouver ton bonheur.** 👀\n\n👉 **Découvre la vitrine ici :**\n🔗 {url}\n\n🚀 *Un clic, plusieurs possibilités !*":
    "✨ **عرض لكل احتياج تقريباً!**\n🔥 اكتشف واجهتي واستكشف مجموعة مختارة من العروض والحلول في عدة مجالات.\n\nسواء كنت تبحث عن فرصة أو خدمة أو منتج أو شيء مثير للاكتشاف، **قد تجد ضالتك تماماً.** 👀\n\n👉 **اكتشف الواجهة هنا:**\n🔗 {url}\n\n🚀 *نقرة واحدة، إمكانيات لا حصر لها!*",

  // Categories
  "Électronique & Téléphones": "الإلكترونيات والهواتف",
  "Téléphones & Tablettes": "الهواتف والأجهزة اللوحية",
  "Ordinateurs & Accessoires": "الحواسيب وملحقاتها",
  "TV, Audio & Vidéo": "تلفزيون وصوت وفيديو",
  "Consoles & Jeux vidéo": "أجهزة الألعاب وألعاب الفيديو",
  "Mode & Vêtements": "الموضة والملابس",
  Chaussures: "الأحذية",
  "Sacs & Accessoires": "الحقائب والإكسسوارات",
  "Beauté & Cosmétiques": "الجمال ومستحضرات التجميل",
  Parfums: "العطور",
  "Soins capillaires": "العناية بالشعر",
  "Bijoux & Montres": "المجوهرات والساعات",
  "Maison & Déco": "المنزل والديكور",
  Meubles: "الأثاث",
  "Cuisine & Ustensiles": "المطبخ والأواني",
  "Linge de maison": "أغطية المنزل",
  Électroménager: "الأجهزة المنزلية",
  "Alimentation & Épicerie": "المواد الغذائية والبقالة",
  "Produits frais & Marché": "المنتجات الطازجة والسوق",
  Boissons: "المشروبات",
  "Santé & Bien-être": "الصحة والعافية",
  "Sport & Fitness": "الرياضة واللياقة",
  "Jouets & Jeux": "الألعاب",
  "Bébé & Enfants": "الأطفال والرضع",
  "Papeterie & Bureau": "القرطاسية والمكتب",
  "Livres & Formation": "الكتب والتكوين",
  "Arts & Artisanat": "الفنون والحرف اليدوية",
  "Auto & Moto": "السيارات والدراجات النارية",
  "Jardin & Extérieur": "الحديقة والخارج",
  "Animaux & Accessoires": "الحيوانات الأليفة وملحقاتها",
  "Services & Prestations": "الخدمات",
  Immobilier: "العقارات",

  // Cart / Favorites / Orders
  "Mes favoris": "المفضلة",
  "Mon panier": "سلة التسوق",
  "Votre panier est vide.": "سلتك فارغة.",
  "Parcourir les produits": "تصفح المنتجات",
  "Ajouter au panier": "أضف إلى السلة",
  "Ajouté au panier ✓": "أُضيف إلى السلة ✓",
  "Ajouter aux favoris": "أضف إلى المفضلة",
  "Retirer des favoris": "أزل من المفضلة",
  "Articles ({n})": "المنتجات ({n})",
  "Les frais de livraison sont confirmés avec la boutique.": "يُؤكد المتجر رسوم التوصيل.",
  "Connectez-vous pour passer commande.": "سجّل الدخول لتقديم طلبك.",
  "Votre nom *": "اسمك *",
  "Votre téléphone": "هاتفك",
  "Adresse de livraison": "عنوان التوصيل",
  "Quartier, ville…": "الحي، المدينة…",
  "Passer la commande": "تأكيد الطلب",
  "Commande en cours…": "جاري تسجيل الطلب…",
  "Commande enregistrée !": "تم حفظ الطلب!",
  "Commande enregistrée": "تم حفظ الطلب",
  "Merci {name} ! Votre commande #{id} est bien enregistrée.":
    "شكراً {name}! تم حفظ طلبك رقم #{id}.",
  "Confirmez-la maintenant sur WhatsApp pour la finaliser.": "أكّده الآن على واتساب لإتمامه.",
  "Confirmer sur WhatsApp": "التأكيد عبر واتساب",
  "Voir mes commandes": "عرض طلباتي",
  "Aucune commande pour le moment.": "لا توجد طلبات حالياً.",
  "Mes commandes": "طلباتي",
  "📦 Mes commandes": "📦 طلباتي",
  "Commande #{id}": "الطلب #{id}",
  "En attente": "قيد الانتظار",
  Confirmée: "مؤكد",
  Expédiée: "تم الشحن",
  Annulée: "ملغي",
  "Suivre sur WhatsApp": "المتابعة عبر واتساب",
  "Bonjour Mboppi, je souhaite suivre ma commande #{id}.":
    "مرحباً مبوبي، أريد متابعة طلبي رقم #{id}.",
  "Bonjour Mboppi, je souhaite confirmer ma commande #{id} :":
    "مرحباً مبوبي، أريد تأكيد طلبي رقم #{id}:",
  "Total : {total} F": "الإجمالي: {total} F",
  "Nom : {name}": "الاسم: {name}",
  "Téléphone : {phone}": "الهاتف: {phone}",
  "Adresse : {address}": "العنوان: {address}",
  "Toutes les catégories": "جميع الفئات",
  "Plus récents": "الأحدث",
  "🔥 Plus populaires": "🔥 الأكثر رواجاً",
  "Prix croissant": "السعر: من الأقل",
  "Prix décroissant": "السعر: من الأعلى",
  vendus: "مباع",
  "✨ Produits similaires": "✨ منتجات مشابهة",
  Partager: "مشاركة",
  "Lien copié !": "تم نسخ الرابط!",
  "Aucun favori pour le moment.": "لا توجد مفضلة حالياً.",
  "Finalisez vos commandes en quelques clics.": "أكمل طلباتك ببضع نقرات.",
  "Retrouvez les produits que vous avez aimés.": "جد مجدداً المنتجات التي أعجبتك.",
  "En attente de vente": "بانتظار البيع",
  "Générez votre code vendeur pour vendre.": "قم بإنشاء رمز البائع للبيع.",
  "Commandez « {name} » sur Mboppi avec le code vendeur {code}":
    "اطلب « {name} » على مبوبي مع رمز البائع {code}",
  "Découvrez cet article sur Mboppi : {name}": "اكتشف هذا المنتج على مبوبي: {name}",
  Localisation: "الموقع",
  "Mes moyens de paiement": "وسائل الدفع الخاصة بي",
  "Ces informations seront visibles par les boutiques pour vous payer vos commissions.":
    "ستكون هذه المعلومات مرئية للمتاجر لدفع عمولاتك.",
  "Enregistrez vos portefeuilles électroniques pour recevoir vos commissions.":
    "سجل محافظك الإلكترونية لاستلام عمولاتك.",
  "{count} moyen(s) de paiement enregistré(s).": "تم تسجيل {count} وسيلة دفع.",
  "Nom complet (tel qu'il apparaît sur le compte)": "الاسم الكامل (كما يظهر في الحساب)",
  "Portefeuilles électroniques": "المحافظ الإلكترونية",
  "Cochez vos portefeuilles et entrez le numéro associé.": "حدد محافظك وأدخل الرقم المرتبط بها.",
  Numéro: "الرقم",
  "Enregistrer mes moyens de paiement": "حفظ وسائل الدفع الخاصة بي",
  "Ajoutez au moins un portefeuille avec son numéro.": "أضف محفظة واحدة على الأقل مع رقمها.",
  "Moyens de paiement enregistrés !": "تم حفظ وسائل الدفع!",
  "Ces informations seront visibles par vos clients sur le formulaire de commande.":
    "ستكون هذه المعلومات مرئية لعملائك في نموذج الطلب.",
  "Enregistrez vos portefeuilles électroniques pour recevoir les paiements de vos clients.":
    "سجل محافظك الإلكترونية لاستلام مدفوعات عملائك.",
  "En espèces (à la livraison)": "نقدًا (عند التوصيل)",
  "Portefeuille (Mobile Money)": "محفظة (موبايل موني)",
  "Envoyez le paiement à la boutique sur l'un de ces portefeuilles :":
    "أرسل الدفع إلى المتجر على إحدى هذه المحافظ:",
  "Titulaire : {name}": "صاحب الحساب: {name}",
  "Indiquez votre nom et votre numéro lors du transfert pour faciliter la livraison.":
    "اذكر اسمك ورقمك أثناء التحويل لتسهيل التوصيل.",
  "La boutique n'a pas encore configuré ses portefeuilles de paiement. Paiement à la livraison recommandé.":
    "لم يقم المتجر بعد بإعداد محافظ الدفع الخاصة به. يُنصح بالدفع عند التوصيل.",
  "Moyens de paiement": "وسائل الدفع",
  "La boutique n'a pas configuré de portefeuille.": "لم يقم المتجر بإعداد أي محفظة.",
  "Vérone · Assistante Mboppi": "فيرون · مساعدة مبوّي",
  "En ligne": "متصل",
  "Écrivez votre question…": "اكتب سؤالك…",
  "Bonjour 👋 Je suis Vérone, l'assistante Mboppi. Posez-moi vos questions sur la boutique, les commandes, les paiements ou la livraison !":
    "مرحباً 👋 أنا فيرون، مساعدة مبوّي. اسأليني عن المتجر أو الطلبات أو الدفع أو التوصيل!",
  "Une erreur est survenue. Réessayez ou contactez-nous via la page Contact.":
    "حدث خطأ. حاول مجدداً أو تواصل معنا عبر صفحة الاتصال.",
  "Le chatbot n'est pas encore configuré (clé IA manquante côté serveur).":
    "لم يتم إعداد المساعد بعد (مفتاح الذكاء الاصطناعي مفقود على الخادم).",
  Envoyer: "إرسال",
  "Nom et prénom *": "الاسم واللقب *",
  "Ville *": "المدينة *",
  "Adresse / Quartier *": "العنوان / الحي *",
  "Numéro de téléphone *": "رقم الهاتف *",
  "Confirmer la Commande": "تأكيد الطلب",
  Commander: "اطلب",
  "Commande confirmée !": "تم تأكيد الطلب!",
  "Votre article est en attente de vente. La boutique et le vendeur ont été notifiés et vous contacteront pour la livraison. Retrouvez cette commande dans votre espace client.":
    "منتجك بانتظار البيع. تم إشعار المتجر والبائع وسيتواصلان معك للتوصيل. ابحث عن هذا الطلب في مساحتك كعميل.",
  "Vous devez être connecté pour confirmer la commande.": "يجب تسجيل الدخول لتأكيد الطلب.",
  "Confirmez votre commande : la boutique et le vendeur seront notifiés.":
    "أكد طلبك: سيتم إشعار المتجر والبائع.",
  "Ce produit vous est proposé par un vendeur Mboppi. Remplissez vos informations pour confirmer votre commande.":
    "يقدم هذا المنتج بائع مبوبي. املأ معلوماتك لتأكيد طلبك.",
  "Nouvelle commande pour « {product} » — {buyer}.": "طلب جديد لـ « {product} » — {buyer}.",
  "Nouvelle commande pour « {product} » — vendeur : {seller} ({code}).":
    "طلب جديد لـ « {product} » — البائع: {seller} ({code}).",
  "Votre commande « {product} » a été livrée.": "تم توصيل طلبك « {product} ».",
  "Votre commande « {product} » a été annulée comme demandé.":
    "تم إلغاء طلبك « {product} » كما طلبت.",
  "Votre vente de « {product} » a été annulée par le client.":
    "تم إلغاء بيعك لـ « {product} » من طرف العميل.",
  "Commande « {product} » de {buyer} annulée par le client.":
    "طلب « {product} » الخاص بـ {buyer} أُلغي من طرف العميل.",
  "Nouvelle commande pour « {product} » — {buyer}. Article en attente de vente.":
    "طلب جديد لـ « {product} » — {buyer}. المنتج بانتظار البيع.",
  "Nouvelle commande pour « {product} » — vendeur : {seller} ({code}). Article en attente de vente.":
    "طلب جديد لـ « {product} » — البائع: {seller} ({code}). المنتج بانتظار البيع.",
  "Votre vente de « {product} » a été livrée à {buyer}.":
    "تم توصيل بيعك لـ « {product} » إلى {buyer}.",
  "Vente de « {product} » livrée — vendeur : {seller} ({code}), acheteur : {buyer}.":
    "تم توصيل بيع « {product} » — البائع: {seller} ({code})، المشتري: {buyer}.",
  Livreur: "سائق توصيل",
  livreur: "سائق توصيل",
  "Mes livraisons": "توصيلاتي",
  Livraison: "التوصيل",
  "Je livre les articles commandés et je confirme l'achat":
    "أقوم بتوصيل المنتجات المطلوبة وأؤكد عملية الشراء",
  "Livrez les articles en attente de vente et confirmez l'achat auprès du client.":
    "قم بتوصيل المنتجات بانتظار البيع وتأكيد الشراء مع العميل.",
  "Articles en attente de vente": "منتجات بانتظار البيع",
  "Aucun article en attente pour le moment.": "لا توجد منتجات بانتظار البيع حالياً.",
  "Vendeur : {seller}": "البائع: {seller}",
  Livrer: "وصّل",
  Livré: "تم التوصيل",
  "Livré le {date}": "تم التوصيل في {date}",
  "Mes livraisons effectuées": "توصيلاتي المنجزة",
  "Aucune livraison effectuée pour le moment.": "لا توجد توصيلات منجزة حالياً.",
  "Voir la facture": "عرض الفاتورة",
  Facture: "فاتورة",
  "Facture livrée": "الفاتورة المسلمة",
  "Aucune vente livrée pour le moment.": "لا توجد مبيعات تم توصيلها حالياً.",
  Propriétaire: "المالك",
  "Montant article": "مبلغ المنتج",
  "Frais de livraison ({symbol}) *": "رسوم التوصيل ({symbol}) *",
  "Paiement *": "الدفع *",
  "En Espèce": "نقداً",
  "Par Mobile": "عبر الهاتف المحمول",
  "En ligne (auto)": "عبر الإنترنت (تلقائي)",
  "Le client recevra une demande de paiement mobile money sur son téléphone. Confirmez l'opérateur et son numéro.":
    "سيستلم العميل طلب دفع عبر الهاتف المحمول على هاتفه. أكد المشغل ورقمه.",
  Opérateur: "المشغل",
  "Numéro du client": "رقم العميل",
  "Demande de paiement envoyée !": "تم إرسال طلب الدفع!",
  "Ouvrir le lien de paiement": "فتح رابط الدفع",
  "Envoyer la demande de paiement": "إرسال طلب الدفع",
  "Confirmer l'Achat": "تأكيد الشراء",
  "Achat confirmé ! La facture a été téléchargée.": "تم تأكيد الشراء! تم تنزيل الفاتورة.",
  "Facture N°": "فاتورة رقم",
  "Date de livraison": "تاريخ التوصيل",
  Nom: "الاسم",
  "Code vendeur": "رمز البائع",
  "Prix unitaire": "سعر الوحدة",
  "Total à payer": "الإجمالي للدفع",
  "Facture générée par Mboppi — marchandise livrée.": "فاتورة من إنشاء مبوبي — تم تسليم البضاعة.",
  "Facture générée par Mboppi.": "فاتورة من إنشاء مبوبي.",
  "Payer le Vendeur": "ادفع للبائع",
  "Payer le vendeur": "ادفع للبائع",
  "Vendeur payé": "تم دفع البائع",
  "Commission en attente": "عمولة قيد الانتظار",
  "Commission non payée": "عمولة غير مدفوعة",
  "Cette vente ne peut pas être supprimée tant que sa commission n'est pas payée.":
    "لا يمكن إزالة هذا البيع طالما لم تُدفع عمولته بعد.",
  "Cette vente ne peut pas être retirée tant que sa commission n'est pas payée.":
    "لا يمكن إزالة هذا البيع طالما لم تُدفع عمولته بعد.",
  "Vente supprimée.": "تم حذف البيع.",
  "Commission supprimée.": "تم حذف العمولة.",
  "Supprimer cette commission de parrainage « {name} » ?":
    "حذف هذه العمولة الخاصة بالإحالة « {name} »؟",
  "Vous pouvez retirer une vente livrée (ou une commission de parrainage) uniquement une fois sa commission payée.":
    "يمكنك إزالة البيع الذي تم تسليمه (أو عمولة الإحالة) فقط بعد دفع عمولته.",
  "Commission payée": "عمولة مدفوعة",
  "Commissions à verser": "عمولات للدفع",
  "Commission à verser": "عمولة للدفع",
  "Commissions versées": "عمولات مدفوعة",
  Livraisons: "التوصيلات",
  "Commissions pour les vendeurs": "عمولات للبائعين",
  "Moyens de paiement du vendeur": "وسائل دفع البائع",
  "Le vendeur n'a pas encore enregistré de moyen de paiement.": "لم يسجل البائع وسيلة دفع بعد.",
  "Preuve du paiement (photo ou vidéo) *": "إثبات الدفع (صورة أو فيديو) *",
  "Preuve ajoutée ✓ (cliquez pour changer)": "تمت إضافة الإثبات ✓ (اضغط للتغيير)",
  Preuve: "إثبات",
  "Confirmer le Paiement": "تأكيد الدفع",
  "Vendeur payé ! La preuve a été enregistrée.": "تم دفع البائع! تم حفظ الإثبات.",
  "Vidéo trop lourde : limite 10 Mo.": "الفيديو ثقيل جداً: الحد 10 ميغا.",
  Article: "المنتج",
  "Votre commission pour « {product} » a été payée par {shop}.":
    "تم دفع عمولتك عن « {product} » من طرف {shop}.",
  "Publiez vos créations : elles rejoignent la catégorie Arts & Artisanat du marché.":
    "انشر إبداعاتك: تنضم إلى فئة الفنون والحرف اليدوية في السوق.",
  "+ Publier une création": "+ نشر إبداع",
  "Nouvelle création": "إبداع جديد",
  "Modifier la création": "تعديل الإبداع",
  "Nom de la création *": "اسم الإبداع *",
  "Commission pour les vendeurs (%) *": "عمولة البائعين (%) *",
  "Création mise à jour !": "تم تحديث الإبداع!",
  "Création publiée avec succès.": "تم نشر الإبداع بنجاح.",
  "Retirer cette création ?": "إزالة هذا الإبداع؟",
  "Mes créations": "إبداعاتي",
  "Aucune création publiée pour le moment. Publiez votre première création !":
    "لا يوجد إبداع منشور حالياً. انشر إبداعك الأول!",
  "Statistiques de mes créations": "إحصائيات إبداعاتي",
  // Missing keys (polish pass)
  Ville: "المدينة",
  "Ville…": "المدينة…",
  "📍 Ville de la boutique": "📍 مدينة المتجر",
  Adresse: "العنوان",
  "Frais de livraison": "رسوم التوصيل",
  Paiement: "الدفع",
  "Mboppi est née d'une idée simple : permettre à chacun de vendre et d'acheter près de chez soi, sans commission écrasante et sans dépendre des grands sites. Ici, les boutiques publient leurs produits, les vendeurs gagnent des commissions, les créateurs exposent leurs talents et les clients trouvent tout au même endroit.":
    "وُلدت Mboppi من فكرة بسيطة: تمكين الجميع من البيع والشراء قرب منازلهم، دون عمولات مرتفعة ودون الاعتماد على المواقع الكبرى. هنا، تعرض المتاجر منتجاتها، ويكسب الباعة عمولات، ويقدّم المبدعون مواهبهم، ويجد العملاء كل شيء في مكان واحد.",
  "Publiez vos produits et recevez les commandes de vos clients.":
    "انشروا منتجاتكم واستقبلوا طلبات عملائكم.",
  Créateur: "مبدع",
  "🛒 Mon panier": "🛒 سلة التسوق",
  "Découvrir les produits": "اكتشف المنتجات",
  Message: "الرسالة",
  "Publiez et gérez vos créations.": "انشروا إبداعاتكم وأديروها.",
  "Prix normal (barré, optionnel)": "السعر العادي (مشطوب، اختياري)",
  Publier: "نشر",
  "Aucune vente enregistrée pour le moment.": "لا توجد أي عملية بيع مسجلة حالياً.",
  "Livrez les articles commandés et confirmez l'achat.": "سلّموا المقالات المطلوبة وأكّدوا الشراء.",
  "Livrer : {name}": "تسليم: {name}",
  "Découvrez « {name} » à {price} {symbol} sur Mboppi.":
    "اكتشف « {name} » بسعر {price} {symbol} على Mboppi.",
  "Comment vos données sont conservées": "كيف تُحفظ بياناتكم",
  "La transparence est importante pour nous. Voici comment Mboppi collecte, stocke et protège vos données.":
    "الشفافية مهمة بالنسبة لنا. إليكم كيف تجمع Mboppi بياناتكم وتخزنها وتحميها.",
  "Découvrez « {name} » à {price} {symbol} chez {shop} sur Mboppi.":
    "اكتشف « {name} » بسعر {price} {symbol} لدى {shop} على Mboppi.",
  "Confirmez votre commande avec le code du vendeur.": "أكّدوا طلبكم باستخدام رمز البائع.",
  "Prix invalide": "سعر غير صالح",
  "Livré le": "تم التسليم في",
  "ex : 5000 (s'affiche barré)": "مثال: 5000 (يظهر مشطوباً)",
  "ex : 3500 (s'affiche en vert)": "مثال: 3500 (يظهر بالأخضر)",
  "📷 Ajouter une photo ou une vidéo": "📷 إضافة صورة أو فيديو",
  "🔍 Rechercher une offre…": "🔍 البحث عن عرض…",
  Installer: "تثبيت",
  "Installer l'application": "تثبيت التطبيق",
  "Sur iPhone ou iPad : touchez Partager puis « Ajouter à l'écran d'accueil ».":
    "على iPhone أو iPad: اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية».",
  "Avis clients": "آراء العملاء",
  "{n} avis": "{n} تقييماً",
  "Laisser un avis": "اترك تقييمك",
  "Choisissez une note de 1 à 5 étoiles.": "اختر تقييماً من 1 إلى 5 نجوم.",
  "Votre note": "تقييمك",
  "Votre commentaire (facultatif)": "تعليقك (اختياري)",
  "Partagez votre expérience avec ce produit…": "شارك تجربتك مع هذا المنتج…",
  "Publier mon avis": "نشر تقييمي",
  "Envoi…": "جارٍ الإرسال…",
  "Merci pour votre avis !": "شكراً لتقييمك!",
  "Connectez-vous": "سجّل الدخول",
  "pour laisser un avis.": "لترك تقييم.",
  "Aucun avis pour le moment. Soyez le premier !": "لا توجد تقييمات بعد. كن أول من يقيّم!",
  Client: "عميل",
  Vérifiée: "موثّقة",
  "Boutique vérifiée": "متجر موثّق",
  "Contacter sur WhatsApp": "تواصل عبر واتساب",
  "Produits de la boutique": "منتجات المتجر",
  "Suivi de commande": "تتبع الطلب",
  "Entrez votre code client (reçu avec votre commande) pour suivre son état.":
    "أدخل رمز العميل الخاص بك (الذي استلمته مع طلبك) لتتبع حالته.",
  "Code client, ex : AB12CD3": "رمز العميل، مثال: AB12CD3",
  "Suivre ma commande": "تتبع طلبي",
  "Lien de suivi": "رابط التتبع",
  "Commande enregistrée": "تم تسجيل الطلب",
  "Commande confirmée": "تم تأكيد الطلب",
  "Commande livrée": "تم تسليم الطلب",
  "Cette commande a été annulée.": "تم إلغاء هذا الطلب.",
  "Annuler la commande": "إلغاء الطلب",
  "Annuler cette commande ? Cette action est définitive.": "إلغاء هذا الطلب؟ هذا الإجراء نهائي.",
  "Annuler cette commande « {name} » ? Cette action est définitive.":
    "إلغاء هذا الطلب « {name} »؟ هذا الإجراء نهائي.",
  "Contacter le vendeur": "تواصل مع البائع",
  "Partager le suivi": "مشاركة التتبع",
  "Votre code client : {code}": "رمز العميل الخاص بك: {code}",
  "Votre code client": "رمز العميل الخاص بك",
  "Bonjour {seller}, je suis {buyer}, je vous contacte à propos de ma commande « {product} » sur Mboppi.":
    "مرحباً {seller}، أنا {buyer}، أتواصل معك بخصوص طلبي « {product} » على Mboppi.",
  "Bonjour {shop}, je vous contacte depuis Mboppi.": "مرحباً {shop}، أتواصل معك من Mboppi.",
  "Suivez ma commande « {product} » sur Mboppi : {url}":
    "تابع طلبي « {product} » على Mboppi: {url}",
  "La page que vous cherchez n'existe pas ou a été déplacée.":
    "الصفحة التي تبحث عنها غير موجودة أو تم نقلها.",
  Suggestions: "اقتراحات",
  Administration: "الإدارة",
  "Vue globale de la plateforme.": "نظرة شاملة على المنصة.",
  Utilisateurs: "المستخدمون",
  Boutiques: "المتاجر",
  Créateurs: "المبدعون",
  Vendeurs: "البائعون",
  Clients: "العملاء",
  Livreurs: "المُوصّلون",
  Ventes: "المبيعات",
  "En attente": "قيد الانتظار",
  "en attente": "قيد الانتظار",
  Livrées: "تم تسليمها",
  "Vente directe": "بيع مباشر",
  "Sans commission": "بدون عمولة",
  Nombre: "العدد",
  Code: "الرمز",
  Payées: "مدفوعة",
  "Par boutique": "حسب المتجر",
  "Par vendeur": "حسب البائع",
  "Par statut": "حسب الحالة",
  "Aucune transaction": "لا توجد معاملات",
  "Dernières transactions": "أحدث المعاملات",
  "Transactions avec vendeur": "مبيعات مع البائع",
  "Commandes directes (panier)": "طلبات مباشرة (السلة)",
  "Montant commandes directes": "مبلغ الطلبات المباشرة",
  "💸 Toutes les transactions": "💸 جميع المعاملات",
  "Activité regroupée de tous les utilisateurs (boutiques, vendeurs, clients, livreurs, créateurs).":
    "النشاط المجمّع لجميع المستخدمين (متاجر، بائعين، عملاء، موصّلين، مبدعين).",
  "Livraison supprimée de votre espace.": "تمت إزالة التسليم من مساحتك.",
  "Inscrits aujourd'hui": "المسجلون اليوم",
  "Rechercher un utilisateur (nom ou email)…": "ابحث عن مستخدم (الاسم أو البريد)…",
  "Message de l'équipe Mboppi": "رسالة من فريق Mboppi",
  Suggestion: "اقتراح",
  "Faire une suggestion": "قدّم اقتراحاً",
  "Aidez-nous à améliorer Mboppi : votre message s'ouvrira dans WhatsApp.":
    "ساعدنا في تحسين Mboppi: ستُفتح رسالتك في WhatsApp.",
  "Votre suggestion…": "اقتراحك…",
  "Envoyer sur WhatsApp": "إرسال عبر WhatsApp",
  "Messages aux utilisateurs": "رسائل إلى المستخدمين",
  "Envoyez un message qui s'affichera en popup à la prochaine connexion des utilisateurs (une seule fois).":
    "أرسل رسالة ستظهر كنافذة منبثقة عند تسجيل المستخدمين دخولهم التالي (مرة واحدة فقط).",
  "À tous les utilisateurs": "إلى جميع المستخدمين",
  "À un utilisateur": "إلى مستخدم واحد",
  "Choisir un utilisateur…": "اختر مستخدماً…",
  "Message envoyé avec succès.": "تم إرسال الرسالة بنجاح.",
  "Messages envoyés": "الرسائل المرسلة",
  Destinataires: "المستلمون",
  "Aucun message envoyé": "لا توجد رسائل مرسلة",
  "Tous les utilisateurs": "جميع المستخدمين",
  Compris: "فهمت",
  Newsletter: "النشرة الإخبارية",
  "Abonnés newsletter": "مشتركو النشرة",
  "Envoyez une newsletter par email à tous les abonnés. Chaque abonné reçoit le lien de désabonnement automatiquement.":
    "أرسل نشرة إخبارية بالبريد الإلكتروني إلى جميع المشتركين. يحصل كل مشترك تلقائيًا على رابط إلغاء الاشتراك.",
  "Sujet de la newsletter": "موضوع النشرة",
  "Contenu de la newsletter…": "محتوى النشرة…",
  "Envoyer la newsletter": "إرسال النشرة",
  "Aucun abonné pour le moment.": "لا يوجد مشتركون حاليًا.",
  "Envoyer à {count} abonnés": "إرسال إلى {count} مشترك",
  "Newsletter envoyée à {sent} abonnés.": "تم إرسال النشرة إلى {sent} مشترك.",
  "Newsletter envoyée à {sent} abonnés ({failed} échecs).":
    "تم إرسال النشرة إلى {sent} مشترك ({failed} فشل).",
  Rôle: "الدور",
  Pays: "البلد",
  Inscription: "التسجيل",
  Vérifier: "توثيق",
  "Aucun utilisateur": "لا يوجد مستخدمون",
  "Aucun produit": "لا توجد منتجات",
  admin: "مدير",
  "Exporter CSV": "تصدير CSV",
  "Export…": "جارٍ التصدير…",
  Ville: "المدينة",
  Quantité: "الكمية",
  Total: "الإجمالي",
  Commission: "العمولة",
  "Prix payé": "السعر المدفوع",
  Livraison: "التوصيل",
  Statut: "الحالة",
  CGV: "الشروط",
  CGU: "شروط الاستخدام",
  "Mentions légales": "إشعار قانوني",
  "Conditions générales d'utilisation": "شروط الاستخدام",
  "Les règles pour utiliser Mboppi en tant que boutique, vendeur, client ou créateur.":
    "القواعد لاستخدام Mboppi كمتجر أو بائع أو عميل أو مبدع.",
  "J'ai lu et j'accepte les": "قرأت وأوافق على",
  "Vous devez accepter les Conditions Générales d'Utilisation pour vous inscrire.":
    "يجب عليك الموافقة على شروط الاستخدام للتسجيل.",
  "Mot de passe (8 caractères minimum)": "كلمة المرور (8 أحرف على الأقل)",
  "1. Objet et acceptation": "1. الغرض والقبول",
  "Les présentes Conditions générales d'utilisation (CGU) régissent votre accès et votre utilisation de la plateforme Mboppi. En créant votre compte, vous acceptez pleinement et sans réserve ces conditions.":
    "تنظم شروط الاستخدام هذه وصولك واستخدامك لمنصة Mboppi. بإنشاء حسابك، فإنك تقبل هذه الشروط كلياً ودون قيد أو شرط.",
  "2. Création d'un compte": "2. إنشاء الحساب",
  "Vous vous engagez à fournir des informations exactes et à jour lors de votre inscription. Vous êtes responsable de la confidentialité de votre mot de passe et de toutes les actions réalisées avec votre compte.":
    "تتعهد بتقديم معلومات دقيقة ومحدثة عند التسجيل. أنت مسؤول عن سرية كلمة مرورك وعن جميع الإجراءات التي تتم من حسابك.",
  "3. Les rôles sur Mboppi": "3. الأدوار على Mboppi",
  "Mboppi met en relation des boutiques, des vendeurs, des clients et des créateurs. Chaque compte est associé à un rôle qui détermine les fonctionnalités disponibles : publier des produits, vendre, commander ou créer.":
    "تربط Mboppi المتاجر والبائعين والعملاء والمبدعين. يرتبط كل حساب بدور يحدد الميزات المتاحة: نشر المنتجات أو البيع أو الطلب أو الإبداع.",
  "4. Commandes et paiement": "4. الطلبات والدفع",
  "Les commandes sont passées directement avec la boutique ou le vendeur. Aucun paiement n'est effectué en ligne sur Mboppi : le paiement se fait directement avec le vendeur ou le livreur, à la livraison ou par mobile money.":
    "تُقدّم الطلبات مباشرة مع المتجر أو البائع. لا يتم أي دفع عبر الإنترنت على Mboppi: يتم الدفع مباشرة مع البائع أو الموصّل، عند التسليم أو عبر المال المحمول.",
  "5. Commissions et parrainage": "5. العمولات والإحالة",
  "Les boutiques rémunèrent les vendeurs et les parrains par des commissions enregistrées sur la plateforme. Les montants et les modalités de réclamation et de paiement sont affichés dans les espaces vendeur, boutique et client.":
    "تكافئ المتاجر البائعين والكفلاء بعمولات مسجلة على المنصة. تظهر المبالغ وشروط المطالبة والدفع في مساحات البائع والمتجر والعميل.",
  "6. Contenu publié": "6. المحتوى المنشور",
  "Les boutiques, vendeurs et créateurs publient leurs propres produits, offres et créations. Ils sont seuls responsables de l'exactitude et de la légalité de leur contenu. Mboppi peut retirer tout contenu illicite ou inapproprié.":
    "تنشر المتاجر والبائعون والمبدعون منتجاتهم وعروضهم وإبداعاتهم بأنفسهم. هم وحدهم المسؤولون عن دقة وشرعية محتواهم. يمكن لـ Mboppi إزالة أي محتوى غير قانوني أو غير مناسب.",
  "7. Livraison": "7. التوصيل",
  "La livraison est assurée par les boutiques ou des livreurs partenaires. Les délais et les frais sont indiqués sur chaque produit et convenus avec le vendeur ou la boutique lors de la commande.":
    "يتولى التوصيل المتاجر أو الموصّلون الشركاء. تُذكر المواعيد والرسوم على كل منتج وتُتفق مع البائع أو المتجر عند الطلب.",
  "8. Comportement interdit": "8. السلوك الممنوع",
  "Il est interdit d'utiliser la plateforme de manière frauduleuse : créer de fausses commandes, usurper une identité, publier des informations fausses ou trompeuses, ou tenter de contourner les règles de la plateforme.":
    "يُمنع استخدام المنصة بطريقة احتيالية: إنشاء طلبات وهمية، انتحال هوية، نشر معلومات كاذبة أو مضللة، أو محاولة التحايل على قواعد المنصة.",
  "9. Suspension et résiliation": "9. التعليق والإلغاء",
  "Mboppi peut suspendre ou supprimer un compte en cas de non-respect des présentes conditions. Vous pouvez supprimer votre compte à tout moment depuis votre espace « Mon compte ».":
    "يمكن لـ Mboppi تعليق أو حذف حساب إذا لم يُحترم هذه الشروط. يمكنك حذف حسابك في أي وقت من مساحة «حسابي».",
  "10. Données personnelles": "10. البيانات الشخصية",
  "Vos données personnelles sont traitées conformément à notre politique de confidentialité, consultable sur la page Données personnelles.":
    "تُعالج بياناتك الشخصية وفق سياسة الخصوصية الخاصة بنا، المتاحة في صفحة البيانات الشخصية.",
  "11. Acceptation des conditions": "11. قبول الشروط",
  "En cochant la case lors de votre inscription, vous confirmez avoir lu et accepté ces Conditions générales d'utilisation. Pour toute question, contactez-nous via la page Contact.":
    "بالتأشير عند تسجيلك، تؤكد أنك قرأت وقبلت شروط الاستخدام هذه. لأي سؤال، تواصل معنا عبر صفحة الاتصال.",
  "Conditions générales de vente": "الشروط العامة للبيع",
  "Les règles qui régissent les ventes sur Mboppi.": "القواعد التي تحكم المبيعات على Mboppi.",
  "Conditions générales": "الشروط العامة",
  "1. Rôle de la plateforme": "1. دور المنصة",
  "Mboppi met en relation des boutiques, des créateurs, des vendeurs et des clients. Les ventes sont conclues directement entre l'acheteur et le vendeur ou la boutique. Mboppi ne perçoit aucun paiement en ligne.":
    "Mboppi تربط المتاجر والمبدعين والبائعين والعملاء. تُبرم المبيعات مباشرة بين المشتري والبائع أو المتجر. لا تحصّل Mboppi أي دفعات عبر الإنترنت.",
  "2. Commandes": "2. الطلبات",
  "Une commande est enregistrée avec le nom et le code de l'acheteur. L'état de la commande (en attente, confirmée, livrée) peut être suivi sur la page de suivi. Une commande annulée ne donne lieu à aucun paiement.":
    "يُسجل الطلب باسم المشتري ورمزه. يمكن تتبع حالة الطلب (قيد الانتظار، مؤكد، تم تسليمه) في صفحة التتبع. لا يترتب على الطلب الملغى أي دفع.",
  "3. Paiement et livraison": "3. الدفع والتوصيل",
  "Le paiement s'effectue directement avec le vendeur ou le livreur, à la livraison ou par mobile money. Les frais de livraison sont indiqués sur chaque produit. Mboppi ne stocke aucun moyen de paiement.":
    "يتم الدفع مباشرة مع البائع أو الموصّل، عند التسليم أو عبر المال المحمول. تُعرض رسوم التوصيل على كل منتج. لا تخزن Mboppi أي وسيلة دفع.",
  "4. Garanties et retours": "4. الضمانات والإرجاعات",
  "Les garanties éventuelles sont indiquées sur chaque produit. Les retours se traitent directement avec la boutique ou le vendeur. En cas de litige, Mboppi peut servir d'intermédiaire de médiation.":
    "تُذكر أي ضمانات على كل منتج. تُعالج الإرجاعات مباشرة مع المتجر أو البائع. في حال حدوث نزاع، يمكن لـ Mboppi التوسط.",
  "5. Responsabilité": "5. المسؤولية",
  "Mboppi ne peut être tenu responsable des produits vendus par les boutiques et vendeurs, ni des retards de livraison imputables aux livreurs. Les informations publiées le sont par les vendeurs eux-mêmes.":
    "لا يمكن تحميل Mboppi مسؤولية المنتجات المباعة من المتاجر والبائعين، ولا تأخيرات التسليم الناتجة عن الموصّلين. المعلومات المنشورة مقدمة من البائعين أنفسهم.",
  "6. Contact": "6. التواصل",
  "Pour toute question sur ces conditions, contactez-nous via la page Contact.":
    "لأي سؤال حول هذه الشروط، تواصل معنا عبر صفحة الاتصال.",
  FAQ: "الأسئلة الشائعة",
  "Questions fréquentes": "الأسئلة المتكررة",
  "Tout ce que vous devez savoir sur Mboppi.": "كل ما تحتاج معرفته عن Mboppi.",
  "Comment créer un compte ?": "كيف أنشئ حساباً؟",
  "Créez un compte gratuitement en moins d'une minute : choisissez votre rôle (boutique, vendeur, client ou créateur), renseignez votre nom et votre e-mail. Vous pouvez aussi vous connecter avec Google.":
    "أنشئ حساباً مجانياً في أقل من دقيقة: اختر دورك (متجر، بائع، عميل أو مبدع)، أدخل اسمك وبريدك. يمكنك أيضاً الدخول عبر Google.",
  "Comment commander ?": "كيف أطلب؟",
  "Ajoutez un produit à votre panier puis validez la commande avec vos coordonnées. Vous recevez un code client pour suivre votre commande sur la page de suivi. Vous pouvez aussi contacter directement la boutique sur WhatsApp.":
    "أضف منتجاً إلى سلتك ثم أكّد الطلب ببياناتك. تستلم رمز عميل لتتبع طلبك في صفحة التتبع. يمكنك أيضاً التواصل مباشرة مع المتجر عبر واتساب.",
  "Comment payer ?": "كيف أدفع؟",
  "Aucune carte bancaire n'est nécessaire. Le paiement se fait directement avec le vendeur ou le livreur, à la livraison ou par mobile money. Mboppi ne demande jamais de paiement en ligne.":
    "لا حاجة لأي بطاقة مصرفية. يتم الدفع مباشرة مع البائع أو الموصّل، عند التسليم أو عبر المال المحمول. لا تطلب Mboppi أي دفع عبر الإنترنت.",
  "Comment devenir vendeur ?": "كيف أصبح بائعاً؟",
  "Créez un compte avec le rôle « vendeur ». Vous recevrez un code vendeur à partager avec vos clients. Pour chaque vente, vous gagnez la commission affichée sur le produit.":
    "أنشئ حساباً بدور «بائع». ستستلم رمز بائع لمشاركته مع عملائك. عن كل عملية بيع تربح العمولة المعروضة على المنتج.",
  "Comment est calculée ma commission ?": "كيف تُحسب عمولتي؟",
  "La boutique choisit un pourcentage de commission pour chaque produit. Ce pourcentage est affiché sur la fiche produit. Le vendeur reçoit le montant total moins la commission de la boutique.":
    "يختار المتجر نسبة عمولة لكل منتج. تُعرض هذه النسبة على صفحة المنتج. يتسلم البائع المبلغ الإجمالي ناقص عمولة المتجر.",
  "Comment suivre ma commande ?": "كيف أتتبع طلبي؟",
  "Utilisez la page « Suivi de commande » avec votre numéro de commande et votre code client. Vous y voyez l'état en temps réel : enregistrée, confirmée ou livrée.":
    "استخدم صفحة «تتبع الطلب» مع رقم طلبك ورمز عميلك. ترى الحالة لحظياً: مسجل، مؤكد أو تم تسليمه.",
  "Comment contacter le support ?": "كيف أتواصل مع الدعم؟",
  "Utilisez la page Contact ou écrivez-nous sur WhatsApp. Nous répondons généralement en moins de 24 heures.":
    "استخدم صفحة الاتصال أو اكتب لنا عبر واتساب. نجيب عادة خلال أقل من 24 ساعة.",
  "Puis-je supprimer mon compte ?": "هل يمكنني حذف حسابي؟",
  "Oui, depuis votre espace « Mon compte ». Vos données sont alors supprimées définitivement de notre base.":
    "نعم، من مساحة «حسابي». تُحذف بياناتك نهائياً من قاعدة بياناتنا.",
  "Éditeur du site": "ناشر الموقع",
  "Le site Mboppi est édité par l'équipe Mboppi. Pour toute question, utilisez la page Contact.":
    "موقع Mboppi منشور من فريق Mboppi. لأي سؤال، استخدم صفحة الاتصال.",
  Hébergement: "الاستضافة",
  "Le site est hébergé par Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis. Les données sont stockées dans une base PostgreSQL hébergée par Neon.":
    "الموقع مستضاف لدى Vercel Inc. البيانات مخزنة في قاعدة PostgreSQL مستضافة لدى Neon.",
  "Propriété intellectuelle": "الملكية الفكرية",
  "Les contenus publiés par les boutiques et vendeurs (produits, photos, descriptions) leur appartiennent. La marque et le nom Mboppi appartiennent à leurs propriétaires.":
    "المحتويات المنشورة من المتاجر والبائعين (منتجات، صور، أوصاف) ملك لهم. العلامة والاسم Mboppi ملك لأصحابهما.",
  "Mboppi utilise des cookies pour améliorer votre expérience (thème, langue, panier). Nous ne vendons aucune donnée.":
    "تستخدم Mboppi ملفات تعريف الارتباط لتحسين تجربتك (المظهر، اللغة، السلة). لا نبيع أي بيانات.",
  Accepter: "قبول",
  "En savoir plus": "معرفة المزيد",
  Cookies: "ملفات تعريف الارتباط",
  "Prix min": "الحد الأدنى للسعر",
  "Prix max": "الحد الأقصى للسعر",
  "Prix minimum": "الحد الأدنى للسعر",
  "Prix maximum": "الحد الأقصى للسعر",
  "⭐ Mieux notés": "⭐ الأعلى تقييماً",
  "{n} vendus": "{n} مباع",
  "{n} en attente": "{n} قيد الانتظار",
  "Votre code de confirmation": "رمز التأكيد الخاص بك",
  "Entrez votre code de confirmation (reçu avec votre commande) pour suivre son état.":
    "أدخل رمز التأكيد (المستلم مع طلبك) لتتبع حالته.",
  "Code de confirmation": "رمز التأكيد",
  "Communiquez ce code au livreur lors de la remise pour valider la livraison.":
    "أعط هذا الرمز للموصّل عند التسليم للتحقق من التوصيل.",
  "Code de confirmation du client *": "رمز تأكيد العميل *",
  "Demandez ce code au client. Il l'a reçu à la commande et sur le suivi de commande.":
    "اطلب هذا الرمز من العميل. استلمه عند الطلب وفي صفحة تتبع الطلب.",
  Confirmer: "تأكيد",
  "📈 Ventes des 14 derniers jours": "📈 مبيعات آخر 14 يوماً",
  "Graphique des ventes des 14 derniers jours": "رسم بياني لمبيعات آخر 14 يوماً",
  "vente(s)": "بيع",
  "🏆 Meilleurs produits": "🏆 أفضل المنتجات",
  LIVRÉ: "تم التوصيل",
  FACTURE: "فاتورة",
  "Marché en ligne — livraison confirmée": "سوق إلكتروني — تم تأكيد التوصيل",
  "Marché en ligne — commande enregistrée": "سوق إلكتروني — تم تسجيل الطلب",
  "N°": "رقم",
  "Merci pour votre avis !": "شكراً على تقييمك!",
  "Mon lien de parrainage": "رابط الإحالة الخاص بي",
  "Partagez ce lien : chaque personne qui s'inscrit via ce lien devient votre filleul. Vous gagnez 2% du prix de chacun de ses achats (commission payée par la boutique).":
    "شارك هذا الرابط: كل شخص يسجل عبره يصبح من ضمن محاليك. تربح 2% من ثمن كل مشترياته (عمولة يدفعها المتجر).",
  "Copier le lien": "نسخ الرابط",
  "Générez d'abord votre code vendeur ci-dessus pour obtenir votre lien.":
    "أولاً أنشئ رمز البائع أعلاه للحصول على رابطك.",
  Réclamer: "المطالبة",
  Réclamée: "تمت المطالبة",
  "Paiement réclamé": "تمت المطالبة بالدفع",
  "Réclamer le paiement de vos commissions pour « {name} » à la boutique ?":
    "المطالبة بعمولاتك عن « {name} » من المتجر؟",
  "Paiement réclamé ! La boutique a été notifiée.": "تمت المطالبة بالدفع! تم إشعار المتجر.",
  parrainage: "إحالة",
  "Commission produit": "عمولة المنتج",
  "Commission parrainage (2%)": "عمولة الإحالة (2%)",
  "Vous vous inscrivez via le lien d'un vendeur Mboppi : votre inscription est gratuite, le rôle « Client » est sélectionné pour vous.":
    "أنت تسجل عبر رابط بائع Mboppi: التسجيل مجاني ودور «عميل» محدد تلقائياً.",
  "Code du vendeur (parrainage)": "رمز البائع (إحالة)",
  "Le vendeur {seller} réclame le paiement de sa commission pour « {product} ».":
    "البائع {seller} يطالب بدفع عمولته عن « {product} ».",
  "Voir tous les produits": "عرض كل المنتجات",
  "Voir par ville": "عرض حسب المدينة",
  "Choisir une ville…": "اختر مدينة…",
  "Sélectionnez une ville pour voir les boutiques disponibles.": "اختر مدينة لعرض المتاجر المتاحة.",
  "Aucune boutique dans cette ville pour le moment. Revenez bientôt !":
    "لا توجد متاجر في هذه المدينة حالياً. عد لاحقاً!",
  "{n} produits": "{n} منتجات",
  "Ville non renseignée": "المدينة غير محددة",
  "Saisir une ville (ex : Yaoundé)…": "أدخل المدينة (مثال: ياوندي)…",
  "Saisissez une ville pour voir ses boutiques, ses créateurs et ses produits.":
    "أدخل مدينة لعرض متاجرها ومبدعيها ومنتجاتها.",
  "Aucune boutique ni produit dans cette ville pour le moment.":
    "لا توجد متاجر أو منتجات في هذه المدينة حالياً.",
  "Boutiques et créateurs": "المتاجر والمبدعون",
  "ex : +237 6 00 00 00 00": "مثال: +237 6 00 00 00 00",
  "Votre nom, votre adresse e-mail, votre numéro de téléphone et votre pays.":
    "اسمك وبريدك الإلكتروني ورقم هاتفك ودولتك.",
};

const ES = {
  Produits: "Productos",
  "Vitrine d'offre": "Escaparate de ofertas",
  Connexion: "Iniciar sesión",
  "Créer un compte": "Crear una cuenta",
  "Ma boutique": "Mi tienda",
  "Mon espace vendeur": "Mi espacio vendedor",
  "Mon espace client": "Mi espacio cliente",
  "Mon espace créateur": "Mi espacio creador",
  "Mon compte": "Mi cuenta",
  Déconnexion: "Cerrar sesión",
  "Ouvrir le menu": "Abrir el menú",
  "Fermer le menu": "Cerrar el menú",
  "Basculer le mode sombre ou clair": "Cambiar entre modo oscuro y claro",
  "Passer en mode clair": "Cambiar a modo claro",
  "Passer en mode sombre": "Cambiar a modo oscuro",
  "Changer la langue du site": "Cambiar el idioma del sitio",
  "Suivez sur": "Síguenos en",
  "Suivez-nous sur les réseaux sociaux": "Síguenos en las redes sociales",
  "Espace réservé. Entrez le mot de passe administrateur.":
    "Zona restringida. Introduce la contraseña de administrador.",
  "Mot de passe": "Contraseña",
  "Vérification…": "Verificando…",
  Entrer: "Entrar",
  "Se déconnecter": "Cerrar sesión",
  boutique: "tienda",
  vendeur: "vendedor",
  client: "cliente",
  créateur: "creador",
  "Mon espace": "Mi espacio",
  "Chargement…": "Cargando…",
  "Page introuvable": "Página no encontrada",
  "Retour à l'accueil": "Volver al inicio",
  Retour: "Volver",
  "À propos": "Acerca de",
  Contact: "Contacto",
  "Marché en ligne pour boutiques, vendeurs, clients et créateurs. Commandez facilement via WhatsApp.":
    "Mercado en línea para tiendas, vendedores, clientes y creadores. Pide fácilmente por WhatsApp.",
  Navigation: "Navegación",
  Accueil: "Inicio",
  Compte: "Cuenta",
  "Tous droits réservés.": "Todos los derechos reservados.",
  "Restez informé": "Mantente informado",
  "Recevez nos bons plans et nouveautés directement par email.":
    "Recibe nuestras ofertas y novedades directamente por correo electrónico.",
  "Votre adresse email": "Tu correo electrónico",
  "S'abonner": "Suscribirse",
  "Envoi…": "Enviando…",
  "Merci ! Vous êtes bien inscrit(e) à la newsletter.": "¡Gracias! Te has suscrito al boletín.",
  "Adresse invalide ou problème lors de l'inscription. Réessayez.":
    "Dirección inválida o problema durante el registro. Inténtalo de nuevo.",
  "Désinscription possible à tout moment via le lien présent dans chaque email.":
    "Puedes darte de baja en cualquier momento mediante el enlace de cada correo.",
  "Je soutiens": "Apoyo",
  "Formations et Digital": "Formación y Digital",
  "Formation Mboppi": "Formación Mboppi",
  "Je soutiens Mboppi": "Apoyo a Mboppi",
  "Chaque geste compte pour faire grandir Mboppi": "Cada gesto cuenta para hacer crecer a Mboppi",
  "Votre soutien nous aide à payer les frais du site, à améliorer la plateforme et à accompagner nos boutiques et vendeurs. Chaque contribution, même petite, fait avancer le projet.":
    "Tu apoyo nos ayuda a pagar los gastos del sitio, a mejorar la plataforma y a acompañar a nuestras tiendas y vendedores. Cada aporte, por pequeño que sea, hace avanzar el proyecto.",
  "Comment pouvez-vous soutenir le projet ?": "¿Cómo puedes apoyar el proyecto?",
  "Choisissez le moyen qui vous convient.": "Elige el método que más te convenga.",
  "Orange Money": "Orange Money",
  "MTN Mobile Money": "MTN Mobile Money",
  PayPal: "PayPal",
  "Virement bancaire (UBA)": "Transferencia bancaria (UBA)",
  "Merci pour votre soutien !": "¡Gracias por tu apoyo!",
  "Avec votre aide, Mboppi continue de connecter les boutiques, les vendeurs et les clients de toute la communauté.":
    "Con tu ayuda, Mboppi sigue conectando tiendas, vendedores y clientes de toda la comunidad.",
  "Soutenez Mboppi : Orange Money, MTN Mobile Money, PayPal ou virement bancaire UBA.":
    "Apoya a Mboppi: Orange Money, MTN Mobile Money, PayPal o transferencia bancaria UBA.",
  "Boutique : {shop}": "Tienda: {shop}",
  "Garantie {n} mois": "Garantía de {n} meses",
  "Livraison {price} {symbol}": "Entrega {price} {symbol}",
  "Livraison gratuite": "Entrega gratuita",
  "Prix de vente": "Precio de venta",
  "Commission ({n}%)": "Comisión ({n}%)",
  "En stock : {n}": "En stock: {n}",
  "Rupture de stock": "Sin stock",
  Vendre: "Vender",
  "Économisez {n} {symbol}": "Ahorra {n} {symbol}",
  "Mboppi - {title}": "Mboppi - {title}",
  "Mboppi : boutique en ligne, vendeurs, créateurs.":
    "Mboppi: tienda en línea, vendedores, creadores.",
  "Marché en ligne Mboppi.": "Mercado en línea Mboppi.",
  "Bienvenue sur Mboppi": "Bienvenido a Mboppi",
  "Le marché où boutiques, vendeurs et créateurs se rencontrent. Commandez directement sur WhatsApp !":
    "El mercado donde tiendas, vendedores y creadores se encuentran. ¡Pide directamente por WhatsApp!",
  "Voir les offres": "Ver las ofertas",
  "Créer un compte gratuit": "Crear una cuenta gratis",
  "Produits récents": "Productos recientes",
  "Offres du moment": "Ofertas del momento",
  "Aucun produit disponible pour le moment.": "No hay productos disponibles por el momento.",
  "Bienvenue chez Mboppi": "Bienvenido a Mboppi",
  "BIENVENUE SUR MBOPPI": "BIENVENIDO A MBOPPI",
  "Rechercher un produit, une boutique…": "Buscar un producto, una tienda…",
  "Rechercher un produit": "Buscar un producto",
  "Rechercher une boutique": "Buscar una tienda",
  "Rechercher une création": "Buscar una creación",
  "Type de recherche": "Tipo de búsqueda",
  "Catégories populaires": "Categorías populares",
  "Voir toutes les offres": "Ver todas las ofertas",
  "Réinitialiser les filtres": "Restablecer filtros",
  "Filtrer par catégorie": "Filtrar por categoría",
  Trier: "Ordenar",
  "Aucun produit dans cette catégorie.": "No hay productos en esta categoría.",
  "Aucun résultat pour votre recherche.": "No hay resultados para tu búsqueda.",
  "Aucun produit disponible.": "No hay productos disponibles.",
  "Prix normal ({symbol})": "Precio normal ({symbol})",
  "ex : 5000 (s'affiche barré)": "p. ej.: 5000 (se muestra tachado)",
  "ex : 3500 (s'affiche en vert)": "p. ej.: 3500 (se muestra en verde)",
  "Garantie (chiffres ou lettres)": "Garantía (números o letras)",
  "Renseignez au moins un prix (normal ou de vente).":
    "Indica al menos un precio (normal o de venta).",
  "Rejoignez Mboppi": "Únete a Mboppi",
  "Boutiques en ligne": "Tiendas en línea",
  "Créez votre vitrine et publiez vos produits.": "Crea tu escaparate y publica tus productos.",
  Vendeurs: "Vendedores",
  "Vendez les produits des boutiques et gagnez des commissions.":
    "Vende los productos de las tiendas y gana comisiones.",
  Clients: "Clientes",
  "Parcourez le marché et commandez sur WhatsApp.": "Explora el mercado y pide por WhatsApp.",
  Créateurs: "Creadores",
  "Faites rayonner vos créations.": "Haz brillar tus creaciones.",
  "Les créateurs": "Los creadores",
  "Créateurs de Mboppi": "Creadores de Mboppi",
  "Découvrez les créateurs de Mboppi et leurs créations artisanales.":
    "Descubre los creadores de Mboppi y sus creaciones artesanales.",
  "Créations de {name}": "Creaciones de {name}",
  "Créations sur Mboppi": "Creaciones en Mboppi",
  "Vitrine de créations sur Mboppi.": "Vitrina de creaciones en Mboppi.",
  "Voir ma vitrine": "Ver mi vitrina",
  "Voir les créations": "Ver las creaciones",
  "Aucun créateur pour le moment.": "No hay creadores por el momento.",
  Commencer: "Empezar",
  Inscription: "Registro",
  "Pays *": "País *",
  "Choisir votre pays…": "Elige tu país…",
  "Je veux m'inscrire en tant que :": "Quiero registrarme como:",
  "Boutique (shop)": "Tienda (shop)",
  "Je crée et gère ma boutique.": "Creo y gestiono mi tienda.",
  "Vendeur (seller)": "Vendedor (seller)",
  "Je vends les produits des boutiques et gagne une commission.":
    "Vendo los productos de las tiendas y gano una comisión.",
  Client: "Cliente",
  "Je consulte le marché et je commande.": "Consulto el mercado y hago pedidos.",
  "Créateur (creator)": "Creador (creator)",
  "Je mets en valeur mes créations.": "Pongo en valor mis creaciones.",
  "Nom complet *": "Nombre completo *",
  "Adresse e-mail *": "Correo electrónico *",
  "Mot de passe *": "Contraseña *",
  "6 caractères minimum": "Mínimo 6 caracteres",
  "S'inscrire": "Registrarme",
  "Déjà un compte ?": "¿Ya tienes una cuenta?",
  "Se connecter": "Iniciar sesión",
  "ou s'inscrire avec Google": "o regístrate con Google",
  "Veuillez remplir tous les champs.": "Por favor, completa todos los campos.",
  "Une erreur est survenue, réessayez.": "Se produjo un error, inténtalo de nuevo.",
  "Connexion à Mboppi": "Conexión a Mboppi",
  "Ravi de vous revoir !": "¡Nos alegra verte de nuevo!",
  "Se connecter à mon compte": "Iniciar sesión en mi cuenta",
  "Mot de passe": "Contraseña",
  "Pas encore de compte ?": "¿Aún no tienes cuenta?",
  "S'inscrire ici": "Regístrate aquí",
  "Email ou mot de passe incorrect.": "Correo electrónico o contraseña incorrectos.",
  "Numéro de téléphone": "Número de teléfono",
  "Connexion en cours…": "Iniciando sesión…",
  "Merci de patienter pendant la connexion à votre compte Google.":
    "Por favor, espera durante la conexión a tu cuenta de Google.",
  "Connexion réussie, redirection…": "Conexión exitosa, redirigiendo…",
  Profil: "Perfil",
  "Votre nom, votre adresse e-mail et votre pays.": "Tu nombre, tu correo electrónico y tu país.",
  Nom: "Nombre",
  "E-mail": "Correo electrónico",
  Pays: "País",
  "Localisation (ville)": "Ubicación (ciudad)",
  "Votre ville ou quartier (affiché sur vos produits).":
    "Tu ciudad o barrio (se muestra en tus productos).",
  Enregistrer: "Guardar",
  "Profil mis à jour !": "¡Perfil actualizado!",
  Sécurité: "Seguridad",
  "Modifier mon mot de passe": "Cambiar mi contraseña",
  "Vous pouvez changer votre mot de passe à tout moment.":
    "Puedes cambiar tu contraseña en cualquier momento.",
  "Mot de passe actuel": "Contraseña actual",
  "Nouveau mot de passe": "Nueva contraseña",
  "Confirmer le mot de passe": "Confirmar la contraseña",
  "Confirmer le nouveau mot de passe": "Confirmar la nueva contraseña",
  "Changer le mot de passe": "Cambiar la contraseña",
  "Mot de passe modifié !": "¡Contraseña modificada!",
  "Les mots de passe ne correspondent pas.": "Las contraseñas no coinciden.",
  "Mot de passe actuel incorrect.": "Contraseña actual incorrecta.",
  "Zone dangereuse": "Zona peligrosa",
  "Supprimer mon compte": "Eliminar mi cuenta",
  "La suppression est définitive : produits et ventes seront retirés.":
    "La eliminación es definitiva: se retirarán productos y ventas.",
  "Confirmer la suppression": "Confirmar la eliminación",
  "Entrez votre mot de passe pour confirmer :": "Introduce tu contraseña para confirmar:",
  "Compte supprimé. À bientôt !": "Cuenta eliminada. ¡Hasta pronto!",
  "Mot de passe incorrect.": "Contraseña incorrecta.",
  "Veuillez entrer votre mot de passe.": "Por favor, introduce tu contraseña.",
  "Le mot de passe doit contenir au moins 6 caractères.":
    "La contraseña debe contener al menos 6 caracteres.",
  "Gérez vos produits et suivez vos ventes.": "Gestiona tus productos y sigue tus ventas.",
  "+ Ajouter un produit": "+ Agregar un producto",
  Annuler: "Cancelar",
  Retirer: "Quitar",
  "Ajouter un produit": "Agregar un producto",
  "Nom du produit *": "Nombre del producto *",
  "Catégorie *": "Categoría *",
  "Choisir une catégorie…": "Elige una categoría…",
  Description: "Descripción",
  "Photos (3 max)": "Fotos (máx. 3)",
  "Ajouter une photo": "Agregar una foto",
  "Vos produits": "Tus productos",
  "Aucun produit pour le moment.": "No hay productos por el momento.",
  "Garantie (mois)": "Garantía (meses)",
  "Quantité *": "Cantidad *",
  "Frais de livraison ({symbol})": "Gastos de envío ({symbol})",
  "Contact de la boutique": "Contacto de la tienda",
  "Prix de vente ({symbol}) *": "Precio de venta ({symbol}) *",
  "Commission vendeur (%) *": "Comisión vendedor (%) *",
  "Produit ajouté !": "¡Producto agregado!",
  "Produit mis à jour !": "¡Producto actualizado!",
  "Produit supprimé.": "Producto eliminado.",
  "Enregistrer les modifications": "Guardar los cambios",
  "Ventes enregistrées": "Ventas registradas",
  "Chiffre d'affaires": "Facturación",
  "Commissions versées aux vendeurs": "Comisiones pagadas a los vendedores",
  "Aucune vente pour le moment.": "No hay ventas por el momento.",
  "Historique des ventes": "Historial de ventas",
  Produit: "Producto",
  Vendeur: "Vendedor",
  Acheteur: "Comprador",
  Date: "Fecha",
  Quantité: "Cantidad",
  Total: "Total",
  Commission: "Comisión",
  "Le vendeur affichera : {price} {symbol} et gagnera {commission} {symbol} de commission.":
    "El vendedor mostrará: {price} {symbol} y ganará {commission} {symbol} de comisión.",
  Modifier: "Modificar",
  Rétirer: "Quitar",
  "Retrait…": "Quitando…",
  "Produits disponibles": "Productos disponibles",
  "Commission totale générée": "Comisión total generada",
  "Commission confirmée": "Comisión confirmada",
  "Vendre : {name}": "Vender: {name}",
  "Prix : {price} {symbol} — Votre commission : {commission} {symbol} par unité":
    "Precio: {price} {symbol} — Tu comisión: {commission} {symbol} por unidad",
  "Nom de l'acheteur *": "Nombre del comprador *",
  "Téléphone de l'acheteur": "Teléfono del comprador",
  "Vente enregistrée !": "¡Venta registrada!",
  "Mes ventes": "Mis ventas",
  "Total de la vente": "Total de la venta",
  "Votre commission": "Tu comisión",
  Statut: "Estado",
  Confirmée: "Confirmada",
  "En attente de confirmation": "Pendiente de confirmación",
  "Bienvenue {name} !": "¡Bienvenido {name}!",
  "Découvrez les produits et offres des boutiques.":
    "Descubre los productos y ofertas de las tiendas.",
  "Voir les produits": "Ver los productos",
  "Compte créé le {date}": "Cuenta creada el {date}",
  "Derniers produits": "Últimos productos",
  "Mes informations": "Mi información",
  "Bienvenue {name} ! Faites rayonner vos créations sur le marché Mboppi.":
    "¡Bienvenido {name}! Haz brillar tus creaciones en el mercado Mboppi.",
  "Bientôt disponible : une vitrine dédiée à vos créations.":
    "Próximamente: un escaparate dedicado a tus creaciones.",
  "Retour aux produits": "Volver a los productos",
  Boutique: "Tienda",
  "Quantité disponible : {n}": "Cantidad disponible: {n}",
  "Commandez sur WhatsApp": "Pide por WhatsApp",
  "Message par défaut": "Mensaje predeterminado",
  "Rétirer ce produit": "Quitar este producto",
  "Produit introuvable.": "Producto no encontrado.",
  "Votre message WhatsApp :": "Tu mensaje de WhatsApp:",
  "Retour aux offres": "Volver a las ofertas",
  "Prix d'origine : {price} {symbol}": "Precio original: {price} {symbol}",
  "Commandez cette offre": "Pide esta oferta",
  "Offre introuvable.": "Oferta no encontrada.",
  "Catégorie : {cat}": "Categoría: {cat}",
  "Garantie : {warranty}": "Garantía: {warranty}",
  "Disponible : {n}": "Disponible: {n}",
  "Vitrine d'offres": "Escaparate de ofertas",
  "Découvrez les meilleures offres du moment.": "Descubre las mejores ofertas del momento.",
  "Rechercher une offre…": "Buscar una oferta…",
  "Catégorie :": "Categoría:",
  Toutes: "Todas",
  "Économies totales : {n} {symbol}": "Ahorros totales: {n} {symbol}",
  "Aucune offre trouvée.": "No se encontró ninguna oferta.",
  "Résultat : {n} offre(s)": "Resultado: {n} oferta(s)",
  "Gestion des offres": "Gestión de ofertas",
  "Zone réservée.": "Zona reservada.",
  "Fermer le formulaire": "Cerrar el formulario",
  "+ Ajouter une Offre": "+ Agregar una Oferta",
  "Nom de l'offre *": "Nombre de la oferta *",
  Catégorie: "Categoría",
  "ex : Électronique, Mode, Alimentation…": "p. ej.: Electrónica, Moda, Alimentación…",
  Garantie: "Garantía",
  "ex : 6 mois, 1 an, 2 ans": "p. ej.: 6 meses, 1 año, 2 años",
  "Prix promotionnel ({symbol}) *": "Precio promocional ({symbol}) *",
  "Publier l'offre": "Publicar la oferta",
  "Offre publiée !": "¡Oferta publicada!",
  "Mise à jour réussie !": "¡Actualización exitosa!",
  Supprimer: "Eliminar",
  "Mot de passe requis": "Contraseña requerida",
  "Supprimer cette offre ?": "¿Eliminar esta oferta?",
  "Photo :": "Foto:",
  "Prix original : {price} {symbol}": "Precio original: {price} {symbol}",
  "Prix promotionnel : {price} {symbol}": "Precio promocional: {price} {symbol}",
  "À propos de Mboppi": "Acerca de Mboppi",
  "Mboppi est un marché en ligne conçu pour connecter boutiques, vendeurs, clients et créateurs.":
    "Mboppi es un mercado en línea diseñado para conectar tiendas, vendedores, clientes y creadores.",
  "Notre mission": "Nuestra misión",
  "Faciliter le commerce local en donnant à chacun une vitrine simple et accessible, avec commande directe via WhatsApp.":
    "Facilitar el comercio local dando a cada uno un escaparate simple y accesible, con pedido directo por WhatsApp.",
  "Nos valeurs": "Nuestros valores",
  Simplicité: "Simplicidad",
  "Une prise en main rapide pour tous.": "Un manejo rápido para todos.",
  Transparence: "Transparencia",
  "Des commissions claires et visibles.": "Comisiones claras y visibles.",
  Communauté: "Comunidad",
  "Boutiques, vendeurs et créateurs grandissent ensemble.":
    "Tiendas, vendedores y creadores crecen juntos.",
  "Pour qui ?": "¿Para quién?",
  Boutiques: "Tiendas",
  "Vendez vos produits à travers des vendeurs partenaires.":
    "Vende tus productos a través de vendedores asociados.",
  "Gagnez des commissions sur chaque vente.": "Gana comisiones en cada venta.",
  "Commandez facilement sur WhatsApp.": "Pide fácilmente por WhatsApp.",
  "Présentez vos créations au marché.": "Presenta tus creaciones en el mercado.",
  "Contactez-nous": "Contáctanos",
  "Une question ? Écrivez-nous sur WhatsApp.": "¿Una pregunta? Escríbenos por WhatsApp.",
  "Une question, un problème ou une suggestion ? Écrivez-nous, nous répondons rapidement.":
    "¿Una pregunta, un problema o una sugerencia? Escríbenos, respondemos rápido.",
  "Nom *": "Nombre *",
  "Votre nom": "Tu nombre",
  "E-mail *": "Correo electrónico *",
  "Votre e-mail": "Tu correo electrónico",
  "Message *": "Mensaje *",
  "Votre message…": "Tu mensaje…",
  "Envoyer via WhatsApp": "Enviar por WhatsApp",
  "Ou directement sur WhatsApp": "O directamente por WhatsApp",
  "Votre message :": "Tu mensaje:",
  "Données personnelles": "Datos personales",
  "Quelles données collectons-nous ?": "¿Qué datos recopilamos?",
  "Nom, adresse e-mail, pays et rôle sur la plateforme.":
    "Nombre, correo electrónico, país y rol en la plataforma.",
  "À quoi servent vos données ?": "¿Para qué sirven tus datos?",
  "Gérer votre compte, afficher vos produits et enregistrer vos ventes.":
    "Gestionar tu cuenta, mostrar tus productos y registrar tus ventas.",
  "Combien de temps sont-elles conservées ?": "¿Cuánto tiempo se conservan?",
  "Tant que votre compte est actif. Vous pouvez le supprimer à tout moment depuis votre espace.":
    "Mientras tu cuenta esté activa. Puedes eliminarla en cualquier momento desde tu espacio.",
  "Les mots de passe sont chiffrés et les données sont protégées.":
    "Las contraseñas están cifradas y los datos protegidos.",
  "Comment supprimer mes données ?": "¿Cómo eliminar mis datos?",
  "Allez dans « Mon compte » puis « Supprimer mon compte ».":
    "Ve a «Mi cuenta» y luego a «Eliminar mi cuenta».",
  "Tout le monde": "Todos",
  Tous: "Todos",
  "Rechercher…": "Buscar…",
  Recherche: "Búsqueda",
  Favoris: "Favoritos",
  Panier: "Carrito",
  "Oups, une erreur est survenue.": "Oops, se produjo un error.",
  "Réessayez ou rechargez la page. Vos données sont en sécurité.":
    "Inténtalo de nuevo o recarga la página. Tus datos están seguros.",
  "Pas de connexion internet": "Sin conexión a internet",
  "Vous êtes actuellement hors ligne. Vérifiez votre connexion puis réessayez.":
    "Estás sin conexión. Verifica tu conexión y vuelve a intentarlo.",
  "Mes fonds & transactions": "Mis fondos y transacciones",
  "Solde": "Saldo",
  "Reçus": "Recibidos",
  "Sortis": "Pagados",
  "Reversement en ligne": "Pago en línea",
  "Encaissement en ligne": "Cobro en línea",
  "Aucune transaction de fonds pour le moment.": "No hay transacciones de fondos por el momento.",
  "Fonds indisponibles pour le moment.": "Fondos no disponibles por el momento.",
  "Erreurs récentes (client)": "Errores recientes (cliente)",
  "Journal des erreurs de rendu remontées par les navigateurs. Si l'écran « Oups, une erreur est survenue » apparaît, sa cause exacte (message + pile) est enregistrée ici.":
    "Errores de renderizado informados por los navegadores. Si aparece la pantalla “Oops, ocurrió un error”, su causa exacta (mensaje + pila) queda registrada aquí.",
  "Pile (début)": "Pila (inicio)",
  "Aucune erreur enregistrée": "No hay errores registrados",
  Réessayer: "Reintentar",
  "Désolé, Mboppi ne peut pas se connecter à internet en ce moment. Vérifiez votre réseau (Wi-Fi ou données mobiles) puis réessayez.":
    "Lo sentimos, Mboppi no puede conectarse a internet en este momento. Verifica tu red (Wi-Fi o datos móviles) y vuelve a intentarlo.",
  "Toujours pas de connexion. Vérifiez votre réseau puis réessayez.":
    "Sigue sin conexión. Verifica tu red y vuelve a intentarlo.",
  "Vos informations sont en sécurité sur votre appareil : rien n'est perdu.":
    "Tus datos están seguros en tu dispositivo: no se pierde nada.",
  Rechercher: "Buscar",
  "Aucun résultat": "Sin resultados",
  "Données & confidentialité": "Datos y privacidad",
  Appeler: "Llamar",
  "{n} photos": "{n} fotos",
  "Commander sur WhatsApp": "Pedir por WhatsApp",
  "Disponibilité : {n} unité(s)": "Disponibilidad: {n} unidad(es)",
  Offre: "Oferta",
  "Bonjour, je suis intéressé(e) par votre offre « {name} » : {url}":
    "Hola, me interesa tu oferta « {name} »: {url}",
  "{name}": "{name}",
  "Bonjour, je suis intéressé(e) par le produit « {name} » : {url}":
    "Hola, me interesa el producto « {name} »: {url}",
  "{name}": "{name}",
  "Je publie mes produits (max 5) et je fixe les commissions":
    "Publico mis productos (máx. 5) y fijo las comisiones",
  "Je vends les produits des boutiques et je gagne des commissions":
    "Vendo los productos de las tiendas y gano comisiones",
  "Je consulte les offres et les produits, je commande facilement":
    "Consulto ofertas y productos, hago pedidos fácilmente",
  "Je présente et vends mes créations au marché Mboppi":
    "Presento y vendo mis creaciones en el mercado Mboppi",
  "Nom complet / Nom de la boutique": "Nombre completo / Nombre de la tienda",
  Email: "Correo electrónico",
  "Mot de passe (6 caractères minimum)": "Contraseña (mínimo 6 caracteres)",
  ou: "o",
  "S'inscrire avec Google": "Registrarse con Google",
  "Se connecter avec Google": "Iniciar sesión con Google",
  "Déjà inscrit ?": "¿Ya estás registrado?",
  "Retour à l'inscription": "Volver al registro",
  "Produits publiés : {n} / 5": "Productos publicados: {n} / 5",
  "Limite atteinte": "Límite alcanzado",
  "Nouveau produit": "Nuevo producto",
  "Modifier le produit": "Modificar el producto",
  "Photos (maximum {n})": "Fotos (máximo {n})",
  "Compression…": "Comprimiendo…",
  "Photos complètes": "Fotos completas",
  "📷 Ajouter des photos": "📷 Agregar fotos",
  "Quantité en stock *": "Cantidad en stock *",
  "Garantie (en mois)": "Garantía (en meses)",
  "Publier le produit": "Publicar el producto",
  "Produit publié avec succès.": "Producto publicado con éxito.",
  "Supprimer ce produit ?": "¿Eliminar este producto?",
  "Aucun produit pour le moment. Ajoutez votre premier produit (max 5).":
    "No hay productos por el momento. Agrega tu primer producto (máx. 5).",
  "Statistiques des ventes": "Estadísticas de ventas",
  "Aucune vente enregistrée par les vendeurs.": "No hay ventas registradas por los vendedores.",
  Qté: "Cant.",
  Confirmer: "Confirmar",
  "Sélectionnez un produit des boutiques et enregistrez une vente.":
    "Selecciona un producto de las tiendas y registra una venta.",
  "Ventes réalisées": "Ventas realizadas",
  "Vendre ce produit": "Vender este producto",
  "Téléphone (optionnel)": "Teléfono (opcional)",
  "Enregistrer la vente": "Registrar la venta",
  "Aucun produit disponible à vendre pour le moment.":
    "No hay productos disponibles para vender por el momento.",
  "Mes ventes et commissions": "Mis ventas y comisiones",
  "Vous n'avez pas encore enregistré de vente.": "Aún no has registrado ninguna venta.",
  "Vente enregistrée. Commission créditée sur votre compte.":
    "Venta registrada. Comisión acreditada en tu cuenta.",
  "Commissions sur les produits": "Comisiones sobre los productos",
  "Commissions fixées par les boutiques sur chaque produit. Cliquez sur une colonne pour trier.":
    "Comisiones fijadas por las tiendas en cada producto. Haz clic en una columna para ordenar.",
  "Commission %": "Comisión %",
  Montant: "Importe",
  "Publication de produit": "Publicación de producto",
  "Commission payée": "Comisión pagada",
  "Commission de parrainage": "Comisión de referidos",
  Activité: "Actividad",
  "Voir plus de produits": "Ver más productos",
  "Télécharger le tableau (Excel)": "Descargar la tabla (Excel)",
  "Le fichier téléchargé liste chaque activité du compte : publications de produits, ventes, commissions payées, achats et commandes.":
    "El archivo descargado enumera cada actividad de la cuenta: publicaciones de productos, ventas, comisiones pagadas, compras y pedidos.",
  "Mon code vendeur": "Mi código de vendedor",
  "Générer mon code": "Generar mi código",
  "Votre code identifie vos ventes auprès des boutiques. Communiquez-le à vos clients ou partagez votre lien de vente.":
    "Tu código identifica tus ventas ante las tiendas. Comunícalo a tus clientes o comparte tu enlace de venta.",
  "Code copié !": "¡Código copiado!",
  "Copier le code": "Copiar el código",
  "Aucune commande trouvée avec ce code.": "No se encontró ningún pedido con este código.",
  Copier: "Copiar",
  "Copié !": "¡Copiado!",
  "Code vendeur généré : {code}": "Código de vendedor generado: {code}",
  "Lien du produit": "Enlace del producto",
  "Lien de vente": "Enlace de venta",
  "Générez votre code vendeur pour obtenir le lien de vente.":
    "Genera tu código de vendedor para obtener el enlace de venta.",
  "La boutique va livrer le produit. Partagez le lien de vente à votre client : il confirmera l'achat avec votre code {code}.":
    "La tienda entregará el producto. Comparte el enlace de venta con tu cliente: confirmará la compra con tu código {code}.",
  "Prix unitaire : {price} {symbol} — Votre commission : {commission} {symbol} par unité":
    "Precio unitario: {price} {symbol} — Tu comisión: {commission} {symbol} por unidad",
  "Vente en attente": "Venta pendiente",
  Acheté: "Comprado",
  Annulée: "Cancelada",
  "Code vendeur": "Código de vendedor",
  "Prix payé": "Precio pagado",
  Acheter: "Comprar",
  "Achat confirmé !": "¡Compra confirmada!",
  "Produit non trouvé": "Producto no encontrado",
  "Confirmer l'achat": "Confirmar la compra",
  "Code du vendeur *": "Código del vendedor *",
  "Prix d'achat ({symbol}) *": "Precio de compra ({symbol}) *",
  "Nom de l'acheteur": "Nombre del comprador",
  "Vous devez être connecté pour confirmer l'achat.":
    "Debes iniciar sesión para confirmar la compra.",
  "La boutique et le vendeur ont été notifiés. Retrouvez cet achat dans votre espace client.":
    "La tienda y el vendedor han sido notificados. Encuentra esta compra en tu espacio cliente.",
  "Voir mes achats": "Ver mis compras",
  "Continuer mes achats": "Continuar mis compras",
  "Mes achats": "Mis compras",
  "Aucun achat pour le moment.": "No hay compras por el momento.",
  "Ce produit vous est proposé par un vendeur Mboppi.":
    "Este producto te lo ofrece un vendedor de Mboppi.",
  "Code du vendeur : {code} — Confirmez votre achat pour le notifier, lui et la boutique.":
    "Código del vendedor: {code} — Confirma tu compra para notificarle a él y a la tienda.",
  "Confirmez votre achat : la boutique et le vendeur seront notifiés.":
    "Confirma tu compra: la tienda y el vendedor serán notificados.",
  "Ce produit vous est proposé par un vendeur Mboppi. Entrez son code et le prix convenu pour confirmer l'achat.":
    "Este producto te lo ofrece un vendedor de Mboppi. Introduce su código y el precio acordado para confirmar la compra.",
  "Vendeur : {seller}": "Vendedor: {seller}",
  Notifications: "Notificaciones",
  "Tout marquer comme lu": "Marcar todo como leído",
  "Aucune notification": "Sin notificaciones",
  "Supprimer la notification": "Eliminar la notificación",
  "Installer l'application": "Instalar la aplicación",
  "Pour installer Mboppi : ouvrez le menu Partager de votre navigateur (Safari) puis choisissez « Sur l'écran d'accueil ».":
    "Para instalar Mboppi: abre el menú Compartir de tu navegador (Safari) y elige «En la pantalla de inicio».",
  "Pour installer Mboppi : ouvrez le menu de votre navigateur (⋮ ou ⋯) puis choisissez « Ajouter à l'écran d'accueil » ou « Installer l'application ».":
    "Para instalar Mboppi: abre el menú de tu navegador (⋮ o ⋯) y elige «Agregar a la pantalla de inicio» o «Instalar la aplicación».",
  "Votre vente de « {product} » a été achetée par {buyer}.":
    "Tu venta de « {product} » ha sido comprada por {buyer}.",
  "Votre vente de « {product} » a été confirmée par la boutique pour {buyer}.":
    "Tu venta de « {product} » ha sido confirmada por la tienda para {buyer}.",
  "Votre commande « {product} » a été confirmée par la boutique.":
    "Tu pedido « {product} » ha sido confirmado por la tienda.",
  "Votre vente de « {product} » a été annulée par la boutique.":
    "Tu venta de « {product} » ha sido cancelada por la tienda.",
  "Votre commande « {product} » a été annulée par la boutique.":
    "Tu pedido « {product} » ha sido cancelado por la tienda.",
  "Vente de « {product} » annulée — vendeur : {seller} ({code}), acheteur : {buyer}.":
    "Venta de « {product} » cancelada — vendedor: {seller} ({code}), comprador: {buyer}.",
  "Votre filleul {buyer} a commandé « {product} » chez {shop} — 2% ({amount} {symbol}) à recevoir après livraison.":
    "Tu referido {buyer} ha hecho un pedido de « {product} » en {shop} — 2% ({amount} {symbol}) a recibir después de la entrega.",
  "Le parrain {parrain} réclame 2% ({amount} {symbol}) pour « {product} ».":
    "El padrino {parrain} reclama 2% ({amount} {symbol}) por « {product} ».",
  "Votre commission de parrainage ({amount} {symbol}) pour « {product} » a été payée par {shop}.":
    "Tu comisión de referidos ({amount} {symbol}) por « {product} » ha sido pagada por {shop}.",
  "Commande parrainée de {buyer} pour « {product} » — 2% ({amount} {symbol}) à verser au parrain après livraison.":
    "Pedido referido de {buyer} por « {product} » — 2% ({amount} {symbol}) a pagar al padrino después de la entrega.",
  "Parrainage en attente": "Referido pendiente",
  "Parrainage payé": "Referido pagado",
  "Mes filleuls — commissions de parrainage (2%)": "Mis referidos — comisiones de referidos (2%)",
  "Commissions de parrainage vendeur": "Comisiones de referido de vendedores",
  "Chaque vendeur ou créateur qui s'inscrit via votre lien et paie son adhésion (1 500 F) vous fait gagner 1 000 F (net 900 F après frais) ; 500 F sont reversés à Mboppi.":
    "Cada vendedor o creador que se registre con tu enlace y pague su membresía (1.500 F) te hace ganar 1.000 F (neto 900 F tras gastos); 500 F se devuelven a Mboppi.",
  "Actuellement tout le monde a accès gratuitement (même les parrainés) tant que l'administrateur ne ferme pas le compte : la commission de 1 000 F n'est donc versée que lorsqu'un affilié paie réellement son adhésion.":
    "Actualmente todo el mundo tiene acceso gratuito (incluso los referidos) mientras el administrador no cierre la cuenta: la comisión de 1.000 F solo se paga cuando un referido paga realmente su membresía.",
  "Vendeurs / créateurs parrainés — commission de 1 000 F":
    "Vendedores / creadores referidos — comisión de 1.000 F",
  "Chaque vendeur ou créateur qui s'inscrit via votre lien et paie son adhésion (1 500 F) vous fait gagner 1 000 F. Actuellement tout le monde a accès gratuitement (même les parrainés) tant que l'administrateur ne ferme pas le compte : la commission n'est donc versée que lorsqu'un affilié paie réellement son adhésion.":
    "Cada vendedor o creador que se registre con tu enlace y pague su membresía (1.500 F) te hace ganar 1.000 F (neto 900 F tras gastos); 500 F se devuelven a Mboppi. Actualmente todo el mundo tiene acceso gratuito (incluso los referidos) mientras el administrador no cierre la cuenta: la comisión solo se paga cuando un referido paga realmente su membresía.",
  "Chaque vendeur ou créateur qui s'inscrit via votre lien et paie son adhésion (1 500 F) vous fait gagner 1 000 F":
    "Cada vendedor o creador que se registre con tu enlace y pague su membresía (1.500 F) te hace ganar 1.000 F",
  "Chaque vendeur ou créateur qui s'inscrit via votre lien et paie son adhésion (1 500 F) vous fait gagner 1 000 F. La commission est versée manuellement par l'administration.":
    "Cada vendedor o creador que se registre con tu enlace y pague su membresía (1.500 F) te hace ganar 1.000 F. La comisión se paga manualmente por la administración.",
  "Membre": "Miembro",
  "Rôle": "Rol",
  "Adhésion": "Membresía",
  "Commission": "Comisión",
  "Statut": "Estado",
  "Versée": "Abonada",
  "En cours": "En curso",
  "En attente d'adhésion": "En espera del pago de la membresía",
  "Non payée": "No pagada",
  "Adhésion payée": "Membresía pagada",
  Payé: "Pagado",
  "Marquer l'adhésion de {name} comme payée et avertir son parrain ?":
    "¿Marcar la membresía de {name} como pagada y notificar a su referidor?",
  "Montant disponible": "Importe disponible",
  "Demande de retrait": "Solicitud de retiro",
  "Références des parrainés (adhésion confirmée)": "Referencias de los referidos (membresía confirmada)",
  "Montant à retirer": "Importe a retirar",
  "Le montant doit être inférieur ou égal à votre solde disponible (multiple de 1 000 F).":
    "El importe debe ser menor o igual a su saldo disponible (múltiplo de 1.000 F).",
  "Aucun moyen de paiement configuré": "Ningún método de pago configurado",
  "Moyen de paiement parrain": "Método de pago del referidor",
  "Commentaire (optionnel)": "Comentario (opcional)",
  "Un petit commentaire…": "Un comentario breve…",
  "Confirmer le retrait": "Confirmar el retiro",
  "Demande reçue": "Solicitud recibida",
  "Votre demande de retrait de {amount} F a bien été reçue par l'équipe Mboppi. Elle sera traitée dans un délai maximum de 24 h.":
    "Hemos recibido su solicitud de retiro de {amount} F. El equipo de Mboppi la procesará en un plazo máximo de 24 h.",
  "Chaque vendeur ou créateur qui s'inscrit via votre lien et paie son adhésion (1 500 F) vous fait gagner 1 000 F, validé par l'administration. Retrait possible dès 5 000 F.":
    "Cada vendedor o creador que se registre con tu enlace y pague su membresía (1.500 F) te hace ganar 1.000 F, validado por la administración. Retiro posible desde 5.000 F.",
  "Demandes de retrait (commissions d'activation)": "Solicitudes de retiro (comisiones de activación)",
  "Parrainés (adhésion confirmée)": "Referidos (membresía confirmada)",
  Commentaire: "Comentario",
  "Aucune demande de retrait": "Sin solicitudes de retiro",
  Payer: "Pagar",
  "Payer la demande de retrait de {amount} F pour {name} ?": "¿Pagar la solicitud de retiro de {amount} F para {name}?",
  "Votre demande de retrait de {amount} F a bien été reçue. Elle sera traitée dans un délai maximum de 24 h.":
    "Hemos recibido su solicitud de retiro de {amount} F. Se tramitará en un plazo máximo de 24 h.",
  "Votre demande de retrait de {amount} F a été payée par l'équipe Mboppi.":
    "El equipo de Mboppi ha pagado su solicitud de retiro de {amount} F.",
  "Un de vos filleuls a payé son adhésion — votre commission de 1 000 F est en attente de versement.":
    "Uno de tus referidos ha pagado su membresía — tu comisión de 1.000 F está pendiente de transferencia.",
  "Parrainages (vendeurs / créateurs)": "Referidos (vendedores / creadores)",
  "Rechercher par numéro de référence (parrainé ou parrain)…":
    "Buscar por número de referencia (referido o referidor)…",
  "Parrainé": "Referido",
  "Référence": "Referencia",
  "Référence parrainé": "Referencia del referido",
  "Téléphone parrainé": "Teléfono del referido",
  "Son parrain": "Su referidor",
  "Référence parrain": "Referencia del referidor",
  "Téléphone parrain": "Teléfono del referidor",
  "Aucun parrainage": "Sin referidos",
  "Chaque commande passée par un client inscrit avec votre lien vous rapporte 2% du montant, payés par la boutique après livraison.":
    "Cada pedido hecho por un cliente registrado con tu enlace te reporta el 2% del importe, pagado por la tienda después de la entrega.",
  "Aucune commande de filleul pour le moment.": "No hay pedidos de referidos por el momento.",
  "En attente de livraison": "Pendiente de entrega",
  "Réclamer le paiement de votre commission de parrainage pour « {name} » à la boutique ?":
    "¿Reclamar el pago de tu comisión de referidos por « {name} » a la tienda?",
  "Payer le parrain": "Pagar al padrino",
  "Parrain payé": "Padrino pagado",
  "Paiement 2% réclamé": "Pago 2% reclamado",
  "à payer séparément au parrain": "a pagar por separado al padrino",
  "Moyens de paiement du parrain": "Medios de pago del padrino",
  Parrain: "Padrino",
  "Le vendeur {seller} réclame {amount} {symbol} de commissions chez votre boutique.":
    "El vendedor {seller} reclama {amount} {symbol} de comisiones en tu tienda.",
  "Le parrain {parrain} réclame {amount} {symbol} de commissions de parrainage.":
    "El padrino {parrain} reclama {amount} {symbol} de comisiones de referidos.",
  "Vos commissions ({amount} {symbol}) pour vos ventes chez {shop} ont été versées.":
    "Tus comisiones ({amount} {symbol}) por tus ventas en {shop} han sido pagadas.",
  "Votre commission de parrainage ({amount} {symbol}) chez {shop} a été versée.":
    "Tu comisión de referidos ({amount} {symbol}) en {shop} ha sido pagada.",
  "Commissions de vente — par vendeur": "Comisiones de venta — por vendedor",
  "Parrainage (2%) — par parrain": "Referidos (2%) — por padrino",
  "Commissions de vente — par boutique": "Comisiones de venta — por tienda",
  "Parrainage (2%) — par boutique": "Referidos (2%) — por tienda",
  "Nombre de ventes": "Número de ventas",
  "Réclamer vos commissions ({amount}) chez {shop} ?":
    "¿Reclamar tus comisiones ({amount}) en {shop}?",
  "Réclamer votre commission de parrainage ({amount}) chez {shop} ?":
    "¿Reclamar tu comisión de referidos ({amount}) en {shop}?",
  "Commission 2% en attente": "Comisión 2% pendiente",
  "Vente de « {product} » confirmée — vendeur : {seller} ({code}), acheteur : {buyer}.":
    "Venta de « {product} » confirmada — vendedor: {seller} ({code}), comprador: {buyer}.",
  "le client": "el cliente",
  "Profil mis à jour avec succès.": "Perfil actualizado con éxito.",
  "Mot de passe modifié avec succès.": "Contraseña modificada con éxito.",
  "Modifiez votre mot de passe de connexion.": "Cambia tu contraseña de acceso.",
  "Vous vous êtes inscrit(e) avec Google : définissez un mot de passe pour pouvoir vous connecter sans Google.":
    "Te registraste con Google: define una contraseña para poder iniciar sesión sin Google.",
  "Votre mot de passe": "Tu contraseña",
  "📍 Localisation de la boutique": "📍 Ubicación de la tienda",
  "Connecté en tant que {name} ({role}) — gérez vos informations et votre sécurité.":
    "Conectado como {name} ({role}) — gestiona tu información y tu seguridad.",
  "La suppression est définitive : votre compte, vos produits, vos ventes et tout votre contenu seront supprimés de nos serveurs.":
    "La eliminación es definitiva: tu cuenta, tus productos, tus ventas y todo tu contenido serán eliminados de nuestros servidores.",
  "Supprimer définitivement votre compte ? Vos produits, ventes et tout votre contenu seront supprimés. Cette action est irréversible.":
    "¿Eliminar definitivamente tu cuenta? Tus productos, ventas y todo tu contenido serán eliminados. Esta acción es irreversible.",
  "Les offres du moment": "Las ofertas del momento",
  "Découvrez les promotions en cours avec les meilleures réductions.":
    "Descubre las promociones en curso con los mejores descuentos.",
  "Produits des boutiques": "Productos de las tiendas",
  "Parcourez les produits disponibles chez les boutiques partenaires.":
    "Explora los productos disponibles en las tiendas asociadas.",
  "Contactez directement la centrale Mboppi pour commander.":
    "Contacta directamente con el centro de Mboppi para hacer tu pedido.",
  Rôle: "Rol",
  "Inscrit le": "Registrado el",
  "Suivez les promotions en cours et repérez les bonnes affaires.":
    "Sigue las promociones en curso y encuentra buenas ofertas.",
  "Présenter mes créations": "Presentar mis creaciones",
  "Contactez la centrale Mboppi pour exposer vos créations au marché.":
    "Contacta con el centro de Mboppi para exponer tus creaciones en el mercado.",
  "Bonjour, je suis un client de Mboppi ({email}) et j'aimerais passer une commande.":
    "Hola, soy un cliente de Mboppi ({email}) y me gustaría hacer un pedido.",
  "Bonjour, je suis un créateur sur Mboppi ({email}) et j'aimerais présenter mes créations.":
    "Hola, soy un creador en Mboppi ({email}) y me gustaría presentar mis creaciones.",
  "Le marché du quartier, en un clic": "El mercado de tu barrio, con un clic",
  "Découvrez les offres du moment, commandez les produits des boutiques partenaires, ou devenez vendeur et gagnez une commission sur chaque vente.":
    "Descubre las ofertas del momento, pide los productos de las tiendas asociadas, o hazte vendedor y gana una comisión en cada venta.",
  "Produits en boutique": "Productos en tienda",
  "Boutiques partenaires": "Tiendas asociadas",
  "Accéder à mon espace": "Acceder a mi espacio",
  "Les boutiques publient": "Las tiendas publican",
  "Elles mettent en ligne leurs produits et fixent la commission de vente.":
    "Publican sus productos y fijan la comisión de venta.",
  "Les vendeurs vendent": "Los vendedores venden",
  "Ils enregistrent les ventes et trouvent les clients, au quartier ou en ligne.":
    "Registran las ventas y encuentran clientes, en el barrio o en línea.",
  "Chacun y gagne": "Todos ganan",
  "La boutique écoule ses produits, le vendeur encaisse sa commission à chaque vente.":
    "La tienda vende sus productos, el vendedor cobra su comisión en cada venta.",
  "🏪 Produits des boutiques": "🏪 Productos de las tiendas",
  "🔍 Rechercher un produit…": "🔍 Buscar un producto…",
  "{n} photos — cliquez pour agrandir": "{n} fotos — haz clic para ampliar",
  "🗑️ Rétirer ce produit": "🗑️ Quitar este producto",
  "Retirer « {name} » définitivement ?": "¿Quitar « {name} » definitivamente?",
  "Disponibilité : {n} en stock": "Disponibilidad: {n} en stock",
  Fermer: "Cerrar",
  "Photo précédente": "Foto anterior",
  "Photo suivante": "Foto siguiente",
  Photo: "Foto",
  "← Retour à la vitrine": "← Volver al escaparate",
  "Économisez {n} {symbol} par rapport au prix d'origine":
    "Ahorra {n} {symbol} en comparación con el precio original",
  "⚡ Promotions en cours": "⚡ Promociones en curso",
  "🔥 Les offres du moment": "🔥 Las ofertas del momento",
  "Les meilleures promotions de Verone et des boutiques partenaires : prix cassés, économies garanties, commande directe par téléphone ou WhatsApp.":
    "Las mejores promociones de Verone y de las tiendas asociadas: precios rebajados, ahorros garantizados, pedido directo por teléfono o WhatsApp.",
  "Offres actives": "Ofertas activas",
  "Économies cumulées": "Ahorros acumulados",
  Catégories: "Categorías",
  "⏰ Les offres se renouvellent dans {time}": "⏰ Las ofertas se renuevan en {time}",
  "Offres promotionnelles": "Ofertas promocionales",
  "✨ Toutes ({n})": "✨ Todas ({n})",
  "🔥 Meilleures réductions": "🔥 Mejores descuentos",
  "💰 Moins cher": "💰 Más barato",
  "✨ Dernières arrivées": "✨ Últimas llegadas",
  "Aucune offre pour le moment. Revenez très vite, ça va chauffer ! 🔥":
    "No hay ofertas por el momento. ¡Vuelve pronto, esto va a estar caliente! 🔥",
  "Aucune offre ne correspond à votre recherche.": "Ninguna oferta coincide con tu búsqueda.",
  "Espace Verone": "Espacio Verone",
  "Ajoutez vos offres promotionnelles : elles s'affichent dans la Vitrine d'offre du site.":
    "Agrega tus ofertas promocionales: se muestran en el Escaparate de ofertas del sitio.",
  "Masquer mes Offres": "Ocultar mis Ofertas",
  "Voir mes Offres": "Ver mis Ofertas",
  "Partager ma Vitrine": "Compartir mi Escaparate",
  "Mes offres": "Mis ofertas",
  "Aucune offre ajoutée pour le moment.": "No hay ofertas agregadas por el momento.",
  "Offre retirée de la vitrine.": "Oferta retirada del escaparate.",
  "Maximum {n} photos par offre": "Máximo {n} fotos por oferta",
  "Impossible de lire une des photos": "No se puede leer una de las fotos",
  "Les deux prix sont requis": "Los dos precios son obligatorios",
  "Offre ajoutée avec succès — elle s'affiche maintenant sur la page Vitrine d'offre.":
    "Oferta agregada con éxito — ahora se muestra en la página Escaparate de ofertas.",
  "Nouvelle offre": "Nueva oferta",
  "Nom de l'Offre *": "Nombre de la Oferta *",
  "Garantie (en lettres ou chiffres)": "Garantía (en letras o números)",
  "Quantité (en chiffres) *": "Cantidad (en números) *",
  "Ajout en cours…": "Agregando…",
  "Ajouter l'Offre": "Agregar la Oferta",
  "Retirer l'offre": "Quitar la oferta",
  "Confirmez le retrait de « {name} » de la vitrine.":
    "Confirma la retirada de « {name} » del escaparate.",
  "Mboppi, le marché de votre quartier, en ligne": "Mboppi, el mercado de tu barrio, en línea",
  "Mboppi est née d'une idée simple : permettre à chacun de vendre et d'acheter près de chez soi, sans prix écrasant et sans dépendre des grands sites. Ici, les boutiques publient leurs produits, les créateurs exposent leurs talents, juste avec un téléphone et une connexion internet, les vendeurs vendent et gagnent des commissions, et les clients trouvent tout au même endroit avec satisfaction, sans se déplacer.":
    "Mboppi nació de una idea simple: permitir a cada uno vender y comprar cerca de casa, sin precios aplastantes y sin depender de los grandes sitios. Aquí, las tiendas publican sus productos, los creadores exponen sus talentos, solo con un teléfono y conexión a internet. Los vendedores venden y ganan comisiones, y los clientes encuentran todo en un mismo lugar, con satisfacción y sin desplazarse.",
  "Comment ça marche ?": "¿Cómo funciona?",
  "Un rôle pour chacun, une plateforme pour tous.":
    "Un rol para cada uno, una plataforma para todos.",
  "Publiez vos produits et recevez les commandes.": "Publica tus productos y recibe los pedidos.",
  "Vendez en ligne et gagnez une commission sur chaque vente.":
    "Vende en línea y gana una comisión en cada venta.",
  "Parcourez les offres du moment et commandez en un clic.":
    "Explora las ofertas del momento y pide con un clic.",
  "Commandez en un clic et recevez chez vous avec un livreur.":
    "Pide con un clic y recibe en casa con un repartidor.",
  "Produits et créations": "Productos y creaciones",
  "Commander avec son téléphone, sans carte bancaire ni frais cachés.":
    "Pedir con el teléfono, sin tarjeta bancaria ni gastos ocultos.",
  "Exposez vos créations et touchez un public plus large.":
    "Expón tus creaciones y llega a un público más amplio.",
  "Ce qui nous pousse chaque jour.": "Lo que nos impulsa cada día.",
  "La confiance": "La confianza",
  "Des commandes simples, des contacts directs avec les vendeurs.":
    "Pedidos simples, contactos directos con los vendedores.",
  "La proximité": "La cercanía",
  "Commander par WhatsApp, sans carte bancaire ni frais cachés.":
    "Pedir por WhatsApp, sin tarjeta bancaria ni gastos ocultos.",
  "La rapidité": "La rapidez",
  "Une plateforme légère, qui s'affiche vite, même en 3G.":
    "Una plataforma ligera, que carga rápido, incluso en 3G.",
  "Prêt à rejoindre l'aventure ?": "¿Listo para unirte a la aventura?",
  "Créez votre compte gratuitement en moins d'une minute.":
    "Crea tu cuenta gratis en menos de un minuto.",
  "Créer mon compte": "Crear mi cuenta",
  "💬 Contact": "💬 Contacto",
  "Comment pouvons-nous vous aider ?": "¿Cómo podemos ayudarte?",
  "Une question, une suggestion, un souci ? Écrivez-nous, nous répondons vite.":
    "¿Una pregunta, una sugerencia, un problema? Escríbenos, respondemos rápido.",
  "Nos coordonnées": "Nuestros datos de contacto",
  "Le moyen le plus rapide de nous joindre.": "La forma más rápida de contactarnos.",
  "Écrire sur WhatsApp": "Escribir por WhatsApp",
  Téléphone: "Teléfono",
  "Appelez-nous aux heures de travail.": "Llámanos en horario laboral.",
  "Pour les demandes écrites détaillées.": "Para solicitudes escritas detalladas.",
  "Envoyer un message": "Enviar un mensaje",
  "Votre message est transmis directement sur notre WhatsApp.":
    "Tu mensaje se envía directamente a nuestro WhatsApp.",
  Sujet: "Asunto",
  "Choisir un sujet…": "Elige un asunto…",
  "Question sur une offre": "Pregunta sobre una oferta",
  "Je veux vendre sur Mboppi": "Quiero vender en Mboppi",
  "Problème de compte": "Problema de cuenta",
  Autre: "Otro",
  "Écrivez votre message ici…": "Escribe tu mensaje aquí…",
  "Bonjour Mboppi, je suis {name}.": "Hola Mboppi, soy {name}.",
  "un visiteur": "un visitante",
  "📦 Quelles données sont collectées ?": "📦 ¿Qué datos se recopilan?",
  "Lors de votre inscription : votre nom, votre e-mail et votre rôle (boutique, vendeur, client ou créateur). Si vous vous connectez avec Google, seul votre e-mail Google est utilisé. Selon votre rôle, vous pouvez publier des produits, des offres avec photos, et vos ventes sont enregistrées dans votre espace.":
    "Al registrarte: tu nombre, tu correo electrónico y tu rol (tienda, vendedor, cliente o creador). Si inicias sesión con Google, solo se usa tu correo de Google. Según tu rol, puedes publicar productos, ofertas con fotos, y tus ventas se registran en tu espacio.",
  "🔐 Comment sont-elles stockées ?": "🔐 ¿Cómo se almacenan?",
  "Toutes les données sont enregistrées dans une base de données PostgreSQL hébergée et sécurisée. Les mots de passe sont hachés (chiffrés de façon irréversible) : personne, même l'équipe Mboppi, ne peut lire votre mot de passe. Toutes les connexions passent par un protocole sécurisé (HTTPS).":
    "Todos los datos se guardan en una base de datos PostgreSQL alojada y segura. Las contraseñas se almacenan con hash (cifradas de forma irreversible): nadie, ni siquiera el equipo de Mboppi, puede leer tu contraseña. Todas las conexiones usan un protocolo seguro (HTTPS).",
  "⏳ Combien de temps sont-elles conservées ?": "⏳ ¿Cuánto tiempo se conservan?",
  "Vos données restent enregistrées aussi longtemps que votre compte existe. Les offres et produits que vous retirez sont supprimés définitivement, avec leurs photos. Aucune donnée n'est vendue ni transmise à des tiers.":
    "Tus datos permanecen guardados mientras tu cuenta exista. Las ofertas y productos que retiras se eliminan definitivamente, junto con sus fotos. Ningún dato se vende ni se transmite a terceros.",
  "👀 Qui peut les voir ?": "👀 ¿Quién puede verlos?",
  "Seule la personne concernée accède à son espace : une boutique voit ses produits, un vendeur ses ventes et commissions. Les offres de la vitrine sont publiquement visibles par les visiteurs, mais sans vos informations de compte.":
    "Solo la persona interesada accede a su espacio: una tienda ve sus productos, un vendedor sus ventas y comisiones. Las ofertas del escaparate son visibles públicamente para los visitantes, pero sin tus datos de cuenta.",
  "💳 Aucun paiement en ligne": "💳 Sin pagos en línea",
  "Mboppi ne demande jamais de numéro de carte bancaire. Les commandes passent par téléphone ou WhatsApp, et le paiement se fait directement avec le vendeur.":
    "Mboppi nunca pide el número de tu tarjeta bancaria. Los pedidos se hacen por teléfono o WhatsApp, y el pago se hace directamente con el vendedor.",
  "🗑️ Supprimer vos données": "🗑️ Eliminar tus datos",
  "Vous pouvez retirer vos offres et produits à tout moment depuis votre espace.":
    "Puedes retirar tus ofertas y productos en cualquier momento desde tu espacio.",
  "Pour supprimer votre compte, contactez-nous via la page":
    "Para eliminar tu cuenta, contáctanos a través de la página",
  "et nous le supprimerons rapidement.": "y la eliminaremos rápidamente.",
  "Partager ma vitrine": "Compartir mi escaparate",
  "📲 Partager via l'appareil": "📲 Compartir a través del dispositivo",
  "Ma vitrine Mboppi": "Mi escaparate Mboppi",
  "Découvre ma vitrine Mboppi": "Descubre mi escaparate Mboppi",
  "Copier le lien": "Copiar el enlace",
  "✨ **Une offre pour presque chaque besoin !**\n🔥 Découvrez ma vitrine et explorez une sélection d'offres et de solutions dans plusieurs domaines.\n\nQue tu recherches une opportunité, un service, un produit ou simplement quelque chose d'intéressant à découvrir, **tu pourrais bien trouver ton bonheur.** 👀\n\n👉 **Découvre la vitrine ici :**\n🔗 {url}\n\n🚀 *Un clic, plusieurs possibilités !*":
    "✨ **¡Una oferta para casi cada necesidad!**\n🔥 Descubre mi escaparate y explora una selección de ofertas y soluciones en varios ámbitos.\n\nYa busques una oportunidad, un servicio, un producto o simplemente algo interesante por descubrir, **tal vez encuentres lo que buscas.** 👀\n\n👉 **Descubre el escaparate aquí:**\n🔗 {url}\n\n🚀 *¡Un clic, varias posibilidades!*",
  "Électronique & Téléphones": "Electrónica y Teléfonos",
  "Téléphones & Tablettes": "Teléfonos y Tablets",
  "Ordinateurs & Accessoires": "Computadoras y Accesorios",
  "TV, Audio & Vidéo": "TV, Audio y Video",
  "Consoles & Jeux vidéo": "Consolas y Videojuegos",
  "Mode & Vêtements": "Moda y Ropa",
  Chaussures: "Calzado",
  "Sacs & Accessoires": "Bolsos y Accesorios",
  "Beauté & Cosmétiques": "Belleza y Cosméticos",
  Parfums: "Perfumes",
  "Soins capillaires": "Cuidado capilar",
  "Bijoux & Montres": "Joyería y Relojes",
  "Maison & Déco": "Hogar y Decoración",
  Meubles: "Muebles",
  "Cuisine & Ustensiles": "Cocina y Utensilios",
  "Linge de maison": "Ropa de hogar",
  Électroménager: "Electrodomésticos",
  "Alimentation & Épicerie": "Alimentación y Supermercado",
  "Produits frais & Marché": "Productos frescos y Mercado",
  Boissons: "Bebidas",
  "Santé & Bien-être": "Salud y Bienestar",
  "Sport & Fitness": "Deporte y Fitness",
  "Jouets & Jeux": "Juguetes y Juegos",
  "Bébé & Enfants": "Bebé y Niños",
  "Papeterie & Bureau": "Papelería y Oficina",
  "Livres & Formation": "Libros y Formación",
  "Arts & Artisanat": "Arte y Artesanía",
  "Auto & Moto": "Auto y Moto",
  "Jardin & Extérieur": "Jardín y Exterior",
  "Animaux & Accessoires": "Animales y Accesorios",
  "Services & Prestations": "Servicios y Prestaciones",
  Immobilier: "Inmobiliaria",
  "Mes favoris": "Mis favoritos",
  "Mon panier": "Mi carrito",
  "Votre panier est vide.": "Tu carrito está vacío.",
  "Parcourir les produits": "Explorar los productos",
  "Ajouter au panier": "Agregar al carrito",
  "Ajouté au panier ✓": "Agregado al carrito ✓",
  "Ajouter aux favoris": "Agregar a favoritos",
  "Retirer des favoris": "Quitar de favoritos",
  "Articles ({n})": "Artículos ({n})",
  "Les frais de livraison sont confirmés avec la boutique.":
    "Los gastos de envío se confirman con la tienda.",
  "Connectez-vous pour passer commande.": "Inicia sesión para hacer tu pedido.",
  "Votre nom *": "Tu nombre *",
  "Votre téléphone": "Tu teléfono",
  "Adresse de livraison": "Dirección de entrega",
  "Quartier, ville…": "Barrio, ciudad…",
  "Passer la commande": "Hacer el pedido",
  "Commande en cours…": "Realizando pedido…",
  "Commande enregistrée !": "¡Pedido registrado!",
  "Commande enregistrée": "Pedido registrado",
  "Merci {name} ! Votre commande #{id} est bien enregistrée.":
    "¡Gracias {name}! Tu pedido #{id} ha sido registrado.",
  "Confirmez-la maintenant sur WhatsApp pour la finaliser.":
    "Confírmalo ahora en WhatsApp para finalizarlo.",
  "Confirmer sur WhatsApp": "Confirmar por WhatsApp",
  "Voir mes commandes": "Ver mis pedidos",
  "Aucune commande pour le moment.": "No hay pedidos por el momento.",
  "Mes commandes": "Mis pedidos",
  "📦 Mes commandes": "📦 Mis pedidos",
  "Commande #{id}": "Pedido #{id}",
  "En attente": "Pendiente",
  Expédiée: "Enviado",
  "Suivre sur WhatsApp": "Seguir por WhatsApp",
  "Bonjour Mboppi, je souhaite suivre ma commande #{id}.":
    "Hola Mboppi, quiero seguir mi pedido #{id}.",
  "Bonjour Mboppi, je souhaite confirmer ma commande #{id} :":
    "Hola Mboppi, quiero confirmar mi pedido #{id}:",
  "Total : {total} F": "Total: {total} F",
  "Nom : {name}": "Nombre: {name}",
  "Téléphone : {phone}": "Teléfono: {phone}",
  "Adresse : {address}": "Dirección: {address}",
  "Toutes les catégories": "Todas las categorías",
  "Plus récents": "Más recientes",
  "🔥 Plus populaires": "🔥 Más populares",
  "Prix croissant": "Precio de menor a mayor",
  "Prix décroissant": "Precio de mayor a menor",
  vendus: "vendidos",
  "✨ Produits similaires": "✨ Productos similares",
  Partager: "Compartir",
  "Lien copié !": "¡Enlace copiado!",
  "Aucun favori pour le moment.": "No hay favoritos por el momento.",
  "Finalisez vos commandes en quelques clics.": "Finaliza tus pedidos en unos clics.",
  "Retrouvez les produits que vous avez aimés.": "Encuentra los productos que te gustaron.",
  "En attente de vente": "Pendiente de venta",
  "Générez votre code vendeur pour vendre.": "Genera tu código de vendedor para vender.",
  "Commandez « {name} » sur Mboppi avec le code vendeur {code}":
    "Pide « {name} » en Mboppi con el código de vendedor {code}",
  "Découvrez cet article sur Mboppi : {name}": "Descubre este artículo en Mboppi: {name}",
  Localisation: "Ubicación",
  "Mes moyens de paiement": "Mis medios de pago",
  "Ces informations seront visibles par les boutiques pour vous payer vos commissions.":
    "Esta información será visible para las tiendas que te pagan tus comisiones.",
  "Enregistrez vos portefeuilles électroniques pour recevoir vos commissions.":
    "Guarda tus billeteras electrónicas para recibir tus comisiones.",
  "{count} moyen(s) de paiement enregistré(s).": "{count} medio(s) de pago registrado(s).",
  "Nom complet (tel qu'il apparaît sur le compte)":
    "Nombre completo (tal como aparece en la cuenta)",
  "Portefeuilles électroniques": "Billeteras electrónicas",
  "Cochez vos portefeuilles et entrez le numéro associé.":
    "Marca tus billeteras e introduce el número asociado.",
  Numéro: "Número",
  "Enregistrer mes moyens de paiement": "Guardar mis medios de pago",
  "Ajoutez au moins un portefeuille avec son numéro.":
    "Agrega al menos una billetera con su número.",
  "Moyens de paiement enregistrés !": "¡Medios de pago guardados!",
  "Ces informations seront visibles par vos clients sur le formulaire de commande.":
    "Esta información será visible para tus clientes en el formulario de pedido.",
  "Enregistrez vos portefeuilles électroniques pour recevoir les paiements de vos clients.":
    "Guarda tus billeteras electrónicas para recibir los pagos de tus clientes.",
  "En espèces (à la livraison)": "En efectivo (a la entrega)",
  "Portefeuille (Mobile Money)": "Billetera (Mobile Money)",
  "Envoyez le paiement à la boutique sur l'un de ces portefeuilles :":
    "Envía el pago a la tienda a una de estas billeteras:",
  "Titulaire : {name}": "Titular: {name}",
  "Indiquez votre nom et votre numéro lors du transfert pour faciliter la livraison.":
    "Indica tu nombre y tu número al hacer la transferencia para facilitar la entrega.",
  "La boutique n'a pas encore configuré ses portefeuilles de paiement. Paiement à la livraison recommandé.":
    "La tienda aún no ha configurado sus billeteras de pago. Se recomienda el pago a la entrega.",
  "Moyens de paiement": "Medios de pago",
  "La boutique n'a pas configuré de portefeuille.": "La tienda no ha configurado una billetera.",
  "Vérone · Assistante Mboppi": "Vérone · Asistente Mboppi",
  "En ligne": "En línea",
  "Écrivez votre question…": "Escribe tu pregunta…",
  "Bonjour 👋 Je suis Vérone, l'assistante Mboppi. Posez-moi vos questions sur la boutique, les commandes, les paiements ou la livraison !":
    "¡Hola 👋 Soy Vérone, la asistente de Mboppi. Pregúntame sobre la tienda, los pedidos, los pagos o la entrega!",
  "Une erreur est survenue. Réessayez ou contactez-nous via la page Contact.":
    "Se produjo un error. Inténtalo de nuevo o contáctanos a través de la página de Contacto.",
  "Le chatbot n'est pas encore configuré (clé IA manquante côté serveur).":
    "El chatbot aún no está configurado (falta la clave de IA en el servidor).",
  Envoyer: "Enviar",
  "Nom et prénom *": "Nombre y apellido *",
  "Ville *": "Ciudad *",
  "Adresse / Quartier *": "Dirección / Barrio *",
  "Numéro de téléphone *": "Número de teléfono *",
  "Confirmer la Commande": "Confirmar el Pedido",
  Commander: "Pedir",
  "Commande confirmée !": "¡Pedido confirmado!",
  "Votre article est en attente de vente. La boutique et le vendeur ont été notifiés et vous contacteront pour la livraison. Retrouvez cette commande dans votre espace client.":
    "Tu artículo está pendiente de venta. La tienda y el vendedor han sido notificados y te contactarán para la entrega. Encuentra este pedido en tu espacio cliente.",
  "Vous devez être connecté pour confirmer la commande.":
    "Debes iniciar sesión para confirmar el pedido.",
  "Ce produit vous est proposé par un vendeur Mboppi. Remplissez vos informations pour confirmer votre commande. Aucun compte requis.":
    "Este producto te lo ofrece un vendedor de Mboppi. Completa tus datos para confirmar tu pedido. No se requiere cuenta.",
  "Confirmez votre commande : la boutique et le vendeur seront notifiés.":
    "Confirma tu pedido: la tienda y el vendedor serán notificados.",
  "Ce produit vous est proposé par un vendeur Mboppi. Remplissez vos informations pour confirmer votre commande.":
    "Este producto te lo ofrece un vendedor de Mboppi. Completa tus datos para confirmar tu pedido.",
  "Nouvelle commande pour « {product} » — {buyer}.": "Nuevo pedido de « {product} » — {buyer}.",
  "Nouvelle commande pour « {product} » — vendeur : {seller} ({code}).":
    "Nuevo pedido de « {product} » — vendedor: {seller} ({code}).",
  "Votre commande « {product} » a été livrée.": "Tu pedido « {product} » ha sido entregado.",
  "Votre commande « {product} » a été annulée comme demandé.":
    "Tu pedido « {product} » ha sido cancelado como solicitaste.",
  "Votre vente de « {product} » a été annulée par le client.":
    "Tu venta de « {product} » ha sido cancelada por el cliente.",
  "Commande « {product} » de {buyer} annulée par le client.":
    "Pedido de « {product} » de {buyer} cancelado por el cliente.",
  "Nouvelle commande pour « {product} » — {buyer}. Article en attente de vente.":
    "Nuevo pedido de « {product} » — {buyer}. Artículo pendiente de venta.",
  "Nouvelle commande pour « {product} » — vendeur : {seller} ({code}). Article en attente de vente.":
    "Nuevo pedido de « {product} » — vendedor: {seller} ({code}). Artículo pendiente de venta.",
  "Votre vente de « {product} » a été livrée à {buyer}.":
    "Tu venta de « {product} » ha sido entregada a {buyer}.",
  "Vente de « {product} » livrée — vendeur : {seller} ({code}), acheteur : {buyer}.":
    "Venta de « {product} » entregada — vendedor: {seller} ({code}), comprador: {buyer}.",
  Livreur: "Repartidor",
  livreur: "repartidor",
  "Mes livraisons": "Mis entregas",
  Livraison: "Entrega",
  "Je livre les articles commandés et je confirme l'achat":
    "Entrego los artículos pedidos y confirmo la compra",
  "Livrez les articles en attente de vente et confirmez l'achat auprès du client.":
    "Entrega los artículos pendientes de venta y confirma la compra con el cliente.",
  "Articles en attente de vente": "Artículos pendientes de venta",
  "Aucun article en attente pour le moment.": "No hay artículos pendientes por el momento.",
  "Vendeur : {seller}": "Vendedor: {seller}",
  Livrer: "Entregar",
  Livré: "Entregado",
  "Livré le {date}": "Entregado el {date}",
  "Mes livraisons effectuées": "Mis entregas realizadas",
  "Aucune livraison effectuée pour le moment.": "No se han realizado entregas por el momento.",
  "Voir la facture": "Ver la factura",
  Facture: "Factura",
  "Facture livrée": "Factura de entrega",
  "Aucune vente livrée pour le moment.": "No hay ventas entregadas por el momento.",
  Propriétaire: "Propietario",
  "Montant article": "Importe del artículo",
  "Frais de livraison ({symbol}) *": "Gastos de envío ({symbol}) *",
  "Paiement *": "Pago *",
  "En Espèce": "En Efectivo",
  "Par Mobile": "Por Móvil",
  "En ligne (auto)": "En línea (auto)",
  "Le client recevra une demande de paiement mobile money sur son téléphone. Confirmez l'opérateur et son numéro.":
    "El cliente recibirá una solicitud de pago por dinero móvil en su teléfono. Confirma su operador y número.",
  Opérateur: "Operador",
  "Numéro du client": "Número del cliente",
  "Demande de paiement envoyée !": "¡Solicitud de pago enviada!",
  "Ouvrir le lien de paiement": "Abrir enlace de pago",
  "Envoyer la demande de paiement": "Enviar solicitud de pago",
  "Confirmer l'Achat": "Confirmar la Compra",
  "Achat confirmé ! La facture a été téléchargée.":
    "¡Compra confirmada! La factura se ha descargado.",
  "Facture N°": "Factura Nº",
  "Date de livraison": "Fecha de entrega",
  Nom: "Nombre",
  "Code vendeur": "Código de vendedor",
  "Prix unitaire": "Precio unitario",
  "Total à payer": "Total a pagar",
  "Facture générée par Mboppi — marchandise livrée.":
    "Factura generada por Mboppi — mercancía entregada.",
  "Facture générée par Mboppi.": "Factura generada por Mboppi.",
  "Payer le Vendeur": "Pagar al Vendedor",
  "Payer le vendeur": "Pagar al vendedor",
  "Vendeur payé": "Vendedor pagado",
  "Commission en attente": "Comisión pendiente",
  "Commission non payée": "Comisión no pagada",
  "Cette vente ne peut pas être supprimée tant que sa commission n'est pas payée.":
    "Esta venta no puede eliminarse mientras su comisión no esté pagada.",
  "Cette vente ne peut pas être retirée tant que sa commission n'est pas payée.":
    "Esta venta no puede retirarse mientras su comisión no esté pagada.",
  "Vente supprimée.": "Venta eliminada.",
  "Commission supprimée.": "Comisión eliminada.",
  "Supprimer cette commission de parrainage « {name} » ?":
    "¿Eliminar esta comisión de referidos « {name} »?",
  "Vous pouvez retirer une vente livrée (ou une commission de parrainage) uniquement une fois sa commission payée.":
    "Puedes retirar una venta entregada (o una comisión de referidos) solo una vez que su comisión esté pagada.",
  "Commission payée": "Comisión pagada",
  "Commissions à verser": "Comisiones por pagar",
  "Commission à verser": "Comisión por pagar",
  "Commissions versées": "Comisiones pagadas",
  Livraisons: "Entregas",
  "Commissions pour les vendeurs": "Comisiones para los vendedores",
  "Moyens de paiement du vendeur": "Medios de pago del vendedor",
  "Le vendeur n'a pas encore enregistré de moyen de paiement.":
    "El vendedor aún no ha registrado un medio de pago.",
  "Preuve du paiement (photo ou vidéo) *": "Comprobante de pago (foto o video) *",
  "Preuve ajoutée ✓ (cliquez pour changer)": "Comprobante agregado ✓ (haz clic para cambiar)",
  Preuve: "Comprobante",
  "Confirmer le Paiement": "Confirmar el Pago",
  "Vendeur payé ! La preuve a été enregistrée.": "¡Vendedor pagado! Se ha guardado el comprobante.",
  "Vidéo trop lourde : limite 10 Mo.": "Video demasiado pesado: límite 10 MB.",
  Article: "Artículo",
  "Votre commission pour « {product} » a été payée par {shop}.":
    "Tu comisión por « {product} » ha sido pagada por {shop}.",
  "Publiez vos créations : elles rejoignent la catégorie Arts & Artisanat du marché.":
    "Publica tus creaciones: entran en la categoría Arte y Artesanía del mercado.",
  "+ Publier une création": "+ Publicar una creación",
  "Nouvelle création": "Nueva creación",
  "Modifier la création": "Modificar la creación",
  "Nom de la création *": "Nombre de la creación *",
  "Commission pour les vendeurs (%) *": "Comisión para los vendedores (%) *",
  "Création mise à jour !": "¡Creación actualizada!",
  "Création publiée avec succès.": "Creación publicada con éxito.",
  "Retirer cette création ?": "¿Quitar esta creación?",
  "Mes créations": "Mis creaciones",
  "Aucune création publiée pour le moment. Publiez votre première création !":
    "No hay creaciones publicadas por el momento. ¡Publica tu primera creación!",
  "Statistiques de mes créations": "Estadísticas de mis creaciones",
  Ville: "Ciudad",
  "Ville…": "Ciudad…",
  "📍 Ville de la boutique": "📍 Ciudad de la tienda",
  Adresse: "Dirección",
  "Frais de livraison": "Gastos de envío",
  Paiement: "Pago",
  "Mboppi est née d'une idée simple : permettre à chacun de vendre et d'acheter près de chez soi, sans commission écrasante et sans dépendre des grands sites. Ici, les boutiques publient leurs produits, les vendeurs gagnent des commissions, les créateurs exposent leurs talents et les clients trouvent tout au même endroit.":
    "Mboppi nació de una idea simple: permitir a cada uno vender y comprar cerca de casa, sin comisiones aplastantes y sin depender de los grandes sitios. Aquí, las tiendas publican sus productos, los vendedores ganan comisiones, los creadores exponen sus talentos y los clientes encuentran todo en un mismo lugar.",
  "Publiez vos produits et recevez les commandes de vos clients.":
    "Publica tus productos y recibe los pedidos de tus clientes.",
  Créateur: "Creador",
  "🛒 Mon panier": "🛒 Mi carrito",
  "Découvrir les produits": "Descubrir los productos",
  Message: "Mensaje",
  "Publiez et gérez vos créations.": "Publica y gestiona tus creaciones.",
  "Prix normal (barré, optionnel)": "Precio normal (tachado, opcional)",
  Publier: "Publicar",
  "Aucune vente enregistrée pour le moment.": "No hay ventas registradas por el momento.",
  "Livrez les articles commandés et confirmez l'achat.":
    "Entrega los artículos pedidos y confirma la compra.",
  "Livrer : {name}": "Entregar: {name}",
  "Découvrez « {name} » à {price} {symbol} sur Mboppi.":
    "Descubre « {name} » a {price} {symbol} en Mboppi.",
  "Comment vos données sont conservées": "Cómo se conservan tus datos",
  "La transparence est importante pour nous. Voici comment Mboppi collecte, stocke et protège vos données.":
    "La transparencia es importante para nosotros. Así recopila, almacena y protege Mboppi tus datos.",
  "Découvrez « {name} » à {price} {symbol} chez {shop} sur Mboppi.":
    "Descubre « {name} » a {price} {symbol} en {shop} en Mboppi.",
  "Confirmez votre commande avec le code du vendeur.":
    "Confirma tu pedido con el código del vendedor.",
  "Prix invalide": "Precio inválido",
  "Livré le": "Entregado el",
  "ex : 5000 (s'affiche barré)": "p. ej.: 5000 (se muestra tachado)",
  "ex : 3500 (s'affiche en vert)": "p. ej.: 3500 (se muestra en verde)",
  "📷 Ajouter une photo ou une vidéo": "📷 Agregar una foto o un video",
  "🔍 Rechercher une offre…": "🔍 Buscar una oferta…",
  Installer: "Instalar",
  "Installer l'application": "Instalar la aplicación",
  "Sur iPhone ou iPad : touchez Partager puis « Ajouter à l'écran d'accueil ».":
    "En iPhone o iPad: toca Compartir y luego «Agregar a la pantalla de inicio».",
  "Avis clients": "Reseñas de clientes",
  "{n} avis": "{n} reseñas",
  "Laisser un avis": "Dejar una reseña",
  "Choisissez une note de 1 à 5 étoiles.": "Elige una puntuación de 1 a 5 estrellas.",
  "Votre note": "Tu puntuación",
  "Votre commentaire (facultatif)": "Tu comentario (opcional)",
  "Partagez votre expérience avec ce produit…": "Comparte tu experiencia con este producto…",
  "Publier mon avis": "Publicar mi reseña",
  "Envoi…": "Enviando…",
  "Merci pour votre avis !": "¡Gracias por tu reseña!",
  "Connectez-vous": "Inicia sesión",
  "pour laisser un avis.": "para dejar una reseña.",
  "Aucun avis pour le moment. Soyez le premier !": "No hay reseñas por el momento. ¡Sé el primero!",
  Client: "Cliente",
  Vérifiée: "Verificada",
  "Boutique vérifiée": "Tienda verificada",
  "Contacter sur WhatsApp": "Contactar por WhatsApp",
  "Produits de la boutique": "Productos de la tienda",
  "Suivi de commande": "Seguimiento de pedido",
  "Entrez votre code client (reçu avec votre commande) pour suivre son état.":
    "Introduce tu código de cliente (recibido con tu pedido) para seguir su estado.",
  "Code client, ex : AB12CD3": "Código de cliente, p. ej.: AB12CD3",
  "Suivre ma commande": "Seguir mi pedido",
  "Lien de suivi": "Enlace de seguimiento",
  "Commande enregistrée": "Pedido registrado",
  "Commande confirmée": "Pedido confirmado",
  "Commande livrée": "Pedido entregado",
  "Cette commande a été annulée.": "Este pedido ha sido cancelado.",
  "Annuler la commande": "Cancelar el pedido",
  "Annuler cette commande ? Cette action est définitive.":
    "¿Cancelar este pedido? Esta acción es definitiva.",
  "Annuler cette commande « {name} » ? Cette action est définitive.":
    "¿Cancelar este pedido « {name} »? Esta acción es definitiva.",
  "Contacter le vendeur": "Contactar al vendedor",
  "Partager le suivi": "Compartir el seguimiento",
  "Votre code client : {code}": "Tu código de cliente: {code}",
  "Votre code client": "Tu código de cliente",
  "Bonjour {seller}, je suis {buyer}, je vous contacte à propos de ma commande « {product} » sur Mboppi.":
    "Hola {seller}, soy {buyer}, te contacto por mi pedido « {product} » en Mboppi.",
  "Bonjour {shop}, je vous contacte depuis Mboppi.": "Hola {shop}, te contacto desde Mboppi.",
  "Suivez ma commande « {product} » sur Mboppi : {url}":
    "Sigue mi pedido « {product} » en Mboppi: {url}",
  "La page que vous cherchez n'existe pas ou a été déplacée.":
    "La página que buscas no existe o ha sido movida.",
  Suggestions: "Sugerencias",
  Administration: "Administración",
  "Vue globale de la plateforme.": "Vista global de la plataforma.",
  Utilisateurs: "Usuarios",
  Boutiques: "Tiendas",
  Créateurs: "Creadores",
  Vendeurs: "Vendedores",
  Clients: "Clientes",
  Livreurs: "Repartidores",
  Ventes: "Ventas",
  "En attente": "Pendiente",
  "en attente": "pendiente",
  Livrées: "Entregadas",
  "Vente directe": "Venta directa",
  "Sans commission": "Sin comisión",
  Nombre: "Número",
  Code: "Código",
  Payées: "Pagadas",
  "Par boutique": "Por tienda",
  "Par vendeur": "Por vendedor",
  "Par statut": "Por estado",
  "Aucune transaction": "Sin transacciones",
  "Dernières transactions": "Últimas transacciones",
  "Transactions avec vendeur": "Transacciones con vendedor",
  "Commandes directes (panier)": "Pedidos directos (carrito)",
  "Montant commandes directes": "Importe de los pedidos directos",
  "💸 Toutes les transactions": "💸 Todas las transacciones",
  "Activité regroupée de tous les utilisateurs (boutiques, vendeurs, clients, livreurs, créateurs).":
    "Actividad conjunta de todos los usuarios (tiendas, vendedores, clientes, repartidores, creadores).",
  "Livraison supprimée de votre espace.": "Entrega eliminada de tu espacio.",
  "Inscrits aujourd'hui": "Registrados hoy",
  "Rechercher un utilisateur (nom ou email)…": "Buscar un usuario (nombre o correo)…",
  "Message de l'équipe Mboppi": "Mensaje del equipo de Mboppi",
  Suggestion: "Sugerencia",
  "Faire une suggestion": "Hacer una sugerencia",
  "Aidez-nous à améliorer Mboppi : votre message s'ouvrira dans WhatsApp.":
    "Ayúdanos a mejorar Mboppi: tu mensaje se abrirá en WhatsApp.",
  "Votre suggestion…": "Tu sugerencia…",
  "Envoyer sur WhatsApp": "Enviar por WhatsApp",
  "Messages aux utilisateurs": "Mensajes a los usuarios",
  "Envoyez un message qui s'affichera en popup à la prochaine connexion des utilisateurs (une seule fois).":
    "Envía un mensaje que se mostrará en una ventana emergente en el próximo inicio de sesión de los usuarios (una sola vez).",
  "À tous les utilisateurs": "A todos los usuarios",
  "À un utilisateur": "A un usuario",
  "Choisir un utilisateur…": "Elige un usuario…",
  "Message envoyé avec succès.": "Mensaje enviado con éxito.",
  "Messages envoyés": "Mensajes enviados",
  Destinataires: "Destinatarios",
  "Aucun message envoyé": "No se envió ningún mensaje",
  "Tous les utilisateurs": "Todos los usuarios",
  Compris: "Entendido",
  Newsletter: "Boletín",
  "Abonnés newsletter": "Suscriptores del boletín",
  "Envoyez une newsletter par email à tous les abonnés. Chaque abonné reçoit le lien de désabonnement automatiquement.":
    "Envía un boletín por correo electrónico a todos los suscriptores. Cada suscriptor recibe automáticamente el enlace de baja.",
  "Sujet de la newsletter": "Asunto del boletín",
  "Contenu de la newsletter…": "Contenido del boletín…",
  "Envoyer la newsletter": "Enviar boletín",
  "Aucun abonné pour le moment.": "Aún no hay suscriptores.",
  "Envoyer à {count} abonnés": "Enviar a {count} suscriptores",
  "Newsletter envoyée à {sent} abonnés.": "Boletín enviado a {sent} suscriptores.",
  "Newsletter envoyée à {sent} abonnés ({failed} échecs).":
    "Boletín enviado a {sent} suscriptores ({failed} errores).",
  Rôle: "Rol",
  Pays: "País",
  Inscription: "Registro",
  Vérifier: "Verificar",
  "Aucun utilisateur": "Sin usuarios",
  "Aucun produit": "Sin productos",
  admin: "admin",
  "Exporter CSV": "Exportar CSV",
  "Export…": "Exportando…",
  Ville: "Ciudad",
  Quantité: "Cantidad",
  Total: "Total",
  Commission: "Comisión",
  "Prix payé": "Precio pagado",
  Livraison: "Entrega",
  Statut: "Estado",
  CGV: "CGV",
  CGU: "CGU",
  "Mentions légales": "Aviso legal",
  "Conditions générales d'utilisation": "Condiciones generales de uso",
  "Les règles pour utiliser Mboppi en tant que boutique, vendeur, client ou créateur.":
    "Las reglas para usar Mboppi como tienda, vendedor, cliente o creador.",
  "J'ai lu et j'accepte les": "He leído y acepto las",
  "Vous devez accepter les Conditions Générales d'Utilisation pour vous inscrire.":
    "Debes aceptar las Condiciones Generales de Uso para registrarte.",
  "Mot de passe (8 caractères minimum)": "Contraseña (mínimo 8 caracteres)",
  "1. Objet et acceptation": "1. Objeto y aceptación",
  "Les présentes Conditions générales d'utilisation (CGU) régissent votre accès et votre utilisation de la plateforme Mboppi. En créant votre compte, vous acceptez pleinement et sans réserve ces conditions.":
    "Las presentes Condiciones generales de uso (CGU) rigen tu acceso y uso de la plataforma Mboppi. Al crear tu cuenta, aceptas plenamente y sin reservas estas condiciones.",
  "2. Création d'un compte": "2. Creación de una cuenta",
  "Vous vous engagez à fournir des informations exactes et à jour lors de votre inscription. Vous êtes responsable de la confidentialité de votre mot de passe et de toutes les actions réalisées avec votre compte.":
    "Te comprometes a proporcionar información exacta y actualizada al registrarte. Eres responsable de la confidencialidad de tu contraseña y de todas las acciones realizadas con tu cuenta.",
  "3. Les rôles sur Mboppi": "3. Los roles en Mboppi",
  "Mboppi met en relation des boutiques, des vendeurs, des clients et des créateurs. Chaque compte est associé à un rôle qui détermine les fonctionnalités disponibles : publier des produits, vendre, commander ou créer.":
    "Mboppi pone en contacto tiendas, vendedores, clientes y creadores. Cada cuenta está asociada a un rol que determina las funciones disponibles: publicar productos, vender, pedir o crear.",
  "4. Commandes et paiement": "4. Pedidos y pago",
  "Les commandes sont passées directement avec la boutique ou le vendeur. Aucun paiement n'est effectué en ligne sur Mboppi : le paiement se fait directement avec le vendeur ou le livreur, à la livraison ou par mobile money.":
    "Los pedidos se hacen directamente con la tienda o el vendedor. No se realiza ningún pago en línea en Mboppi: el pago se hace directamente con el vendedor o el repartidor, a la entrega o por dinero móvil.",
  "5. Commissions et parrainage": "5. Comisiones y referidos",
  "Les boutiques rémunèrent les vendeurs et les parrains par des commissions enregistrées sur la plateforme. Les montants et les modalités de réclamation et de paiement sont affichés dans les espaces vendeur, boutique et client.":
    "Las tiendas remuneran a los vendedores y padrinos con comisiones registradas en la plataforma. Los importes y las modalidades de reclamación y pago se muestran en los espacios vendedor, tienda y cliente.",
  "6. Contenu publié": "6. Contenido publicado",
  "Les boutiques, vendeurs et créateurs publient leurs propres produits, offres et créations. Ils sont seuls responsables de l'exactitude et de la légalité de leur contenu. Mboppi peut retirer tout contenu illicite ou inapproprié.":
    "Las tiendas, vendedores y creadores publican sus propios productos, ofertas y creaciones. Son los únicos responsables de la exactitud y legalidad de su contenido. Mboppi puede retirar cualquier contenido ilícito o inapropiado.",
  "7. Livraison": "7. Entrega",
  "La livraison est assurée par les boutiques ou des livreurs partenaires. Les délais et les frais sont indiqués sur chaque produit et convenus avec le vendeur ou la boutique lors de la commande.":
    "La entrega la realizan las tiendas o repartidores asociados. Los plazos y gastos se indican en cada producto y se acuerdan con el vendedor o la tienda al hacer el pedido.",
  "8. Comportement interdit": "8. Comportamiento prohibido",
  "Il est interdit d'utiliser la plateforme de manière frauduleuse : créer de fausses commandes, usurper une identité, publier des informations fausses ou trompeuses, ou tenter de contourner les règles de la plateforme.":
    "Está prohibido usar la plataforma de manera fraudulenta: crear pedidos falsos, suplantar una identidad, publicar información falsa o engañosa, o intentar eludir las reglas de la plataforma.",
  "9. Suspension et résiliation": "9. Suspensión y rescisión",
  "Mboppi peut suspendre ou supprimer un compte en cas de non-respect des présentes conditions. Vous pouvez supprimer votre compte à tout moment depuis votre espace « Mon compte ».":
    "Mboppi puede suspender o eliminar una cuenta en caso de incumplimiento de estas condiciones. Puedes eliminar tu cuenta en cualquier momento desde tu espacio «Mi cuenta».",
  "10. Données personnelles": "10. Datos personales",
  "Vos données personnelles sont traitées conformément à notre politique de confidentialité, consultable sur la page Données personnelles.":
    "Tus datos personales se tratan conforme a nuestra política de privacidad, consultable en la página Datos personales.",
  "11. Acceptation des conditions": "11. Aceptación de las condiciones",
  "En cochant la case lors de votre inscription, vous confirmez avoir lu et accepté ces Conditions générales d'utilisation. Pour toute question, contactez-nous via la page Contact.":
    "Al marcar la casilla al registrarte, confirmas que has leído y aceptado estas Condiciones generales de uso. Para cualquier pregunta, contáctanos a través de la página Contacto.",
  "Conditions générales de vente": "Condiciones generales de venta",
  "Les règles qui régissent les ventes sur Mboppi.": "Las reglas que rigen las ventas en Mboppi.",
  "Conditions générales": "Condiciones generales",
  "1. Rôle de la plateforme": "1. Rol de la plataforma",
  "Mboppi met en relation des boutiques, des créateurs, des vendeurs et des clients. Les ventes sont conclues directement entre l'acheteur et le vendeur ou la boutique. Mboppi ne perçoit aucun paiement en ligne.":
    "Mboppi pone en contacto tiendas, creadores, vendedores y clientes. Las ventas se cierran directamente entre el comprador y el vendedor o la tienda. Mboppi no recibe ningún pago en línea.",
  "2. Commandes": "2. Pedidos",
  "Une commande est enregistrée avec le nom et le code de l'acheteur. L'état de la commande (en attente, confirmée, livrée) peut être suivi sur la page de suivi. Une commande annulée ne donne lieu à aucun paiement.":
    "Un pedido se registra con el nombre y el código del comprador. El estado del pedido (pendiente, confirmado, entregado) puede seguirse en la página de seguimiento. Un pedido cancelado no da lugar a ningún pago.",
  "3. Paiement et livraison": "3. Pago y entrega",
  "Le paiement s'effectue directement avec le vendeur ou le livreur, à la livraison ou par mobile money. Les frais de livraison sont indiqués sur chaque produit. Mboppi ne stocke aucun moyen de paiement.":
    "El pago se realiza directamente con el vendedor o el repartidor, a la entrega o por dinero móvil. Los gastos de envío se indican en cada producto. Mboppi no almacena ningún medio de pago.",
  "4. Garanties et retours": "4. Garantías y devoluciones",
  "Les garanties éventuelles sont indiquées sur chaque produit. Les retours se traitent directement avec la boutique ou le vendeur. En cas de litige, Mboppi peut servir d'intermédiaire de médiation.":
    "Las posibles garantías se indican en cada producto. Las devoluciones se gestionan directamente con la tienda o el vendedor. En caso de disputa, Mboppi puede actuar como intermediario de mediación.",
  "5. Responsabilité": "5. Responsabilidad",
  "Mboppi ne peut être tenu responsable des produits vendus par les boutiques et vendeurs, ni des retards de livraison imputables aux livreurs. Les informations publiées le sont par les vendeurs eux-mêmes.":
    "Mboppi no puede ser considerado responsable de los productos vendidos por tiendas y vendedores, ni de los retrasos de entrega imputables a los repartidores. La información publicada la aportan los propios vendedores.",
  "6. Contact": "6. Contacto",
  "Pour toute question sur ces conditions, contactez-nous via la page Contact.":
    "Para cualquier pregunta sobre estas condiciones, contáctanos a través de la página Contacto.",
  FAQ: "FAQ",
  "Questions fréquentes": "Preguntas frecuentes",
  "Tout ce que vous devez savoir sur Mboppi.": "Todo lo que necesitas saber sobre Mboppi.",
  "Comment créer un compte ?": "¿Cómo crear una cuenta?",
  "Créez un compte gratuitement en moins d'une minute : choisissez votre rôle (boutique, vendeur, client ou créateur), renseignez votre nom et votre e-mail. Vous pouvez aussi vous connecter avec Google.":
    "Crea una cuenta gratis en menos de un minuto: elige tu rol (tienda, vendedor, cliente o creador), introduce tu nombre y tu correo. También puedes iniciar sesión con Google.",
  "Comment commander ?": "¿Cómo hacer un pedido?",
  "Ajoutez un produit à votre panier puis validez la commande avec vos coordonnées. Vous recevez un code client pour suivre votre commande sur la page de suivi. Vous pouvez aussi contacter directement la boutique sur WhatsApp.":
    "Agrega un producto a tu carrito y luego valida el pedido con tus datos. Recibes un código de cliente para seguir tu pedido en la página de seguimiento. También puedes contactar directamente con la tienda por WhatsApp.",
  "Comment payer ?": "¿Cómo pagar?",
  "Aucune carte bancaire n'est nécessaire. Le paiement se fait directement avec le vendeur ou le livreur, à la livraison ou par mobile money. Mboppi ne demande jamais de paiement en ligne.":
    "No se necesita ninguna tarjeta bancaria. El pago se hace directamente con el vendedor o el repartidor, a la entrega o por dinero móvil. Mboppi nunca pide un pago en línea.",
  "Comment devenir vendeur ?": "¿Cómo hacerse vendedor?",
  "Créez un compte avec le rôle « vendeur ». Vous recevrez un code vendeur à partager avec vos clients. Pour chaque vente, vous gagnez la commission affichée sur le produit.":
    "Crea una cuenta con el rol «vendedor». Recibirás un código de vendedor para compartir con tus clientes. Por cada venta, ganas la comisión mostrada en el producto.",
  "Comment est calculée ma commission ?": "¿Cómo se calcula mi comisión?",
  "La boutique choisit un pourcentage de commission pour chaque produit. Ce pourcentage est affiché sur la fiche produit. Le vendeur reçoit le montant total moins la commission de la boutique.":
    "La tienda elige un porcentaje de comisión para cada producto. Este porcentaje se muestra en la ficha del producto. El vendedor recibe el importe total menos la comisión de la tienda.",
  "Comment suivre ma commande ?": "¿Cómo seguir mi pedido?",
  "Utilisez la page « Suivi de commande » avec votre numéro de commande et votre code client. Vous y voyez l'état en temps réel : enregistrée, confirmée ou livrée.":
    "Usa la página «Seguimiento de pedido» con tu número de pedido y tu código de cliente. Allí ves el estado en tiempo real: registrado, confirmado o entregado.",
  "Comment contacter le support ?": "¿Cómo contactar con el soporte?",
  "Utilisez la page Contact ou écrivez-nous sur WhatsApp. Nous répondons généralement en moins de 24 heures.":
    "Usa la página Contacto o escríbenos por WhatsApp. Generalmente respondemos en menos de 24 horas.",
  "Puis-je supprimer mon compte ?": "¿Puedo eliminar mi cuenta?",
  "Oui, depuis votre espace « Mon compte ». Vos données sont alors supprimées définitivement de notre base.":
    "Sí, desde tu espacio «Mi cuenta». Entonces tus datos se eliminan definitivamente de nuestra base.",
  "Éditeur du site": "Editor del sitio",
  "Le site Mboppi est édité par l'équipe Mboppi. Pour toute question, utilisez la page Contact.":
    "El sitio Mboppi es editado por el equipo de Mboppi. Para cualquier pregunta, usa la página Contacto.",
  Hébergement: "Alojamiento",
  "Le site est hébergé par Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis. Les données sont stockées dans une base PostgreSQL hébergée par Neon.":
    "El sitio está alojado por Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, Estados Unidos. Los datos se almacenan en una base PostgreSQL alojada por Neon.",
  "Propriété intellectuelle": "Propiedad intelectual",
  "Les contenus publiés par les boutiques et vendeurs (produits, photos, descriptions) leur appartiennent. La marque et le nom Mboppi appartiennent à leurs propriétaires.":
    "Los contenidos publicados por tiendas y vendedores (productos, fotos, descripciones) les pertenecen. La marca y el nombre Mboppi pertenecen a sus propietarios.",
  "Mboppi utilise des cookies pour améliorer votre expérience (thème, langue, panier). Nous ne vendons aucune donnée.":
    "Mboppi usa cookies para mejorar tu experiencia (tema, idioma, carrito). No vendemos ningún dato.",
  Accepter: "Aceptar",
  "En savoir plus": "Saber más",
  Cookies: "Cookies",
  "Prix min": "Precio mín.",
  "Prix max": "Precio máx.",
  "Prix minimum": "Precio mínimo",
  "Prix maximum": "Precio máximo",
  "⭐ Mieux notés": "⭐ Mejor valorados",
  "{n} vendus": "{n} vendidos",
  "{n} en attente": "{n} pendientes",
  "Votre code de confirmation": "Tu código de confirmación",
  "Entrez votre code de confirmation (reçu avec votre commande) pour suivre son état.":
    "Introduce tu código de confirmación (recibido con tu pedido) para seguir su estado.",
  "Code de confirmation": "Código de confirmación",
  "Communiquez ce code au livreur lors de la remise pour valider la livraison.":
    "Comunica este código al repartidor en el momento de la entrega para validarla.",
  "Code de confirmation du client *": "Código de confirmación del cliente *",
  "Demandez ce code au client. Il l'a reçu à la commande et sur le suivi de commande.":
    "Pide este código al cliente. Lo recibió al hacer el pedido y en el seguimiento de pedido.",
  Confirmer: "Confirmar",
  "📈 Ventes des 14 derniers jours": "📈 Ventas de los últimos 14 días",
  "Graphique des ventes des 14 derniers jours": "Gráfico de ventas de los últimos 14 días",
  "vente(s)": "venta(s)",
  "🏆 Meilleurs produits": "🏆 Mejores productos",
  LIVRÉ: "ENTREGADO",
  FACTURE: "FACTURA",
  "Marché en ligne — livraison confirmée": "Mercado en línea — entrega confirmada",
  "Marché en ligne — commande enregistrée": "Mercado en línea — pedido registrado",
  "N°": "Nº",
  "Merci pour votre avis !": "¡Gracias por tu reseña!",
  "Mon lien de parrainage": "Mi enlace de referidos",
  "Partagez ce lien : chaque personne qui s'inscrit via ce lien devient votre filleul. Vous gagnez 2% du prix de chacun de ses achats (commission payée par la boutique).":
    "Comparte este enlace: cada persona que se registra a través de él se convierte en tu referido. Ganas el 2% del precio de cada una de sus compras (comisión pagada por la tienda).",
  "Copier le lien": "Copiar el enlace",
  "Générez d'abord votre code vendeur ci-dessus pour obtenir votre lien.":
    "Primero genera tu código de vendedor de arriba para obtener tu enlace.",
  Réclamer: "Reclamar",
  Réclamée: "Reclamada",
  "Paiement réclamé": "Pago reclamado",
  "Réclamer le paiement de vos commissions pour « {name} » à la boutique ?":
    "¿Reclamar el pago de tus comisiones por « {name} » a la tienda?",
  "Paiement réclamé ! La boutique a été notifiée.":
    "¡Pago reclamado! Se ha notificado a la tienda.",
  parrainage: "referidos",
  "Commission produit": "Comisión de producto",
  "Commission parrainage (2%)": "Comisión de referidos (2%)",
  "Vous vous inscrivez via le lien d'un vendeur Mboppi : votre inscription est gratuite, le rôle « Client » est sélectionné pour vous.":
    "Te registras a través del enlace de un vendedor de Mboppi: tu registro es gratis y el rol «Cliente» se selecciona automáticamente para ti.",
  "Code du vendeur (parrainage)": "Código del vendedor (referidos)",
  "Le vendeur {seller} réclame le paiement de sa commission pour « {product} ».":
    "El vendedor {seller} reclama el pago de su comisión por « {product} ».",
  "Voir tous les produits": "Ver todos los productos",
  "Voir par ville": "Ver por ciudad",
  "Choisir une ville…": "Elige una ciudad…",
  "Sélectionnez une ville pour voir les boutiques disponibles.":
    "Selecciona una ciudad para ver las tiendas disponibles.",
  "Aucune boutique dans cette ville pour le moment. Revenez bientôt !":
    "No hay tiendas en esta ciudad por el momento. ¡Vuelve pronto!",
  "{n} produits": "{n} productos",
  "Ville non renseignée": "Ciudad no indicada",
  "Saisir une ville (ex : Yaoundé)…": "Escribe una ciudad (p. ej.: Yaundé)…",
  "Saisissez une ville pour voir ses boutiques, ses créateurs et ses produits.":
    "Escribe una ciudad para ver sus tiendas, sus creadores y sus productos.",
  "Aucune boutique ni produit dans cette ville pour le moment.":
    "No hay tiendas ni productos en esta ciudad por el momento.",
  "Boutiques et créateurs": "Tiendas y creadores",
  "ex : +237 6 00 00 00 00": "p. ej.: +237 6 00 00 00 00",
  "Votre nom, votre adresse e-mail, votre numéro de téléphone et votre pays.":
    "Tu nombre, tu correo electrónico, tu número de teléfono y tu país.",
};

const RICH_EN = {
  "Une marketplace pensée pour le terrain": "A marketplace designed for real local commerce",
  "Mboppi rapproche la découverte en ligne de la relation commerciale locale.":
    "Mboppi brings online discovery closer to local business relationships.",
  "Des vitrines simples à partager": "Showcases that are easy to share",
  "Chaque produit dispose d’une fiche publique avec son prix, sa disponibilité, ses photos, sa catégorie, sa garantie éventuelle et les informations de la boutique. Les liens peuvent être partagés par WhatsApp ou sur les réseaux sociaux.":
    "Each product has a public page with its price, availability, photos, category, any warranty and shop information. Links can be shared on WhatsApp or social networks.",
  "Une vente suivie de bout en bout": "Sales tracked from start to finish",
  "La commande reçoit un code de confirmation. La boutique la traite, le livreur vérifie le code de la boutique et le client confirme la remise avec son propre code. Chaque étape reste compréhensible pour les personnes concernées.":
    "The order receives a confirmation code. The shop processes it, the rider checks the shop code and the customer confirms receipt with their own code. Every step remains clear to the people involved.",
  "Une rémunération lisible": "Clear remuneration",
  "La commission vendeur est affichée avant la vente. Le parrainage client représente 2 % pour le vendeur référent, et les frais de livraison sont saisis au moment de la livraison. Aucun frais de plateforme n’est ajouté aux montants reversés.":
    "The seller commission is displayed before the sale. Customer referrals represent 2% for the referring seller, and delivery fees are entered at delivery. No platform fee is added to amounts paid out.",
  "Les paiements sont manuels et directs : espèces à la livraison, Mobile Money ou virement bancaire. Mboppi ne prélève aucun frais de plateforme.":
    "Payments are manual and direct: cash on delivery, Mobile Money or bank transfer. Mboppi charges no platform fees.",
  "Pour les paiements manuels (espèces à la livraison, Mobile Money ou virement bancaire), aucun frais n'est appliqué.":
    "For manual payments (cash on delivery, Mobile Money or bank transfer), no fee is applied.",
  "Qu’est-ce qu’une promotion éclair ?": "What is a flash promotion?",
  "Une boutique peut proposer un produit à prix réduit pendant une durée limitée, au maximum 24 heures et une fois par semaine. Le produit est alors retiré des catalogues publics, mais reste accessible par son lien direct. La commission vendeur est de 0 % pendant la promotion.":
    "A shop can offer a product at a reduced price for a limited time, up to 24 hours and once per week. The product is removed from public catalogs but remains accessible through its direct link. The seller commission is 0% during the promotion.",
  "Comment fonctionne la livraison ?": "How does delivery work?",
  "La boutique remet au livreur un code boutique. Le livreur consulte les commandes associées, saisit les frais convenus et demande le code de confirmation du client au moment de la remise. La livraison est ensuite enregistrée dans la commande.":
    "The shop gives the rider a shop code. The rider views the associated orders, enters the agreed fee and requests the customer confirmation code at handover. The delivery is then recorded on the order.",
  "Que se passe-t-il si le produit est en rupture ?": "What happens if a product is out of stock?",
  "Le stock est vérifié et réservé au moment de la commande. Si la quantité disponible est insuffisante, la commande est refusée afin d’éviter de vendre un article indisponible.":
    "Stock is checked and reserved when the order is placed. If the available quantity is insufficient, the order is rejected to avoid selling an unavailable item.",
  "Comment fonctionne le parrainage ?": "How does referrals work?",
  "Lorsqu’un client s’inscrit avec le code vendeur d’un vendeur, il devient son client affilié. Les achats futurs de ce client génèrent 2 % pour le vendeur référent, sous réserve que la vente soit livrée. Le cumul est versé à partir de 1 500 XAF.":
    "When a customer registers with a seller code, they become that seller’s affiliated customer. Future purchases generate 2% for the referring seller once delivered. The accumulated amount is paid from 1,500 XAF.",
  "Puis-je commander sans compte ?": "Can I order without an account?",
  "Oui pour un achat direct. Vous devez fournir votre nom, téléphone, ville et adresse, puis conserver le code de confirmation reçu. Un compte est nécessaire pour retrouver automatiquement l’historique de ses achats.":
    "Yes, for a direct purchase. You must provide your name, phone number, city and address, then keep the confirmation code. An account is needed to automatically find your purchase history.",
  "Quels moyens de paiement sont acceptés ?": "Which payment methods are accepted?",
  "Les paiements sont directs et manuels : espèces à la livraison, transfert Mobile Money direct ou virement bancaire, selon ce qui est convenu avec le bénéficiaire. Mboppi ne demande jamais de carte bancaire et ne collecte pas les paiements.":
    "Payments are direct and manual: cash on delivery, direct Mobile Money transfer or bank transfer, as agreed with the beneficiary. Mboppi never asks for a bank card or collects payments.",
  "Lors de votre inscription, nous collectons votre nom, e-mail, rôle, pays et, selon les cas, téléphone, ville et quartier. Les commandes ajoutent les informations nécessaires à la livraison. Les boutiques, vendeurs et créateurs fournissent aussi les données de leurs produits, offres, photos et coordonnées professionnelles.":
    "When you register, we collect your name, email, role, country and, where applicable, phone number, city and neighborhood. Orders add the information needed for delivery. Shops, sellers and creators also provide product, offer, photo and business contact data.",
  "Les données sont stockées dans PostgreSQL, avec des contrôles d’accès côté serveur. Les mots de passe sont hachés avec bcrypt et ne sont jamais lisibles. Les sessions utilisent des jetons temporaires et les échanges avec le site sont protégés par HTTPS.":
    "Data is stored in PostgreSQL with server-side access controls. Passwords are hashed with bcrypt and are never readable. Sessions use temporary tokens and site exchanges are protected by HTTPS.",
  "Les données de compte sont conservées pendant la durée d’utilisation du compte et aussi longtemps que nécessaire pour l’historique des commandes, la sécurité et les obligations applicables. Les produits, offres et photos retirés sont supprimés lorsque le traitement le permet. Les données ne sont ni vendues ni utilisées pour de la publicité ciblée.":
    "Account data is kept while the account is used and as long as necessary for order history, security and applicable obligations. Removed products, offers and photos are deleted where processing allows. Data is neither sold nor used for targeted advertising.",
  "📊 Mesures d’audience": "📊 Audience measurement",
  "Mboppi mesure les visites de pages et les consultations de produits ou d’offres afin de comprendre l’utilisation du site et d’améliorer le service. Un identifiant technique peut être conservé dans votre navigateur ; il ne constitue pas un profil public et n’est pas vendu.":
    "Mboppi measures page visits and product or offer views to understand site usage and improve the service. A technical identifier may be stored in your browser; it is not a public profile and is not sold.",
  "🍪 Cookies et stockage local": "🍪 Cookies and local storage",
  "Le site utilise le stockage local du navigateur pour conserver votre session, votre panier, vos favoris, vos préférences de langue et certains choix d’affichage. Vous pouvez effacer ces données dans les réglages de votre navigateur ; cela peut supprimer votre panier ou vous déconnecter.":
    "The site uses browser local storage for your session, cart, favorites, language preferences and display choices. You can clear this data in your browser settings; this may remove your cart or sign you out.",
  "✉️ Vos droits": "✉️ Your rights",
  "Vous pouvez demander l’accès, la correction ou la suppression de vos données, ainsi que des précisions sur leur utilisation. Écrivez-nous depuis la page Contact en indiquant l’adresse e-mail associée à votre compte afin que nous puissions vérifier votre demande.":
    "You may request access, correction or deletion of your data, as well as information about its use. Contact us from the Contact page using the email address linked to your account so we can verify your request.",
};

const RICH_ES = {
  "Une marketplace pensée pour le terrain": "Un marketplace pensado para el comercio local",
  "Mboppi rapproche la découverte en ligne de la relation commerciale locale.":
    "Mboppi acerca el descubrimiento en línea a las relaciones comerciales locales.",
  "Des vitrines simples à partager": "Escaparates fáciles de compartir",
  "Une vente suivie de bout en bout": "Ventas seguidas de principio a fin",
  "Une rémunération lisible": "Una remuneración clara",
  "Qu’est-ce qu’une promotion éclair ?": "¿Qué es una promoción relámpago?",
  "Comment fonctionne la livraison ?": "¿Cómo funciona la entrega?",
  "Que se passe-t-il si le produit est en rupture ?": "¿Qué ocurre si un producto se agota?",
  "Comment fonctionne le parrainage ?": "¿Cómo funcionan las referencias?",
  "Puis-je commander sans compte ?": "¿Puedo pedir sin cuenta?",
  "Quels moyens de paiement sont acceptés ?": "¿Qué métodos de pago se aceptan?",
  "📊 Mesures d’audience": "📊 Medición de audiencia",
  "🍪 Cookies et stockage local": "🍪 Cookies y almacenamiento local",
  "✉️ Vos droits": "✉️ Tus derechos",
  "Chaque produit dispose d’une fiche publique avec son prix, sa disponibilité, ses photos, sa catégorie, sa garantie éventuelle et les informations de la boutique. Les liens peuvent être partagés par WhatsApp ou sur les réseaux sociaux.":
    "Cada producto tiene una ficha pública con su precio, disponibilidad, fotos, categoría, garantía e información de la tienda. Los enlaces se pueden compartir por WhatsApp o en redes sociales.",
  "La commande reçoit un code de confirmation. La boutique la traite, le livreur vérifie le code de la boutique et le client confirme la remise avec son propre code. Chaque étape reste compréhensible pour les personnes concernées.":
    "El pedido recibe un código de confirmación. La tienda lo procesa, el repartidor verifica el código de la tienda y el cliente confirma la entrega con su propio código.",
  "La commission vendeur est affichée avant la vente. Le parrainage client représente 2 % pour le vendeur référent, et les frais de livraison sont saisis au moment de la livraison. Aucun frais de plateforme n’est ajouté aux montants reversés.":
    "La comisión del vendedor se muestra antes de la venta. Las referencias de clientes representan el 2 % para el vendedor referente y los gastos de entrega se indican al entregar. No se añade ninguna comisión de plataforma.",
  "Le stock est vérifié et réservé au moment de la commande. Si la quantité disponible est insuffisante, la commande est refusée afin d’éviter de vendre un article indisponible.":
    "El stock se verifica y reserva al realizar el pedido. Si no hay suficiente cantidad, el pedido se rechaza para evitar vender un artículo no disponible.",
  "Lorsqu’un client s’inscrit avec le code vendeur d’un vendeur, il devient son client affilié. Les achats futurs de ce client génèrent 2 % pour le vendeur référent, sous réserve que la vente soit livrée. Le cumul est versé à partir de 1 500 XAF.":
    "Cuando un cliente se registra con el código de un vendedor, pasa a ser su cliente afiliado. Sus compras futuras generan un 2 % para el vendedor referente una vez entregadas. El acumulado se paga desde 1.500 XAF.",
  "Oui pour un achat direct. Vous devez fournir votre nom, téléphone, ville et adresse, puis conserver le code de confirmation reçu. Un compte est nécessaire pour retrouver automatiquement l’historique de ses achats.":
    "Sí, para una compra directa. Debes indicar tu nombre, teléfono, ciudad y dirección y conservar el código de confirmación. Se necesita una cuenta para consultar automáticamente el historial.",
  "Lors de votre inscription, nous collectons votre nom, e-mail, rôle, pays et, selon les cas, téléphone, ville et quartier. Les commandes ajoutent les informations nécessaires à la livraison. Les boutiques, vendeurs et créateurs fournissent aussi les données de leurs produits, offres, photos et coordonnées professionnelles.":
    "Al registrarte recopilamos tu nombre, correo, rol, país y, según el caso, teléfono, ciudad y barrio. Los pedidos añaden los datos necesarios para la entrega. Las tiendas, vendedores y creadores aportan también datos de productos, ofertas, fotos y contacto profesional.",
  "Les données sont stockées dans PostgreSQL, avec des contrôles d’accès côté serveur. Les mots de passe sont hachés avec bcrypt et ne sont jamais lisibles. Les sessions utilisent des jetons temporaires et les échanges avec le site sont protégés par HTTPS.":
    "Los datos se almacenan en PostgreSQL con controles de acceso del servidor. Las contraseñas se cifran con bcrypt y nunca son legibles. Las sesiones usan tokens temporales y las comunicaciones están protegidas por HTTPS.",
  "La création d’un compte et l’espace vendeur sont gratuits. Vous devez protéger vos identifiants, ne pas partager votre session et signaler rapidement toute utilisation non autorisée. Un compte peut être limité ou suspendu en cas de risque pour les utilisateurs ou la plateforme.":
    "Crear una cuenta y usar el espacio de vendedor es gratis. Debes proteger tus credenciales y avisar de cualquier uso no autorizado. Una cuenta puede limitarse o suspenderse si supone un riesgo.",
  "Le paiement est manuel et direct : espèces à la livraison, virement Mobile Money ou virement bancaire. Mboppi ne collecte aucun paiement et ne prélève aucun frais de plateforme.":
    "El pago es manual y directo: efectivo a la entrega, transferencia Mobile Money o transferencia bancaria. Mboppi no cobra pagos ni comisiones de plataforma.",
"Pour les paiements manuels (espèces à la livraison, Mobile Money ou virement bancaire), aucun frais n'est appliqué.":
    "Para los pagos manuales (efectivo a la entrega, Mobile Money o transferencia bancaria) no se aplica ninguna comisión.",
  "La boutique définit la commission affichée sur chaque produit. Le vendeur reçoit la commission liée à une vente réalisée avec son code. Le parrainage concerne un client affilié et représente 2 % du montant de ses achats livrés ; le cumul est versé à partir de 1 500 XAF. Les paiements aux bénéficiaires sont effectués manuellement par la boutique, sans frais de plateforme.":
    "La tienda define la comisión mostrada en cada producto. El vendedor recibe la comisión de una venta realizada con su código. Un cliente afiliado genera un 2 % sobre sus compras entregadas, pagado desde 1.500 XAF. La tienda paga manualmente, sin comisiones de plataforma.",
  "Le paiement se fait directement avec la boutique, le vendeur ou le livreur : espèces à la livraison, Mobile Money direct ou virement bancaire. Mboppi ne collecte pas les paiements et ne prélève aucun frais de plateforme. Les frais de livraison sont indiqués sur chaque produit.":
    "El pago se realiza directamente con la tienda, el vendedor o el repartidor: efectivo, Mobile Money directo o transferencia bancaria. Mboppi no cobra pagos ni comisiones de plataforma.",
  "Les garanties éventuelles sont indiquées sur chaque produit. Les retours se traitent directement avec la boutique ou le vendeur. En cas de litige, Mboppi peut servir d’intermédiaire de médiation.":
    "Las garantías aparecen en cada producto. Las devoluciones se gestionan directamente con la tienda o el vendedor. En caso de conflicto, Mboppi puede actuar como mediador.",
};

const RICH_AR = {
  "Une marketplace pensée pour le terrain": "سوق إلكترونية مصممة للتجارة المحلية",
  "Mboppi rapproche la découverte en ligne de la relation commerciale locale.":
    "تقرّب Mboppi الاكتشاف عبر الإنترنت من العلاقات التجارية المحلية.",
  "Des vitrines simples à partager": "واجهات سهلة المشاركة",
  "Une vente suivie de bout en bout": "متابعة البيع من البداية إلى النهاية",
  "Une rémunération lisible": "مكافآت واضحة",
  "Qu’est-ce qu’une promotion éclair ?": "ما هو العرض الخاطف؟",
  "Comment fonctionne la livraison ?": "كيف يتم التوصيل؟",
  "Que se passe-t-il si le produit est en rupture ?": "ماذا يحدث عند نفاد المنتج؟",
  "Comment fonctionne le parrainage ?": "كيف تعمل الإحالة؟",
  "Puis-je commander sans compte ?": "هل يمكنني الطلب دون حساب؟",
  "Quels moyens de paiement sont acceptés ?": "ما طرق الدفع المقبولة؟",
  "📊 Mesures d’audience": "📊 قياس الجمهور",
  "🍪 Cookies et stockage local": "🍪 ملفات تعريف الارتباط والتخزين المحلي",
  "✉️ Vos droits": "✉️ حقوقك",
  "Chaque produit dispose d’une fiche publique avec son prix, sa disponibilité, ses photos, sa catégorie, sa garantie éventuelle et les informations de la boutique. Les liens peuvent être partagés par WhatsApp ou sur les réseaux sociaux.":
    "لكل منتج صفحة عامة تتضمن السعر والتوفر والصور والفئة والضمان ومعلومات المتجر. يمكن مشاركة الروابط عبر واتساب أو الشبكات الاجتماعية.",
  "Une vente suivie de bout en bout": "متابعة البيع من البداية إلى النهاية",
  "La commande reçoit un code de confirmation. La boutique la traite, le livreur vérifie le code de la boutique et le client confirme la remise avec son propre code. Chaque étape reste compréhensible pour les personnes concernées.":
    "يحصل الطلب على رمز تأكيد. تعالجه المتجر، ويتحقق الموصّل من رمز المتجر، ويؤكد العميل الاستلام برمزه الخاص.",
  "La commission vendeur est affichée avant la vente. Le parrainage client représente 2 % pour le vendeur référent, et les frais de livraison sont saisis au moment de la livraison. Aucun frais de plateforme n’est ajouté aux montants reversés.":
    "تظهر عمولة البائع قبل البيع. تمنح إحالة العميل 2٪ للبائع المُحيل، وتُسجل رسوم التوصيل عند التسليم. لا تُضاف أي رسوم للمنصة.",
  "Les paiements sont manuels et directs : espèces à la livraison, Mobile Money ou virement bancaire. Mboppi ne prélève aucun frais de plateforme.":
    "المدفوعات يدوية ومباشرة: نقداً عند التسليم أو عبر Mobile Money أو التحويل البنكي. لا تفرض Mboppi أي رسوم منصة.",
"Pour les paiements manuels (espèces à la livraison, Mobile Money ou virement bancaire), aucun frais n'est appliqué.":
    "بالنسبة للمدفوعات اليدوية (نقداً عند التسليم، أو عبر Mobile Money أو التحويل البنكي) لا تُطبق أي رسوم.",
  "Le stock est vérifié et réservé au moment de la commande. Si la quantité disponible est insuffisante, la commande est refusée afin d’éviter de vendre un article indisponible.":
    "يتم التحقق من المخزون وحجزه عند الطلب. إذا لم تكن الكمية كافية، يُرفض الطلب لتجنب بيع منتج غير متوفر.",
  "Quels moyens de paiement sont acceptés ?": "ما طرق الدفع المقبولة؟",
  "Les paiements sont directs et manuels : espèces à la livraison, transfert Mobile Money direct ou virement bancaire, selon ce qui est convenu avec le bénéficiaire. Mboppi ne demande jamais de carte bancaire et ne collecte pas les paiements.":
    "المدفوعات مباشرة ويدوية: نقداً عند التسليم أو تحويل Mobile Money مباشر أو تحويل بنكي، حسب الاتفاق مع المستفيد. لا تطلب Mboppi بطاقة مصرفية ولا تحصّل المدفوعات.",
  "Lors de votre inscription, nous collectons votre nom, e-mail, rôle, pays et, selon les cas, téléphone, ville et quartier. Les commandes ajoutent les informations nécessaires à la livraison. Les boutiques, vendeurs et créateurs fournissent aussi les données de leurs produits, offres, photos et coordonnées professionnelles.":
    "عند التسجيل نجمع الاسم والبريد والدور والبلد، وعند الحاجة الهاتف والمدينة والحي. تضيف الطلبات المعلومات اللازمة للتوصيل. كما يقدم المتجر والبائع والمبدع بيانات المنتجات والعروض والصور وبيانات الاتصال المهنية.",
  "Les données sont stockées dans PostgreSQL, avec des contrôles d’accès côté serveur. Les mots de passe sont hachés avec bcrypt et ne sont jamais lisibles. Les sessions utilisent des jetons temporaires et les échanges avec le site sont protégés par HTTPS.":
    "تُخزن البيانات في PostgreSQL مع ضوابط وصول على الخادم. تُجزأ كلمات المرور بواسطة bcrypt ولا يمكن قراءتها. تستخدم الجلسات رموزاً مؤقتة وتحمي HTTPS الاتصالات.",
  "La création d’un compte et l’espace vendeur sont gratuits. Vous devez protéger vos identifiants, ne pas partager votre session et signaler rapidement toute utilisation non autorisée. Un compte peut être limité ou suspendu en cas de risque pour les utilisateurs ou la plateforme.":
    "إنشاء الحساب ومساحة البائع مجانيان. يجب حماية بيانات الدخول والإبلاغ عن أي استخدام غير مصرح به. قد يُقيّد الحساب أو يُعلّق عند وجود خطر.",
  "Le paiement est manuel et direct : espèces à la livraison, virement Mobile Money ou virement bancaire. Mboppi ne collecte aucun paiement et ne prélève aucun frais de plateforme.":
    "الدفع يدوي ومباشر: نقداً عند التسليم أو تحويل Mobile Money أو تحويل بنكي. لا تحصّل Mboppi أي مدفوعات ولا تفرض رسوم منصة.",
  "Les garanties éventuelles sont indiquées sur chaque produit. Les retours se traitent directement avec la boutique ou le vendeur. En cas de litige, Mboppi peut servir d’intermédiaire de médiation.":
    "تُذكر الضمانات المحتملة في صفحة كل منتج. تُعالج المرتجعات مباشرة مع المتجر أو البائع. عند النزاع يمكن لـ Mboppi التوسط.",
};

export const I18N = {
  fr: {},
  en: { ...EN, ...RICH_EN },
  ar: { ...AR, ...RICH_AR },
  es: { ...ES, ...RICH_ES },
};

function tr(str, vars, lang) {
  let out = (I18N[lang] && I18N[lang][str]) ?? str;
  if (vars) {
    for (const k of Object.keys(vars)) {
      out = out.split(`{${k}}`).join(String(vars[k]));
    }
  }
  return out;
}

const LangContext = createContext();

export function LangProvider({ children }) {
  const [lang, setLang] = useState("fr");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lang");
      if (saved) setLang(saved);
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem("lang", lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t: (str, vars) => tr(str, vars, lang),
      locale: lang === "ar" ? "ar-MA" : lang === "en" ? "en-GB" : lang === "es" ? "es-ES" : "fr-FR",
    }),
    [lang]
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
