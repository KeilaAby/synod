-- =============================================================================
-- SYNOD — 0079 — Les plafonds d'import deviennent des reglages
-- =============================================================================
-- Reference : EF-BAP-07, EF-CRO-11, EF-ADM-13, regle 21. Demande du 27 aout 2026.
--
-- CE QUI ETAIT EN DUR, ET POURQUOI CELA COINCAIT.
--
--   `LIGNES_LOT_MAX = 100`  (validation/bapteme.ts)
--   `LIGNES_MAX     = 5000` (actions/import-croyants.ts)
--
-- Les deux nombres ont ete choisis a l'estime, sans qu'aucune ceremonie ni
-- aucun fichier reel n'ait ete mesure. Le premier vient d'etre atteint : une
-- ceremonie de district peut depasser cent baptises, et l'import refusait alors
-- en demandant de scinder le fichier — un travail manuel impose par une
-- constante que personne ne pouvait changer sans redeployer.
--
-- UN PARAMETRE CONFIGURABLE SE LIT A CHAQUE ECRITURE (regle 21), jamais au
-- chargement d'un ecran : sinon un onglet ouvert avant le changement continue
-- de refuser ce que le reglage autorise desormais, et personne ne comprend
-- pourquoi le meme fichier passe chez l'un et pas chez l'autre.
--
-- DEUX REGLAGES ET NON UN, parce que ce sont deux gestes de nature differente.
-- Un lot de baptemes est UNE CEREMONIE : son plafond dit ce qu'une celebration
-- peut raisonnablement compter. Un import de croyants est une REPRISE DE
-- DONNEES : son plafond dit ce que le serveur peut avaler d'un coup. Les
-- confondre ferait qu'elargir une reprise de dix mille fiches autoriserait
-- aussi des ceremonies de dix mille baptises.
--
-- LES BORNES SONT LARGES MAIS EXISTENT. `check` refuse zero — un plafond nul
-- fermerait l'import sans que rien ne le dise — et refuse l'absurde : au-dela
-- de vingt mille lignes, ce n'est plus un import mais une restauration, et le
-- lot 8 la traite autrement (`pnpm export:integral`).
--
-- REJOUABLE (regle 23) : `add column if not exists`, et les contraintes sont
-- posees avec `if not exists` via un bloc conditionnel.
-- =============================================================================

alter table organisation_settings
  add column if not exists plafond_lot_baptemes integer not null default 100,
  add column if not exists plafond_import_croyants integer not null default 5000;

comment on column organisation_settings.plafond_lot_baptemes is
  'EF-BAP-07 — nombre maximal de baptises dans UNE ceremonie, saisie en lot ou '
  'importee. C''est une celebration, pas un registre : le plafond dit ce qu''une '
  'ceremonie peut raisonnablement compter.';

comment on column organisation_settings.plafond_import_croyants is
  'EF-CRO-11 — nombre maximal de lignes d''un import de croyants. C''est une '
  'reprise de donnees : le plafond dit ce que le serveur peut avaler d''un coup.';

/**
 * LES BORNES SE POSENT EN BASE, pas seulement dans le formulaire.
 *
 * Un reglage se modifie aussi par un appel direct a l'API : la contrainte est
 * ce qui garantit qu'un plafond nul — donc un import ferme sans explication —
 * ne puisse jamais etre ecrit.
 */
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'plafond_lot_baptemes_borne'
  ) then
    alter table organisation_settings
      add constraint plafond_lot_baptemes_borne
      check (plafond_lot_baptemes between 1 and 20000);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'plafond_import_croyants_borne'
  ) then
    alter table organisation_settings
      add constraint plafond_import_croyants_borne
      check (plafond_import_croyants between 1 and 20000);
  end if;
end $$;


/**
 * PostgREST garde un CACHE DE SCHEMA : sans cette purge, les deux colonnes
 * resteraient invisibles a l'API et la lecture des parametres repondrait
 * « column ... does not exist » sur du SQL pourtant en place.
 */
notify pgrst, 'reload schema';
