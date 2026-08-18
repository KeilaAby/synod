-- =============================================================================
-- SYNOD — 0045 — La composition de modeles s'ouvre ou se ferme, depuis le Siege
-- =============================================================================
-- Reference : EF-RAP-07, EF-RAP-08, EF-ADM-11.
--
-- CE QUE CE REGLAGE DECIDE
--
-- Le Siege pose des modeles OFFICIELS, que toute entite voit et qu'aucune autre
-- ne modifie (migration 0043). Reste une question qu'aucune colonne ne
-- tranchait : une entite a-t-elle le droit de composer LES SIENS a cote ?
--
--   ouvert (defaut) : elle emploie ceux du Siege ET dessine les siens ;
--   ferme           : elle se conforme aux modeles du Siege, et a eux seuls.
--
-- UN REGLAGE D'ORGANISATION, PAS UNE HABILITATION. `report.template.manage`
-- repond deja a « qui compose, et pour quelle entite » (RG-25). La question
-- posee ici est autre : « l'organisation autorise-t-elle qu'on compose
-- ailleurs qu'au Siege ? ». Elle vaut pour TOUTES les entites a la fois, se
-- regle en un endroit, et `settings.manage` — non delegable — la garde. La
-- porter par les habilitations obligerait a retirer un droit a cinquante
-- comptes pour repondre une fois.
--
-- LE SIEGE N'EST JAMAIS CONCERNE par son propre verrou : ferme, il ne pourrait
-- plus poser la trame a laquelle les autres doivent se conformer, et le
-- reglage se retournerait contre ce qu'il sert.
--
-- LE DEFAUT EST `true` — l'etat en vigueur avant cette migration. Une migration
-- corrige un defaut, elle n'impose pas un reglage : fermer la composition est
-- une decision, elle se prend a l'ecran.
--
-- REJOUABLE (regle 23) : `add column if not exists`.
-- =============================================================================

alter table organisation_settings
  add column if not exists rapport_composition_libre boolean not null default true;

comment on column organisation_settings.rapport_composition_libre is
  'EF-RAP-07 — les entites autres que le Siege peuvent-elles composer leurs '
  'propres modeles de rapport ? `false` : elles se conforment aux modeles '
  'officiels. Le Siege compose toujours, quel que soit ce reglage.';

/**
 * PostgREST garde un CACHE DE SCHEMA.
 *
 * Une colonne ajoutee sans cette purge reste invisible a l'API : la lecture des
 * parametres repondrait « column ... does not exist » sur du SQL pourtant en
 * place. Le piege a deja coute deux fois — les dimes (0034) et la synthese.
 */
notify pgrst, 'reload schema';
