/**
 * Modèle et Contenus du Centre de Documentation SYNOD.
 *
 * Deux espaces de lecture :
 * 1. Guide Utilisateur : rédigé en langage simple, concret et illustré pour tous les membres.
 * 2. Manuel Administrateur : réservé aux SuperAdmins et gestionnaires habilités.
 *
 * Zéro jargon technique brut (pas de noms de variables ni de code) — priorité à la pédagogie.
 */

export type EspaceDocumentation = 'utilisateur' | 'administration';

export interface SectionDoc {
  readonly id: string;
  readonly titre: string;
  readonly sousTitre: string;
  readonly iconeNom: string;
  readonly descriptionCourte: string;
  readonly filAriane?: string;
  readonly lienAcces?: string;
  readonly chapitres: readonly ChapitreDoc[];
}

export interface ChapitreDoc {
  readonly id: string;
  readonly titre: string;
  readonly description: string;
  readonly etapes?: readonly {
    readonly titre: string;
    readonly texte: string;
  }[];
  readonly astuces?: readonly string[];
  readonly regles?: readonly string[];
  readonly casPratiques?: readonly string[];
}

/**
 * GUIDE UTILISATEUR — 10 grandes sections complètes de A à Z.
 */
export const SECTIONS_UTILISATEUR: readonly SectionDoc[] = [
  {
    id: 'premiers-pas',
    titre: 'Premiers pas & Découverte',
    sousTitre: 'Bienvenue sur la plateforme SYNOD',
    iconeNom: 'Compass',
    descriptionCourte: 'Découvrez comment vous connecter, naviguer et comprendre votre périmètre d’action.',
    filAriane: 'Menu principal ➔ Tableau de bord (/tableau-de-bord)',
    lienAcces: '/tableau-de-bord',
    chapitres: [
      {
        id: 'connexion-securisee',
        titre: 'Se connecter à son espace',
        description:
          'Votre compte vous permet d’accéder aux informations de votre église ou de votre juridiction en toute sécurité.',
        etapes: [
          {
            titre: '1. Saisie de vos identifiants',
            texte: 'Renseignez votre adresse email officielle et le mot de passe qui vous a été communiqué.',
          },
          {
            titre: '2. Premier mot de passe provisoire',
            texte:
              'Si votre compte vient d’être créé, l’application vous demande immédiatement de choisir un nouveau mot de passe personnel et confidentiel.',
          },
          {
            titre: '3. Accès au tableau de bord',
            texte: 'Une fois connecté, vous arrivez directement sur la vue générale de votre entité de rattachement.',
          },
        ],
        astuces: [
          'En cas d’oubli de mot de passe, utilisez le lien « Mot de passe oublié ? » sur l’écran de connexion pour recevoir un lien sécurisé par email.',
          'Votre mot de passe doit comporter au moins 8 caractères pour protéger les données de votre église.',
        ],
      },
      {
        id: 'perimetre-action',
        titre: 'Comprendre votre périmètre de consultation',
        description:
          'Dans SYNOD, vous ne voyez que ce qui concerne votre église et les entités qui lui sont rattachées (règle de la hiérarchie).',
        regles: [
          'Un responsable d’église locale voit uniquement les membres et les finances de son église et de ses cellules de prière.',
          'Un responsable de district voit toutes les paroisses et églises de son district.',
          'Le Siège National dispose d’une vision globale consolidée sur l’ensemble du pays.',
        ],
        casPratiques: [
          'Si vous cherchez un croyant et qu’il n’apparaît pas dans votre liste, c’est probablement qu’il est encore rattaché à une autre église : il faut alors demander son transfert.',
        ],
      },
    ],
  },
  {
    id: 'structure-organigramme',
    titre: 'Structure Ecclésiale',
    sousTitre: 'L’arborescence des 6 niveaux d’organisation',
    iconeNom: 'Network',
    descriptionCourte: 'Comprendre l’organisation du Siège jusqu’aux cellules de prière de quartier.',
    filAriane: 'Menu principal ➔ Structure (/structure)',
    lienAcces: '/structure',
    chapitres: [
      {
        id: 'niveaux-hierarchiques',
        titre: 'Les 6 échelons de l’organisation',
        description:
          'L’ensemble de la communauté est structuré selon une pyramide hiérarchique claire et harmonieuse.',
        etapes: [
          { titre: 'Niveau 1 : Le Siège National', texte: 'L’instance suprême qui coordonne toute la vision nationale.' },
          { titre: 'Niveau 2 : La Région', texte: 'Regroupe plusieurs districts sur une zone géographique étendue.' },
          { titre: 'Niveau 3 : Le District', texte: 'Coordonne l’activité pastorale de plusieurs paroisses.' },
          { titre: 'Niveau 4 : La Paroisse', texte: 'Fédération de proximité regroupant des églises locales voisines.' },
          { titre: 'Niveau 5 : L’Église Locale', texte: 'Le lieu principal de culte, de communion et de rassemblement des fidèles.' },
          { titre: 'Niveau 6 : La Cellule de prière', texte: 'Les petits groupes de quartier rattachés à une église locale.' },
        ],
        astuces: [
          'Chaque entité possède un code unique (ex: REG-01, EGL-CENTRE) permettant de l’identifier sans aucune ambiguïté.',
        ],
      },
      {
        id: 'navigation-arborescence',
        titre: 'Consulter la fiche d’une entité',
        description:
          'Dans le menu « Structure », vous pouvez explorer la carte des églises et ouvrir la fiche complète de n’importe quelle structure de votre juridiction.',
        etapes: [
          { titre: 'Chiffres clés', texte: 'Nombre de membres actifs, baptisés, composition du bureau et solde financier.' },
          { titre: 'Onglet Croyants', texte: 'Liste nominale de tous les fidèles enregistrés dans cette église.' },
          { titre: 'Onglet Bureau', texte: 'Composition de l’équipe dirigeante actuelle avec l’organigramme en image.' },
          { titre: 'Onglet Finances', texte: 'Recettes, dépenses et état du solde de l’entité.' },
        ],
      },
    ],
  },
  {
    id: 'gestion-croyants',
    titre: 'Gestion des Croyants',
    sousTitre: 'Fiches membres, familles et historique',
    iconeNom: 'Users',
    descriptionCourte: 'Enregistrer de nouveaux fidèles, gérer les familles, les photos et imprimer les listes.',
    filAriane: 'Menu principal ➔ Croyants (/croyants)',
    lienAcces: '/croyants',
    chapitres: [
      {
        id: 'nouvelle-fiche-croyant',
        titre: 'Enregistrer un nouveau membre',
        description:
          'Chaque croyant dispose d’une fiche individuelle complète qui l’accompagne tout au long de sa vie dans l’église.',
        etapes: [
          {
            titre: '1. Bouton « Nouveau croyant »',
            texte: 'Rendez-vous dans le menu « Croyants » et cliquez sur le bouton d’enregistrement.',
          },
          {
            titre: '2. État civil et coordonnées',
            texte: 'Renseignez le nom, le prénom, le sexe, la date de naissance, la nationalité et le numéro de téléphone.',
          },
          {
            titre: '3. Rattachement et grade ecclésial',
            texte:
              'Choisissez l’église locale, la cellule de prière et le grade ecclésial (Croyant, Diacre, Pasteur, etc.). Le formulaire vérifie automatiquement que le grade est compatible avec le genre sélectionné.',
          },
          {
            titre: '4. Photo de profil',
            texte: 'Ajoutez une photo claire : l’application effectue automatiquement un recadrage net en carré.',
          },
        ],
        regles: [
          'Le numéro de matricule (ex: EGL-2026-0001) est calculé automatiquement par l’application dès l’enregistrement.',
          'Un croyant ne peut être rattaché qu’à une seule église locale à la fois.',
        ],
      },
      {
        id: 'liens-familiaux',
        titre: 'Gérer les liens de mariage (Conjoint)',
        description:
          'Vous pouvez relier deux membres mariés afin que leur union apparaisse clairement sur leurs fiches respectives.',
        astuces: [
          'Le lien conjugal est réciproque : lier Pierre à Marie met automatiquement à jour la fiche de Marie.',
          'L’application s’assure que les deux personnes sont majeures et appartiennent à la même communauté.',
        ],
      },
      {
        id: 'impression-personnalisee',
        titre: 'Imprimer la liste des membres (Choix des colonnes)',
        description:
          'Avant d’éditer une liste en PDF, vous pouvez choisir précisément les informations que vous souhaitez afficher sur la feuille.',
        etapes: [
          { titre: '1. Filtrer la liste', texte: 'Sélectionnez par exemple uniquement les « Hommes », les « Diacres » ou les membres d’une cellule.' },
          { titre: '2. Cliquer sur « Imprimer »', texte: 'Une boîte de dialogue s’ouvre pour cocher/décocher les colonnes désirées (Âge, Téléphone, Grade, Date de baptême...).' },
          { titre: '3. Télécharger le document', texte: 'Le document PDF se génère avec une mise en page soignée prête à être imprimée ou archivée.' },
        ],
      },
    ],
  },
  {
    id: 'transferts-mobilite',
    titre: 'Transferts & Mutations',
    sousTitre: 'Accompagner le déménagement d’un membre',
    iconeNom: 'ArrowLeftRight',
    descriptionCourte: 'Demander une mutation d’église, circuit de validation et attestation officielle.',
    filAriane: 'Menu principal ➔ Transferts (/transferts)',
    lienAcces: '/transferts',
    chapitres: [
      {
        id: 'demande-transfert',
        titre: 'Initier un transfert d’église',
        description:
          'Lorsqu’un fidèle change de ville ou de quartier, son dossier ecclésial est transféré vers sa nouvelle église d’accueil.',
        etapes: [
          { titre: '1. Saisie de la demande', texte: 'Dans le menu « Transferts », choisissez le croyant et l’église de destination.' },
          { titre: '2. Motif du transfert', texte: 'Indiquez la raison (déménagement, mutation professionnelle, mariage...).' },
          { titre: '3. Envoi pour accord', texte: 'La demande est transmise dans le circuit d’approbation pastoral.' },
        ],
        regles: [
          'Si le transfert s’effectue au sein de la même paroisse, la validation est immédiate et automatique.',
          'Si le transfert change de région ou de district, l’accord de l’autorité pastorale supérieure commune est requis pour valider le départ.',
          'Dès que le transfert est validé, si le croyant occupait un poste dans le bureau de son ancienne église, son mandat est automatiquement clôturé.',
        ],
      },
      {
        id: 'attestation-transfert',
        titre: 'Télécharger l’Attestation de Transfert officielle',
        description:
          'Une fois la mutation approuvée, vous pouvez télécharger la lettre de recommandation officielle signée portant le sceau de l’église.',
      },
    ],
  },
  {
    id: 'baptemes-ceremonies',
    titre: 'Cérémonies de Baptême',
    sousTitre: 'Saisie rapide en série et certificats',
    iconeNom: 'Droplets',
    descriptionCourte: 'Enregistrer une cérémonie collective de baptêmes d’eau et délivrer les attestations.',
    filAriane: 'Menu principal ➔ Baptêmes (/baptemes)',
    lienAcces: '/baptemes',
    chapitres: [
      {
        id: 'saisie-lot-baptemes',
        titre: 'Enregistrer une session de baptême en une seule fois',
        description:
          'Pour vous éviter de saisir les fiches une à une lors d’un grand baptême, l’outil propose une grille de saisie en lot très rapide.',
        etapes: [
          { titre: '1. Informations communes', texte: 'Indiquez la date de la cérémonie, le lieu (ex: Rivière, Temple) et les célébrants (Pasteurs habilités).' },
          { titre: '2. Tableau des baptisés', texte: 'Remplissez une ligne par personne avec son nom, prénom, date de naissance et église de rattachement.' },
          { titre: '3. Enregistrement groupé', texte: 'En un seul clic, toutes les fiches de croyants sont créées avec le statut « Baptisé » et le grade initial « Croyant ».' },
        ],
        astuces: [
          'Vous pouvez imprimer immédiatement l’ensemble des Certificats de Baptême officiels avec les signatures des pasteurs officiants.',
        ],
      },
    ],
  },
  {
    id: 'bureaux-organigrammes',
    titre: 'Bureaux & Organigrammes',
    sousTitre: 'Équipes dirigeantes et représentations visuelles',
    iconeNom: 'Briefcase',
    descriptionCourte: 'Composer un bureau, dessiner l’organigramme hiérarchique et l’imprimer en haute qualité.',
    filAriane: 'Menu principal ➔ Bureaux (/bureaux)',
    lienAcces: '/bureaux',
    chapitres: [
      {
        id: 'composition-bureau',
        titre: 'Composer le bureau de son entité',
        description:
          'Un bureau rassemble les responsables investis d’un mandat officiel (Président, Vice-Président, Secrétaire, Trésorier, Conseillers...).',
        etapes: [
          { titre: '1. Définir la période du mandat', texte: 'Indiquez la date de début et la date de fin prévue du mandat (ex: 2026 - 2028).' },
          { titre: '2. Assigner les postes', texte: 'Choisissez parmi vos membres qui occupe chaque fonction.' },
          { titre: '3. Fonctions vacantes', texte: 'Si un poste n’est pas encore pourvu, il reste marqué « Vacant » en pointillés jusqu’à la prochaine nomination.' },
        ],
      },
      {
        id: 'organigramme-interactif',
        titre: 'Dessiner l’organigramme (Glisser-Déposer)',
        description:
          'L’écran d’organigramme vous permet de disposer les boîtes des responsables de manière claire et visuelle.',
        etapes: [
          { titre: 'Déplacement libre', texte: 'Cliquez sur une boîte pour la positionner où vous le souhaitez sur l’écran.' },
          { titre: 'Relier deux responsables', texte: 'Tirez un trait depuis le point de connexion de la boîte supérieure vers la boîte subordonnée.' },
          { titre: 'Postes en dérivation (Adjoints / Vice-Présidents)', texte: 'Pour relier un adjoint à côté de son responsable, tirez le trait depuis le côté gauche ou droit de la boîte.' },
        ],
        astuces: [
          'Le bouton « Aperçu PDF » génère instantanément une feuille vectorielle A4 paysage d’une netteté parfaite, idéale pour l’affichage au temple ou dans les rapports officiels.',
        ],
      },
    ],
  },
  {
    id: 'finances-validation',
    titre: 'Finances Générales',
    sousTitre: 'Recettes, dépenses et validation des pièces',
    iconeNom: 'Wallet',
    descriptionCourte: 'Tenir la comptabilité, téléverser les justificatifs et suivre le circuit de validation.',
    filAriane: 'Menu principal ➔ Finances (/finances)',
    lienAcces: '/finances',
    chapitres: [
      {
        id: 'triptyque-financier',
        titre: 'Comprendre le solde et les écritures',
        description:
          'Le système financier de SYNOD garantit une transparence totale sur l’utilisation des fonds de l’église.',
        etapes: [
          { titre: 'Les Recettes', texte: 'Offrandes ordinaires, dons spéciaux, collectes de projets.' },
          { titre: 'Les Dépenses', texte: 'Factures d’électricité, entretien des locaux, aide sociale, fournitures.' },
          { titre: 'Le Solde Disponible', texte: 'Calculé en direct : Total des recettes validées − Total des dépenses validées.' },
        ],
        regles: [
          'Chaque mouvement financier doit obligatoirement être rattaché à une catégorie officielle (ex: Électricité, Travaux, Sonorisation).',
          'Une écriture rejetée ne modifie jamais le solde de la caisse.',
        ],
      },
      {
        id: 'circuit-validation',
        titre: 'Le circuit de validation des écritures',
        description:
          'Pour garantir la sécurité financière, les écritures saisies par un gestionnaire doivent être validées par le trésorier ou le responsable.',
        etapes: [
          { titre: '1. Statut « Brouillon »', texte: 'L’écriture est saisie avec son montant et sa pièce justificative (photo du ticket ou facture PDF).' },
          { titre: '2. Statut « Soumis »', texte: 'L’écriture est transmise pour vérification au trésorier.' },
          { titre: '3. Statut « Validé » ou « Rejeté »', texte: 'Le trésorier vérifie la pièce jointe. Dès la validation, le solde de l’église est mis à jour.' },
        ],
      },
    ],
  },
  {
    id: 'dimes-remises',
    titre: 'Gestion des Dîmes',
    sousTitre: 'Enveloppes, reçus individuels et remises au Siège',
    iconeNom: 'Coins',
    descriptionCourte: 'Gérer les enveloppes de dîmes, imprimer les reçus et préparer les versements au Siège.',
    filAriane: 'Menu principal ➔ Finances ➔ Dîmes (/finances/dimes)',
    lienAcces: '/finances/dimes',
    chapitres: [
      {
        id: 'principe-dime',
        titre: 'Règle fondamentale : La Dîme appartient au Siège',
        description:
          'Dans les statuts de l’organisation, l’intégralité des dîmes collectées dans les églises locales est destinée au Siège National pour soutenir le corps pastoral.',
        regles: [
          'La dîme collectée ne fait PAS partie des recettes propres de l’église locale et ne gonfle pas son solde courant.',
          'Elle est consignée dans un registre spécifique jusqu’à sa remise officielle au Siège National.',
        ],
      },
      {
        id: 'collecte-recus',
        titre: 'Enregistrer une collecte et remettre les reçus',
        description:
          'Chaque fidèle dispose d’un numéro d’enveloppe. Lors du culte, vous enregistrez les versements nominatifs.',
        etapes: [
          { titre: '1. Saisie par enveloppe', texte: 'Tapez le numéro d’enveloppe ou le nom du croyant et indiquez le montant versé.' },
          { titre: '2. Émission du reçu', texte: 'L’application peut imprimer instantanément un reçu individuel (format feuille A4 ou ticket thermique 80 mm).' },
          { titre: '3. Clôture de la collecte', texte: 'Le total de la journée est scellé et prêt pour le bordereau de versement.' },
        ],
      },
      {
        id: 'remise-au-siege',
        titre: 'Effectuer la « Remise au Siège »',
        description:
          'Lorsque vous transférez les fonds de dîme au Siège (virement bancaire ou remise physique), cliquez sur l’action « Remettre au Siège » dans le menu de la collecte pour générer le bordereau officiel scellé.',
      },
    ],
  },
  {
    id: 'tableaux-de-bord',
    titre: 'Tableaux de Bord',
    sousTitre: 'Indicateurs visuels et personnalisation',
    iconeNom: 'LayoutDashboard',
    descriptionCourte: 'Suivre l’évolution des membres, des finances et adapter les cartes à vos besoins.',
    filAriane: 'Menu principal ➔ Tableau de bord (/tableau-de-bord)',
    lienAcces: '/tableau-de-bord',
    chapitres: [
      {
        id: 'indicateurs-cles',
        titre: 'Lire les chiffres clés de son église',
        description:
          'Le tableau de bord synthétise la santé spirituelle et matérielle de votre communauté en un coup d’œil.',
        etapes: [
          { titre: 'Membres actifs & Croissance', texte: 'Évolution des effectifs, proportion d’hommes, femmes et jeunes.' },
          { titre: 'Jauge financière', texte: 'Visualisez immédiatement les rentrées du mois et l’état de votre trésorerie.' },
          { titre: 'Rapprochements en attente', texte: 'Nombre d’enveloppes ou de transferts nécessitant votre attention.' },
        ],
        astuces: [
          'Chaque carte est interactive : cliquez dessus pour afficher la liste détaillée des personnes ou des opérations correspondantes.',
        ],
      },
      {
        id: 'personnalisation-dashboard',
        titre: 'Réorganiser les cartes selon vos préférences',
        description:
          'Vous pouvez faire glisser les cartes pour placer en haut les indicateurs qui comptent le plus pour votre rôle au quotidien.',
      },
    ],
  },
  {
    id: 'generateur-rapports',
    titre: 'Générateur de Rapports',
    sousTitre: 'Modèles officiels, assemblage de blocs et export PDF',
    iconeNom: 'FileText',
    descriptionCourte: 'Produire des rapports d’activité mensuels ou annuels complets et prêts à imprimer.',
    filAriane: 'Menu principal ➔ Rapports (/rapports)',
    lienAcces: '/rapports',
    chapitres: [
      {
        id: 'modeles-rapports',
        titre: 'Choisir un modèle dans la bibliothèque',
        description:
          'Le Siège National met à votre disposition des modèles types (Rapport d’assemblée générale, Bilan financier mensuel, Synthèse pastorale).',
        etapes: [
          { titre: '1. Ouvrir la bibliothèque', texte: 'Rendez-vous dans le menu « Rapports » et parcourez les modèles officiels.' },
          { titre: '2. Générer le rapport', texte: 'Cliquez sur « Générer », choisissez l’église et la période (ex: 1er Trimestre 2026).' },
          { titre: '3. Les données se remplissent toutes seules', texte: 'SYNOD extrait automatiquement les décomptes de membres, les finances et l’organigramme.' },
        ],
      },
      {
        id: 'regles-confidentialite',
        titre: 'Confidentialité et Gel des données (Règles d’or)',
        description:
          'La sécurité et la sincérité des rapports sont protégées par deux règles automatiques fondamentales :',
        regles: [
          'Règle d’omission discrète : si une personne n’a pas le droit de consulter les finances, le bloc financier du rapport s’efface discrètement sans message d’erreur agressif.',
          'Règle du gel définitif : une fois le rapport validé et généré, il est figé dans le marbre. Même si des données changent plus tard dans l’année, l’archive du rapport reste intacte et conforme à ce qui a été présenté ce jour-là.',
        ],
      },
    ],
  },
];

/**
 * MANUEL D'ADMINISTRATION — 7 sections exhaustives de gouvernance et de souveraineté.
 */
export const SECTIONS_ADMINISTRATION: readonly SectionDoc[] = [
  {
    id: 'admin-comptes',
    titre: 'Gestion des Comptes & Accès',
    sousTitre: 'Création d’utilisateurs et mots de passe provisoires',
    iconeNom: 'UserCheck',
    descriptionCourte: 'Délivrer des accès aux secrétaires et trésoriers, réinitialiser des mots de passe en toute sécurité.',
    filAriane: 'Administration ➔ Comptes utilisateurs (/administration/comptes)',
    lienAcces: '/administration/comptes',
    chapitres: [
      {
        id: 'creation-compte-securisee',
        titre: 'Créer un nouveau compte utilisateur',
        description:
          'Pour préserver la sécurité de l’église, aucun mot de passe temporaire ne circule par email non sécurisé.',
        etapes: [
          { titre: '1. Formulaire d’ouverture', texte: 'Indiquez l’email de l’utilisateur, son nom et son entité de rattachement.' },
          { titre: '2. Attribution du rôle', texte: 'Choisissez son niveau d’accès (SuperAdmin, Administrateur d’entité, Opérateur ou Lecteur simple).' },
          { titre: '3. Mot de passe provisoire affiché à l’écran', texte: 'L’application génère un code sécurisé que vous communiquez en main propre à l’intéressé. Il devra obligatoirement le changer dès sa première connexion.' },
        ],
        astuces: [
          'En cas de départ d’un membre, vous pouvez immédiatement « Suspendre » son compte depuis l’écran sans supprimer son historique de travail.',
        ],
      },
    ],
  },
  {
    id: 'admin-habilitations',
    titre: 'Habilitations Fines & Délégation',
    sousTitre: 'Principe du Droit + Portée et profils réutilisables',
    iconeNom: 'ShieldCheck',
    descriptionCourte: 'Accorder des permissions précises sur un périmètre géographique strict.',
    filAriane: 'Administration ➔ Profils & Droits (/administration/profils)',
    lienAcces: '/administration/profils',
    chapitres: [
      {
        id: 'principe-droit-portee',
        titre: 'La règle fondamentale : Tout droit a une portée',
        description:
          'Dans SYNOD, on ne donne jamais un privilège « dans le vide » : chaque autorisation s’applique à une entité et à tout son sous-arbre.',
        regles: [
          'Un droit accordé sur la « Région Centre » s’applique automatiquement à tous les districts et églises de cette région.',
          'Règle de délégation bornée : un responsable d’entité ne peut déléguer que des droits qu’il possède déjà lui-même, et uniquement sur son propre territoire.',
        ],
      },
      {
        id: 'profils-habilitations',
        titre: 'Les profils de privilèges prêts à l’emploi',
        description:
          'Pour vous simplifier la vie, utilisez les modèles prédéfinis : Responsable d’Église, Trésorier Général, Secrétaire de Paroisse, Commissaire aux Comptes.',
      },
    ],
  },
  {
    id: 'admin-referentiels',
    titre: 'Administration des Référentiels',
    sousTitre: 'Grades, fonctions, catégories et événements',
    iconeNom: 'SlidersHorizontal',
    descriptionCourte: 'Gérer les nomenclatures officielles de l’organisation sans écrire une seule ligne de code.',
    filAriane: 'Administration ➔ Référentiels (/referentiels)',
    lienAcces: '/referentiels',
    chapitres: [
      {
        id: 'referentiel-grades',
        titre: 'Grades ecclésiaux & Restrictions de genre',
        description:
          'Vous pouvez ajuster l’ordre protocolaire des grades, définir qui est habilité à célébrer les baptêmes d’eau, et restreindre certains grades aux hommes ou aux femmes selon les règles de votre confession.',
      },
      {
        id: 'referentiel-fonctions',
        titre: 'Fonctions de bureau & Rôle financier',
        description:
          'Gérez les intitulés des postes de direction. Le drapeau « Fonction financière » garantit que seuls les trésoriers ont accès aux comptes bancaires et caisses.',
      },
      {
        id: 'referentiel-categories',
        titre: 'Catégories comptables & Événements de dîmes',
        description:
          'Harmonisez les types de dépenses autorisées (Électricité, Carburant, Sonorisation) et les événements officiels de collectes de dîmes (Convention nationale, Pâques, Culte dominical).',
      },
    ],
  },
  {
    id: 'admin-audit',
    titre: 'Journal d’Audit & Sécurité',
    sousTitre: 'Traçabilité inaltérable en langage naturel',
    iconeNom: 'ScrollText',
    descriptionCourte: 'Consulter l’historique des connexions, des modifications financières et des refus d’accès.',
    filAriane: 'Administration ➔ Journal d’audit (/administration/audit)',
    lienAcces: '/administration/audit',
    chapitres: [
      {
        id: 'consultation-audit',
        titre: 'Un journal clair sans jargon informatique',
        description:
          'Chaque modification dans l’application est consignée dans un registre inaltérable horodaté avec l’identité de l’auteur et son adresse IP.',
        casPratiques: [
          'Exemple d’entrée claire : « Pasteur Michel a modifié le montant de la facture #102 de 50 000 Ar à 65 000 Ar le 24 août à 14h30 ».',
          'Les tentatives d’accès non autorisées sont également consignées pour prévenir toute intrusion.',
        ],
      },
    ],
  },
  {
    id: 'admin-corbeille',
    titre: 'Corbeille & Rétention',
    sousTitre: 'Restauration en un clic et purge définitive',
    iconeNom: 'Trash2',
    descriptionCourte: 'Retrouver des croyants ou des entités supprimés par erreur et restaurer leurs liaisons.',
    filAriane: 'Administration ➔ Corbeille (/administration/corbeille)',
    lienAcces: '/administration/corbeille',
    chapitres: [
      {
        id: 'restauration-donnees',
        titre: 'Restauration sécurisée avec intégrité',
        description:
          'Lorsqu’un élément est supprimé, il est placé dans la corbeille pendant une période de grâce.',
        etapes: [
          { titre: '1. Retrouver l’élément', texte: 'Filtrez par nom ou par date dans la corbeille d’administration.' },
          { titre: '2. Cliquer sur « Restaurer »', texte: 'Le membre ou la structure réapparaît immédiatement dans son église d’origine avec toutes ses informations intactes.' },
        ],
      },
    ],
  },
  {
    id: 'admin-parametres',
    titre: 'Paramètres Généraux & Courriels',
    sousTitre: 'Identité visuelle, fuseau horaire et serveur SMTP',
    iconeNom: 'Settings',
    descriptionCourte: 'Personnaliser le logo national, la devise, les délais de grâce et l’envoi des emails.',
    filAriane: 'Administration ➔ Paramètres (/administration/parametres)',
    lienAcces: '/administration/parametres',
    chapitres: [
      {
        id: 'reglages-smtp',
        titre: 'Configurer l’envoi des courriels (Serveur SMTP)',
        description:
          'Configurez les paramètres de messagerie pour que l’application puisse envoyer les liens de réinitialisation de mot de passe.',
        etapes: [
          { titre: '1. Renseigner l’hôte et le port', texte: 'Indiquez par exemple smtp.gmail.com (port 587 avec STARTTLS ou 465 avec SSL).' },
          { titre: '2. Nom d’expéditeur', texte: 'Indiquez par exemple « Secrétariat Général SYNOD ».' },
          { titre: '3. Bouton « Essai d’envoi »', texte: 'Cliquez pour envoyer un email de test immédiat et valider que la communication fonctionne.' },
        ],
      },
    ],
  },
  {
    id: 'admin-portabilite',
    titre: 'Portabilité, Sauvegardes & S3',
    sousTitre: 'Zéro dépendance, réversibilité intégrale et reprise d’activité',
    iconeNom: 'Server',
    descriptionCourte: 'Télécharger la sauvegarde complète (SQL + photos) et restaurer sur n’importe quel serveur.',
    filAriane: 'Administration ➔ Portabilité & Sauvegardes (/administration/portabilite)',
    lienAcces: '/administration/portabilite',
    chapitres: [
      {
        id: 'garantie-souverainete',
        titre: 'Vos données vous appartiennent à 100 %',
        description:
          'SYNOD garantit l’indépendance technologique totale de votre organisation (aucun format propriétaire verrouillé).',
        etapes: [
          { titre: '1. Base de données standard', texte: 'Tout le schéma repose sur PostgreSQL standard sans aucune dépendance fermée.' },
          { titre: '2. Stockage de fichiers universel S3', texte: 'Les photos et justificatifs sont compatibles avec AWS S3, Cloudflare R2, MinIO ou Scaleway.' },
          { titre: '3. Export intégral en 1 clic', texte: 'Depuis l’écran /administration/portabilite, téléchargez en un clic l’archive complète contenant la base de données SQL, l’inventaire des fichiers et le manifeste d’intégrité SHA-256.' },
        ],
        astuces: [
          'Le fichier RESTORE.md situé à la racine de l’application fournit le guide pas-à-pas pour relancer SYNOD sur un serveur vierge en quelques minutes en cas de sinistre.',
        ],
      },
    ],
  },
];
