-- =============================================================================
-- SYNOD — 0071 — Le lien conjugal entre deux fiches de croyants
-- =============================================================================
-- Reference : EF-CRO-14 (cdg.md, ajoutee le 22 aout 2026). Demande de
-- l'utilisateur, 20 aout 2026, reprise dans notes/todos.md §1.
--
-- LE LIEN EST SYMETRIQUE, PAR TRIGGER — pas par deux ecritures applicatives.
-- Relier A a B doit relier B a A dans le MEME geste : deux ecritures
-- indissociables se font en base (regle 20). Une colonne `conjoint_id` posee
-- d'un seul cote laisserait les deux fiches se contredire des la premiere
-- saisie qui n'y pense pas.
--
-- SECURITY DEFINER, parce que le trigger ecrit sur une AUTRE ligne que celle
-- que l'utilisateur editait. La RLS de `croyants_update` borne l'ecriture a
-- la portee de l'auteur (`can('croyant.update', eglise_id)`) : relier son
-- eglise a un conjoint d'une autre eglise, hors de sa portee, echouerait sans
-- cela — exactement le cas d'un trigger qui ecrit dans une table verrouillee
-- par RLS (regle 13).
--
-- LE DIVORCE EFFACE LE LIEN, SANS HISTORIQUE — decision explicite du 20 aout.
-- Ce registre sert l'eglise d'aujourd'hui, pas la genealogie : une union
-- passee qui trainerait dans une fiche est une information que personne n'a
-- demande a voir. Le MEME trigger porte cet effacement : NEW.conjoint_id a
-- NULL relache symetriquement l'ancien conjoint.
--
-- LE DECES REND LE SURVIVANT VEUF/VEUVE, mais ne touche PAS au lien : on sait
-- toujours qui etait l'epoux ou l'epouse. Un second trigger, distinct du
-- premier (une seule responsabilite chacun), regarde le changement de STATUT
-- et non celui de `conjoint_id`.
--
-- REJOUABLE (regle 23).
-- =============================================================================

alter table croyants
  add column if not exists conjoint_id uuid references croyants(id) on delete set null;

comment on column croyants.conjoint_id is
  'EF-CRO-14 : lien symetrique maintenu par fn_conjoint_symetrique(). '
  'Facultatif meme si statut_marital = MARIE — le conjoint peut ne pas etre '
  'croyant, ou ne pas encore avoir de fiche.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'croyants_conjoint_pas_soi_meme'
  ) then
    alter table croyants
      add constraint croyants_conjoint_pas_soi_meme
      check (conjoint_id is null or conjoint_id <> id);
  end if;
end $$;

create index if not exists croyants_conjoint_idx
  on croyants (conjoint_id) where deleted_at is null and conjoint_id is not null;


-- -----------------------------------------------------------------------------
-- 1. La symetrie du lien — pose ou effacement, en un seul trigger.
-- -----------------------------------------------------------------------------
create or replace function fn_conjoint_symetrique() returns trigger
security definer set search_path = public
language plpgsql as $$
declare
  v_ancien uuid := case when tg_op = 'UPDATE' then old.conjoint_id else null end;
begin
  if new.conjoint_id is not distinct from v_ancien then
    return new;
  end if;

  -- Le NOUVEAU conjoint (s'il y en a un) pointe desormais en retour vers nous.
  -- La garde `is distinct from` arrete la recursion du trigger : une fois
  -- l'etat symetrique atteint, l'UPDATE suivant ne touche plus aucune ligne.
  if new.conjoint_id is not null then
    update croyants
      set conjoint_id = new.id
      where id = new.conjoint_id
        and conjoint_id is distinct from new.id;
  end if;

  -- L'ANCIEN conjoint (s'il y en avait un, et qu'il a change) est RELACHE :
  -- sans cela il resterait marie a nous alors que nous avons change ou nous
  -- sommes efface — le cas exact du divorce (20 aout 2026 : « le lien
  -- s'efface, sans historique »).
  if v_ancien is not null and v_ancien is distinct from new.conjoint_id then
    update croyants
      set conjoint_id = null
      where id = v_ancien
        and conjoint_id = new.id;
  end if;

  return new;
end $$;

drop trigger if exists trg_croyants_conjoint_symetrique on croyants;
create trigger trg_croyants_conjoint_symetrique
  after insert or update of conjoint_id on croyants
  for each row execute function fn_conjoint_symetrique();


-- -----------------------------------------------------------------------------
-- 2. Le deces rend le conjoint survivant veuf/veuve — RG distincte du lien.
-- -----------------------------------------------------------------------------
create or replace function fn_conjoint_veuvage() returns trigger
security definer set search_path = public
language plpgsql as $$
begin
  if new.statut = 'DECEDE' and old.statut is distinct from 'DECEDE'
     and new.conjoint_id is not null then
    update croyants
      set statut_marital = 'VEUF'
      where id = new.conjoint_id;
  end if;

  return new;
end $$;

drop trigger if exists trg_croyants_conjoint_veuvage on croyants;
create trigger trg_croyants_conjoint_veuvage
  after update of statut on croyants
  for each row execute function fn_conjoint_veuvage();

notify pgrst, 'reload schema';
