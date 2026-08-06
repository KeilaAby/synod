-- =============================================================================
-- SYNOD — 0002 — Types enumeres
-- =============================================================================
-- Reference : plan.md §3.2
-- =============================================================================

-- Hierarchie a 6 niveaux, Siege inclus (RG-01, ARB-2)
create type entity_type as enum (
  'SIEGE', 'REGIONAL', 'DISTRICT', 'PAROISSE', 'EGLISE', 'CELLULE'
);

create type sexe_type      as enum ('M', 'F');
create type statut_marital as enum ('CELIBATAIRE', 'MARIE', 'VEUF', 'DIVORCE', 'AUTRE');
create type statut_croyant as enum ('ACTIF', 'INACTIF', 'TRANSFERE', 'DECEDE');

create type user_role as enum (
  'SUPERADMIN', 'ENTITE_ADMIN', 'ENTITE_OPERATEUR', 'LECTEUR'
);

-- Finances : recettes ET depenses (ARB-2)
create type sens_finance as enum ('RECETTE', 'DEPENSE');

-- Workflow de validation financiere, activable par le SuperAdmin (ARB-3, RG-16)
create type statut_mouvement as enum (
  'BROUILLON', 'SOUMIS', 'VALIDE', 'REJETE', 'ANNULE'
);

-- Workflow d'approbation des transferts (ARB-4, RG-11)
create type statut_transfert as enum (
  'DEMANDE', 'APPROUVE', 'REFUSE', 'ANNULE', 'EFFECTUE'
);

create type categorie_fonction as enum (
  'DIRECTION', 'FINANCE', 'COMMUNICATION', 'OEUVRES', 'AUTRE'
);

-- Generateur de rapports
create type visibilite_modele as enum ('PRIVE', 'ENTITE', 'DESCENDANTS', 'GLOBAL');
create type statut_rapport    as enum ('BROUILLON', 'GENERE', 'PUBLIE', 'ARCHIVE');
