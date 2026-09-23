// ─── Dictionnaire de travail du correcteur de « mots collés » ───────────────
// Mots français fréquents (≥ 3 lettres) servant UNIQUEMENT à valider une
// coupure — jamais de découpage au hasard :
//   • règle « majuscule collée »  : le fragment de gauche doit être un mot connu
//     (ou le fragment de droite pour un mot de 2 lettres : « leChapitre ») ;
//   • règle « mots agglutinés »   : les DEUX moitiés doivent être des mots
//     connus, d'au moins 5 lettres chacune.
// Volontairement ABSENTS : les suffixes isolés (ment, tion, sion, aire, ance,
// ence, isme, iste, able, ible, ique, eur, euse) qui feraient couper des mots
// parfaitement valides (« principalement », « parlementaire »…).
const WORDS = `
abord aboutir absence absolu abstrait accent accepter accident accompagnement
accomplir accord accueil acheter acheteur acheteuse activité actuel actuelle
adapter addition adhésion admettre administration admirer adolescence adopter
adresse adresser affaire afficher affirmer agence agenda agrandir ailleurs aider
aimer ainsi ajouter album aliment alliance allonger alors altitude ambiance
améliorer amener amour ample analyse ancien ancienne anglais animal animation
année anniversaire annoncer annuler apercevoir appareil apparent appel appeler
application appliquer apporter apprendre apprentissage approche approuver appui
après arbre argent armoire arrangement arrêter arrivée arriver article artiste
aspect assemblée assez assistance association assurance assurer atelier atout
attaque atteindre attendre attention atterrir attirer attraper auteur authentique
auto automatique autorité autour autre autrefois avance avancer avant avantage
avenir aventure avertir avion avis avocat avoir bagage bague baisser balade
balance ballon banane banque barre base basket bataille bâtiment bâtir battre
beau beaucoup beauté besoin bibliothèque bien bientôt bilan billet biographie
bizarre blanc blanche blesser bleu blog boire boisson boîte bond bonheur bonjour
bord bouche bouger boule bout boutique bras brave bref bricolage briller briser
brouillon bruit brume budget buffet bureau cabinet câble cadeau cadre caisse
calcul calendrier calme caméra camion campagne canal candidat capable capacité
capitaine capital capitale car carnet carotte carré carrière carte cartable
casier casque casser catalogue catégorie cause cavalier ceci célèbre celle celles
celui cependant certain certaine certes cerveau chacun chaîne chaise chaleur
chambre champion chance changement changer chanson chant chanter chapitre chaque
charge charger charmant chasse chaud chaussure chef chemin cheminée cher chercher
chère chéri cheval cheveu chien chiffre chimie chinois choix choisir chose ciel
cinéma cinquante circuit citoyen civil clair classe classique clavier client
clientèle climat cloche cœur coin colis collectif colline colonne combat combien
commande commander comment commerce commercial commission commun communication
communauté compagnie comparaison compétence compétition complément complet
complexe compliqué comportement composer composition comprendre compter compteur
concept concernant concert condition conduire confiance confirmer conflit
confort confusion congé connaissance connaître conseil conseiller conservation
conserver considérer consister constant constater construire consultation
consulter contact contenir contenu contexte continuer contraire contrat contre
contribuer contrôle contrôler convaincre convenir conversation copie copier corde
corps correct correspondre costume côté couche couloir coupable couper courage
courant course court cousin couteau coût couvrir crayon création créer crème
crise critique croire croiser croix cruel cuisine cuisinier culture curieux cycle danger dangereux danse danser date dauphin debout début décembre
décider décision déclarer décoller décor découvrir décrire dedans défaut défendre
défiler définir définition dégât dehors déjà déjeuner délicat demande demander
démarrer demeurer demi démontrer dense dent départ département dépendre déplacer
déposer depuis déranger dernier dernière derrière descente description désert
désigner désir désormais dessin dessiner dessous dessus destin destiné détacher
détail détecter déterminer détruire devant développement devenir dévoué différence
différent difficile difficulté digital dimension diminuer direct directeur
direction directrice diriger discours disponible disparaître disposition dispute
distance distinct distribuer divers diviser docteur document domaine domestique
dominant dominer donner doré dormir dossier double douceur doute doux drap droit
drôle durée durant durer écaille échange échapper échelle échec éclair école
économie économique écouter écran écrire écrit écrivain éducation effet efficace
effort égal également église élargir élection électrique élément élégant élevé
élever élève élire éloge emballage embaucher émettre émission émotion employé
employeur emploi emporter emprunt emprunter encore encouragement endroit énergie
enfance enfant enfer enfin enjeu enlever énorme enquête enregistrer enseignant
enseignement enseigner ensemble ensuite entendre entier entourer entre
entreprendre entreprise entrer entretenir entretien envie environ environnement
envisager envoyer épais épaule épisode époque épouse époux épreuve équilibre
équipe équipement équivalent erreur escalier espace espagnol espèce espoir esprit
essai essayer essence essentiel estimation estimer étape état éteindre étendre
éternel étonner étrange étranger étude étudiant étudier événement évident éviter
évoluer exact exactement examen examiner exemple exercer exercice exiger existence
exister expédier expérience expert expirer explication expliquer explorer
exportation exposition exprimer extension externe extrait facile facilité façon
facteur facture faible faim faire faisceau famille fameux fantaisie farine fatigue
faveur favorable favori féliciter femme fenêtre ferme fermer fermier festin fête
feuille fier fièvre figure file filet filiale film fils final finale finance
financer financier finir fixer flacon flamme fleur fleuve flotte fois fonction
fonctionner fondamental fond fondation fonder fonds fontaine football force forcer
forêt formalité formation forme former formidable formule fort fortune forum foule
four fournir fournisseur foyer frais framboise franc français française franchise
frapper frère froid fromage front frontière fruit fuite fumée fumer fureur furieux
fusion futur gagner gain galerie garage garçon garde garder gardien gare gâteau
gauche général génération généreux génie genre gens géant géographie gestion geste
gestionnaire glace glisser globe goût gouverner gouvernement grâce grade grain
grammaire grand grande grandeur grandir graphique gratuit grave gros grosse groupe guerre guichet guide habile habitude hameau harmonie hasard hauteur
hebdomadaire hectare herbe héritage heure heureux heurter histoire hiver hommage
homme honneur hôpital horaire horizon horloge horreur hôte hôtel huile humain
humeur humour hygiène hypothèse idée identifier identité image imaginer imiter
immédiat immense impact impatient importer important impossible impôt impression
imprimer incident inclure inconnu indicateur indice indispensable industrie
information informatique inférieur infini influence informer initiale initiative
injustice innovation inonder inquiet inscrire inscription insecte insister
inspecteur inspirer installation installer instant institut instruction
instrument insuffisant intégral intelligence intelligent intense intention
interaction intérêt intérieur intermédiaire international interne internet
interroger interruption intervenir intervention interview introduire introduction
inutile inventer inverser investigation invitation inviter impliquer ironie
isolement isoler italien ivoire jaloux jamais jambe jardin jaune jeter jeudi
jeune jeunesse joie joli jouer jouet joueur jour journal journée juge jugement
juillet juin jumeau jupe jurer juridique jus justice justifier kilomètre lâcher
laisser lait lancer langue large largeur larme latin laver leçon lecture légende
léger légume lendemain lent lettre lever lèvre liberté libre lien lieu ligne
limitation limite limiter linge lion lire liste litre littérature livre livrer
livraison local locataire logement logique loin loisir longue longueur lorsque
louer lourd loyer lucide lumière lundi lune lutte luxe machine magasin magazine
magnifique main maintenant maintien maire maison maître majestueux majorité
maladie malgré manière manifestation manque manquer manteau manuel manufacture
marche marché marcher mari mariage marin marquer marteau massage masse matière
matin mature maximum médecin médical meilleur mélange mélanger membre mémoire
menace menacer mener mensuel mental mention mentir menu merci merveille message
messager mesure méthode métier mille million ministre minute miroir mission
mixte mobile mode modèle modeste modification modifier moindre moins mois moitié
moment monde monnaie monsieur monter montre montrer monument moral morceau mordre
mort moteur motif mouiller moule mourir mouton mouvement moyen muet musique
mystère nager naissance naître nation national nature naturel navire nécessaire
négatif négliger négociation neige nettoyer niveau noble nombreux nommer norme
notable note noter notice nourrir nourriture nouveau nouvelle noyau nuance nuit
numéro nutrition obéir objectif objet obliger observation observer obstacle
obtenir occasion occupation occuper océan octobre odeur offense offre offrir
ombre oncle ongle opération opérer opinion opportunité opposé opposer option
orange ordinaire ordinateur ordonnance ordre organe organisation organiser
orientation orienter origine orner oser oubli oublier outil ouvert ouverture
ouvrage ouvrier ouvrir page paiement paire paix palais panier panneau panorama
pantalon papier paquet paradis paragraphe paraître parcours pardon pareil parent
parfait parfois parfum parler parmi parole partage partager participer particulier
partie partir partout passage passager passer passion patient patrie patron pause
pauvre pays paysage peau pêche peindre peine peinture pelouse pendant penser
pension perception perdre père performance période permanence permanent permis
permission permettre personne personnel perspective perte peser petit petite
peuple peur phase phénomène philosophie photo phrase physique piano pièce pierre
piège pilote pionnier piscine piste pitié place placer plainte plaire plaisir
plan planche planète planifier plante plaque plastique plateau plein plénitude
pleurer plonger plume plupart pluriel plusieurs plutôt poche poème poésie poids
point pointe poire poison poisson poitrine police politique populaire population
port portail porte porter porteur portion pose poser position positif possession
possible poste postuler potentiel poudre poulet poursuite pourtant pousser
poussière pouvoir pratique précieux précis préciser prédire préférer premier
première préparation préparer présence présent présenter président presse pression
prêt prêter preuve prévenir prévoir prier principal principe printemps priorité
prison privé prix probable problème procédure procédé prochain proche produit
produire producteur production profession professionnel profil profit profond
programme progrès progression projet promenade promesse promettre promotion
prononcer proportion propos proposer propre propriétaire prospère protection
protéger protester prouver province public publication publicité publier punir qualité quantité quart quartier quasi quatre question queue quinzaine
quitter quotidien racine raconter radio raison ramasser ramener rang rangée rapide
rapidement rapport rapporter rare rassurer rattraper ravir rayon réaction réaliser
réalité refléter refus refuser regard regarder règle règlement régler régional
région registre regretter régulier reine rejeter rejoindre relation relever
religieux remarque remarquer remède remercier remettre remise remonter
remplacement remplacer remplir remporter rencontre rencontrer rendre renforcer
renseignement rentrée rentrer renverser repas répéter répétition répondre réponse
report repos reposer repousser reprendre représenter reproche république
réputation requête réseau réserve réserver résidence résoudre respect respecter
respirer responsabilité ressembler ressort ressource restaurant reste rester
résultat résumer retard retenir retirer retour retourner retraite réunion réunir
rêve réveiller revenir revenue rêver revue riche richesse ridicule rien rigueur
risque risquer rive rivière robe robuste roche roman rose rouge rouler route
routine royal ruban ruelle ruine rumeur rupture rythme sable sac savoir sage sain
saint saisir saison salade salaire salle salon saluer salut sanction sang santé
satisfaire sauter sauvegarder sauver savon scène schéma science scientifique score
séance sécher secours secret secrétaire section sécurité séduire séjour selon
semaine sembler sensible sentiment sentir séparer septembre série sérieux serrer
service serviette servir session seul seulement sévère siècle siège signature
signe signal signer signification silence simple simplifier site situation situer
social société soif soir soirée soin soigner solaire soldat solde soleil solide
solitaire solution sombre somme sommet sondage songer sonner sortie sortir
soudain souffle souffrir souhaiter soulager soulever soumettre soupçon souple
source sourd sourire souris soutenir souvenir souvent spécifique spectacle
spectateur sport stable stade stage station statistique statue statut stimulation
stopper store stratégie strict structure studio stupide style subir subvention
succès sucre suffire suffisant suggérer sujet supérieur supermarché supposer
supprimer surface surprendre surprise surtout surveiller survie survivre symbole
sympathique syndicat synonyme syntaxe système table tableau tâche taille talent
tandis tant tante tapis tarif taux téléphone télévision témoin température
tempête temps tendance tendre teneur tenir tension tentative tenue terme
terminologie terrain terrasse terre tête texte théâtre thème théorie tiers timbre
tirage tirer tiroir tissu titre toile toit tomate tome tonalité tondre torchon
total touche toucher toujours tour tourner tournoi toute trace tracer tradition
traduction traduire train trame tranche tranquille transaction transfert
transformation transformer transmettre transparent transport transporter travail
travailler travailleur travers traverser tremblement trembler très trésor
traitement traiter trajet tribu tribunal tribune triste tromper tronc trophée
trouble tuer type ultérieur ultime uniforme union unique unité univers université
urbain urgence usage usine utile utilisation utiliser vacance vague vain vaisseau
valeur valise vallée valoir vapeur varier variété vaste vedette véhicule veiller
vitesse veine vendre vendeur vendeuse vengeance venir vent vente ventre verre
version vert veste vêtement veuf viande victime victoire vidéo vieux village ville
vingt violon virage visite visiter visiteur visage vision visuel vital vivant
vivre vocabulaire voie voile voisin voiture voix voler voleur volonté volume voter
voyage voyageur vraiment wagon yaourt zone zoom
sur sous vers hors lors chez avec pour dans sans entre selon malgré
votre notre leurs leur même mêmes autres autre toutes tous toute chaque
suis sont était étaient être avoir avait étaient fait faire font dit dire
peut peuvent doit doivent veut veulent vont vient viennent prend prennent met
voit voient sait savent connaît connaissent pense pensent croit croient
clients clientes produits services ventes achats affaires entreprises projets
formations ressources exemples idées images articles questions réponses problèmes
solutions avantages objectifs résultats moyens besoins marchés vendeurs acheteurs
lecteurs lectrices auteurs livres pages textes mots phrases chapitres parties
sections tables données chiffres montants paiements commandes livraisons
boutiques magasins marchandises bénéfices profits revenus dépenses budgets
marketing business entrepreneur entrepreneurs entrepreneuriat management
leadership numérique logiciel logiciels plateforme plateformes réseaux fichiers
vidéos contenus audience communautés abonnés marque marques publicité campagne
campagnes stratégie stratégies performance croissance coaching accompagnement
prestation gamme tarifs remise remises promotions réduction bénéfice
nouveau nouveaux nouvelle nouvelles grand petit petits bonne bonnes meilleur
meilleurs faible rapide lent facile difficile importants importante importantes
nécessaire inutile gratuit payant complexe ouvert fermé
france paris lyon marseille toulouse bordeaux lille nantes strasbourg montpellier
rennes cameroun douala yaoundé afrique europe canada belgique suisse sénégal
abidjan dakar gabon congo tchad niger mali maroc algérie tunisie égypte chine
inde brésil amérique allemagne espagne italie angleterre londres york
développer amélioration améliorations organisation organisations informatiques
communication communications professionnels professionnelles internationales
intelligences applications plateforme numérique numériques
action actions couleur couleurs tradition solutions décisions questions
portefeuille portemanteau portemonnaie portebonheur chèvrefeuille chauvesouris
contrepartie contremaitre contretemps contrepoids contrefaçon millefeuille
autoportrait autocritique radioactivité vidéoconférence vidéoprojecteur
vidéosurveillance taillecrayon photocopieuse téléchargement téléchargements
aimer adorer aider aller annoncer appeler apporter apprendre arriver arrêter
assurer atteindre attendre augmenter avancer boire bouger casser cesser changer
chanter charger chercher choisir cliquer commencer comparer compléter comprendre
compter configurer connaître conseiller construire contacter continuer corriger
coller couper créer danser décider découvrir décrire défendre définir demander
démarrer déposer déranger descendre désirer détruire développer devenir dire
discuter disposer donner dormir écouter écrire effacer emmener employer emporter
encourager entrer envoyer espérer essayer établir éviter exagérer examiner
exister expliquer exporter exprimer faire fermer finir fixer fonctionner gagner
garder générer goûter grandir gérer habiter hésiter imaginer impliquer imprimer
inclure indiquer informer installer intégrer intéresser inventer inviter jeter
jouer juger laisser lancer lever lire livrer louer manger marcher mener mériter
mesurer mettre modifier monter montrer mourir nager nettoyer noter nourrir
oublier ouvrir parler participer partir passer payer penser permettre placer
pleurer porter poser pousser pratiquer préparer présenter prêter prévenir
produire promettre proposer protéger publier quitter raconter rappeler recevoir
récupérer rédiger refuser regarder remercier remplacer remplir rencontrer rendre
renoncer rentrer répéter répondre reposer représenter reproduire réserver
résoudre ressembler rester retirer retourner réussir révéler rêver réviser rire
rouler sauter sauver savoir sécher sécuriser sembler sentir séparer servir
simplifier situer sonner sortir souffrir souhaiter souligner soumettre sourire
soutenir suivre supprimer surprendre surveiller télécharger téléphoner terminer
tenir tester tirer tourner tracer traduire traiter transformer transmettre
transporter travailler traverser trouver tuer utiliser valider vendre vérifier
verser visiter vivre voir voler voter voyager résumer signaler
parler cliquer taper scanner valider publier partager imprimer copier coller
corriger relire rédiger compléter enregistrer sauvegarder restaurer supprimer
créer modifier ajouter retirer déplacer dupliquer renommer exporter importer
les des une est sont plus tout tous toute toutes cette ces cet leur leurs mais
que qui quoi dont vous nous elle elles ils ont avez avons êtes suis très si
sinon ni donc car quand comme par sans sous sur vers chez avant après depuis
pendant aussi ainsi alors encore déjà toujours jamais peu beaucoup trop assez
presque ici là même autres autre chaque plusieurs quel quelle quels quelles
notre nos vos mon mes ton tes son ses moi toi lui eux ne pas non oui fait faire
font dit dire peut peuvent doit doivent veut veulent vais vas va vont vient
viennent prend prennent met mettent sait savent voit voient être avoir était
étaient sera seront serait pourquoi comment combien cas aux meme satisfait
satisfaits satisfaite satisfaites satisfaire satisfaisant rassurer rassurant
 aussitôt toutefois envers parvenir malentendu
maladresse malheur endormir envoler bienfait bienfaits dessin dessiner
dessinateur dessert desservir dessein entrevue entrepôt entresol entretemps
entracte cartouche chaussée chandelier chevalier lesquels lesquelles desquels
desquelles attendu entendu marchandise centre central centrale centraux
camerounais camerounaise manuscrit recommander encaisser artificiel
artificielle artificiels artificielles essentiels essentielles

// Mots courants manquants + pièges des têtes courtes (« cela », « test »,
// « levier »…) : ils servent de GARDE known(token) — un mot légitime n'est
// jamais découpé (« jetable » n'est pas « je table »).
cela ceux celle test texte tiers tir titre toile toit total tome tour tous
leçon levier levure lavabo lavande labeur labour laïcité lunette loterie levain
tabac tableur jeton jetable unanime unisson ceinture lenteur tonnerre laquelle
durée duvet unité départ détail démarrage découvrir déchiffrer desservir
quelque quelques mêmes mêmes importe continue franc francs fin faim faims
fréquent fréquents fréquente fréquentes jusque puisque quoique contresens
longtemps quelquefois auprès probablement généralement également entièrement
totalement directement remarque remarques remarquer pourcentage pourcentages
tableau tableaux anneau anneaux manuel manuels manuelle manuelles naturel
naturels naturelle naturelles visiteur visiteurs visite fonctionne fonctionner
fonctionnement
 
// Prénoms courants (France, Afrique) : « JeanPierre » → « Jean Pierre ».
jean pierre paul marie anne luc marc claude bernard georges henri louis antoine
alexandre sébastien vincent thomas laurent olivier stéphane christophe bruno
éric pascal denis patrick emmanuel samuel daniel gabriel raphaël david joseph
moussa ibrahim amadou aboubakar mamadou ousmane fatou amina awa mariam chantal
jeanne claire sophie julie céline nathalie sandrine françoise christine



`;
export const GLUED_DICT = new Set(
  // Les commentaires `//` écrits DANS la liste sont retirés (ils documentent les
  // ajouts sans polluer le dictionnaire).
  WORDS.replace(/\/\/[^\n]*/g, " ").split(/\s+/).filter(Boolean)
);
export default GLUED_DICT;