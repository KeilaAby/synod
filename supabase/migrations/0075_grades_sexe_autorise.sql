-- =============================================================================
-- Migration 0075 — Restriction des sexes assignables aux grades
--
-- Permet de réserver certains grades aux hommes (ex: Pasteur), aux femmes,
-- ou de les laisser ouverts à tous ('TOUS' par défaut).
-- =============================================================================

alter table grades
  add column if not exists sexe_autorise text not null default 'TOUS'
  check (sexe_autorise in ('TOUS', 'M', 'F'));

comment on column grades.sexe_autorise is
  'Restriction de sexe pour l''assignation de ce grade : TOUS, M (hommes uniquement), ou F (femmes uniquement).';

notify pgrst, 'reload schema';
