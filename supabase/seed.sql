-- =============================================================================
-- SYNOD — Amorce des donnees de reference
-- =============================================================================
-- Idempotent : rejouable sans effet de bord (on conflict do nothing).
-- Ne contient AUCUNE donnee personnelle (ENF-DCP-05).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Le Siege — racine unique de la hierarchie (RG-03)
-- -----------------------------------------------------------------------------
insert into entities (type, code, nom, description)
values ('SIEGE', 'SIEGE', 'Siege National', 'Administration nationale de l''organisation')
on conflict do nothing;


-- -----------------------------------------------------------------------------
-- Grades — EF-REF-01
-- -----------------------------------------------------------------------------
insert into grades (code, libelle, ordre) values
  ('PASTEUR',     'Pasteur',     10),
  ('EVANGELISTE', 'Evangeliste', 20),
  ('DIACRE',      'Diacre',      30),
  ('ANCIEN',      'Ancien',      40),
  ('CROYANT',     'Croyant',     50)
on conflict (code) do nothing;


-- -----------------------------------------------------------------------------
-- Nationalites — EF-REF-02
-- -----------------------------------------------------------------------------
insert into nationalites (code_iso, libelle) values
  ('BEN', 'Beninoise'),
  ('BFA', 'Burkinabe'),
  ('CIV', 'Ivoirienne'),
  ('CMR', 'Camerounaise'),
  ('COD', 'Congolaise (RDC)'),
  ('FRA', 'Francaise'),
  ('GHA', 'Ghaneenne'),
  ('MDG', 'Malgache'),
  ('MLI', 'Malienne'),
  ('NER', 'Nigerienne'),
  ('NGA', 'Nigeriane'),
  ('SEN', 'Senegalaise'),
  ('TGO', 'Togolaise')
on conflict (code_iso) do nothing;


-- -----------------------------------------------------------------------------
-- Fonctions de bureau — EF-REF-03
-- `ordre_protocolaire` pilote la disposition de l'organigramme (EF-BUR-07).
-- `est_financiere` alimente l'indicateur « membres de finances » (RG-31).
-- -----------------------------------------------------------------------------
insert into fonctions (code, libelle, categorie, est_financiere, ordre_protocolaire) values
  ('PRESIDENT',           'President',                  'DIRECTION',     false,  10),
  ('VICE_PRESIDENT',      'Vice-President',             'DIRECTION',     false,  20),
  ('SECRETAIRE',          'Secretaire',                 'DIRECTION',     false,  30),
  ('SECRETAIRE_ADJOINT',  'Secretaire adjoint',         'DIRECTION',     false,  40),
  ('TRESORIER',           'Tresorier',                  'FINANCE',       true,   50),
  ('TRESORIER_ADJOINT',   'Tresorier adjoint',          'FINANCE',       true,   60),
  ('DIR_FINANCES',        'Directeur des finances',     'FINANCE',       true,   70),
  ('COMMISSAIRE_COMPTES', 'Commissaire aux comptes',    'FINANCE',       true,   80),
  ('DIR_COMMUNICATIONS',  'Directeur des communications','COMMUNICATION', false,  90),
  ('DIR_OEUVRES',         'Directeur des oeuvres',      'OEUVRES',       false, 100),
  ('DIR_JEUNESSE',        'Directeur de la jeunesse',   'OEUVRES',       false, 110),
  ('CONSEILLER',          'Conseiller',                 'AUTRE',         false, 120)
on conflict (code) do nothing;

-- Le Commissaire aux comptes n'a de sens qu'a partir de la Paroisse.
update fonctions
   set niveaux_applicables = '{SIEGE,REGIONAL,DISTRICT,PAROISSE}'
 where code = 'COMMISSAIRE_COMPTES';


-- -----------------------------------------------------------------------------
-- Categories financieres — EF-REF-04, ARB-2
-- Le `sens` est porte par la categorie : il n'est jamais saisi a la main (RG-13).
-- -----------------------------------------------------------------------------
insert into finance_categories (code, libelle, sens, ordre) values
  -- Recettes
  ('DIME',            'Dime',                    'RECETTE',  10),
  ('QUETE',           'Quete',                   'RECETTE',  20),
  ('OFFRANDE',        'Offrande',                'RECETTE',  30),
  ('DON',             'Don',                     'RECETTE',  40),
  ('COTISATION',      'Cotisation',              'RECETTE',  50),
  ('AUTRE_RECETTE',   'Autre recette',           'RECETTE',  90),
  -- Depenses
  ('FONCTIONNEMENT',  'Fonctionnement',          'DEPENSE', 110),
  ('TRAVAUX',         'Travaux et entretien',    'DEPENSE', 120),
  ('AIDE_SOCIALE',    'Aide sociale',            'DEPENSE', 130),
  ('MISSION',         'Mission et evangelisation','DEPENSE', 140),
  ('TRANSPORT',       'Transport',               'DEPENSE', 150),
  ('EVENEMENT',       'Evenement',               'DEPENSE', 160),
  ('AUTRE_DEPENSE',   'Autre depense',           'DEPENSE', 190)
on conflict (code) do nothing;
