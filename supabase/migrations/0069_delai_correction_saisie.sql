-- =============================================================================
-- SYNOD — 0069 — Le delai de correction de saisie se regle, au lieu d'etre ecrit deux fois
-- =============================================================================
-- Reference : EF-BUR-08, EF-CRO-12. Demande de l'utilisateur, 21 aout 2026.
--
-- CE QUI ETAIT FIGE, ET DEUX FOIS
--
-- `JOURS_ERREUR_ASSIGNATION` (retrait d'un titulaire de bureau) et
-- `JOURS_ERREUR_GRADE` (correction d'un grade) valaient tous deux 15, ecrits
-- separement dans `lib/domain/bureau.ts` et `lib/domain/promotion.ts`. La meme
-- regle a deux endroits ne diverge pas le jour ou on l'ecrit — elle diverge le
-- jour ou on retouche l'un sans penser a l'autre. C'est exactement ce que le
-- projet a deja paye avec `bureau.delete`, non delegable en TypeScript et
-- delegable en SQL (migration 0025).
--
-- CE QUE CE DELAI BORNE : UN EFFACEMENT
--
-- « Erreur de saisie » ne clot pas un mandat ou une ligne d'historique, elle
-- l'EFFACE. Le delai est donc lu au moment de l'ECRITURE, jamais mis en cache
-- dans un formulaire ouvert depuis des heures : un onglet reste ouvert pendant
-- qu'on resserre le delai en administration, et il continuerait sinon d'effacer
-- sous l'ancienne regle (regle 21).
--
-- LA BORNE : NI ZERO NI UN AN
--
-- Un delai nul supprimerait la notion d'erreur rattrapable. Au-dela d'un an,
-- « correction de saisie » ne voudrait plus rien dire — une contrainte interdit
-- l'impossible, pas l'inhabituel (regle 26).
--
-- REJOUABLE (regle 23) : `add column if not exists`, contrainte sous garde.
-- =============================================================================

alter table organisation_settings
  add column if not exists jours_correction_saisie smallint not null default 15;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organisation_settings_delai_correction'
  ) then
    alter table organisation_settings
      add constraint organisation_settings_delai_correction
      check (jours_correction_saisie between 1 and 365);
  end if;
end $$;

comment on column organisation_settings.jours_correction_saisie is
  'EF-BUR-08, EF-CRO-12 : au-dela de ce delai depuis l''ENREGISTREMENT, retirer '
  'un titulaire ou corriger un grade n''est plus une erreur de saisie qui '
  'efface, mais une decision qui se motive et s''inscrit. Lu a CHAQUE ecriture '
  '(regle 21) — jamais mis en cache dans un formulaire ouvert depuis des heures.';

notify pgrst, 'reload schema';
