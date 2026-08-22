-- =============================================================================
-- SYNOD — 0073 — L'en-tete propre a chaque entite, source du bloc Image
-- =============================================================================
-- Reference : EF-RAP-02, notes/todos.md §4 (« Logo televerse pour le bloc
-- Image »). Corrige le 22 aout 2026, en testant `0072` en conditions
-- reelles : le premier jet ne connaissait qu'UN logo, celui de
-- l'organisation entiere. L'utilisateur a demande la portee correcte —
-- « les entites auront peut-etre leur propre en-tete. Si l'entite n'a pas
-- d'en-tete alors le logo de l'organisation se placera » — AVANT que le
-- premier jet ne soit repousse en production.
--
-- DEUX NIVEAUX, PAS UNE HIERARCHIE A ESCALADER. L'entite visee par le
-- rapport porte son propre `logo_key` si elle en a un ; a defaut,
-- `organisation_settings.logo_key` (migration 0006, ecran pose la veille)
-- prend le relais. Rien n'escalade par les ancetres — une eglise sans
-- en-tete n'emprunte pas celui de sa paroisse : c'est le logo de
-- l'ORGANISATION qui sert de defaut, pas celui du parent le plus proche qui
-- en a un, ce qui rendrait la resolution dependante d'un parcours de l'arbre
-- a la generation (cout, et un defaut moins previsible).
--
-- AUCUNE RLS NOUVELLE : `logo_key` est une colonne de plus sur une ligne deja
-- lisible par la RLS existante (`entities_select`, migration 0003) et
-- modifiable par l'action deja gardee par `entity.update` (RG-25 —
-- DESCENDANTE par defaut, comme le reste de la fiche entite).
-- =============================================================================

alter table entities add column if not exists logo_key text;

comment on column entities.logo_key is
  'EF-RAP-02 — en-tete propre a l''entite (cle relative, regle 11), source du '
  'bloc Image a la generation d''un rapport. Absent : le logo de '
  'l''organisation (organisation_settings.logo_key) prend sa place.';

notify pgrst, 'reload schema';
