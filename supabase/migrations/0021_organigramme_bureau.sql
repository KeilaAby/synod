-- =============================================================================
-- SYNOD — 0021 — L'organigramme d'un bureau se DESSINE
-- =============================================================================
-- EF-BUR-07. Arbitrage du 9 aout 2026.
--
-- CE QUI MANQUAIT
--
-- L'organigramme se deduisait du rang protocolaire : une suite de bandes
-- horizontales, la meme pour tous les bureaux. C'est une PRESEANCE, et elle ne
-- dit rien de la facon dont une entite s'organise reellement — quel adjoint
-- depend de quel responsable, quelle commission releve de quel poste.
--
-- Le rang reste ce qu'il est : l'ordre du referentiel, valable partout. Ce que
-- cette table ajoute, c'est la DISPOSITION propre a un bureau.
--
-- POURQUOI PAR BUREAU, ET NON SUR LA FONCTION
--
-- Porter le parent sur `fonctions` imposerait le meme organigramme a toutes les
-- entites de tous les niveaux. Or un district et une cellule n'ont ni les memes
-- fonctions ni les memes usages. La disposition appartient donc au bureau.
--
-- CE QUE CETTE TABLE NE DECIDE PAS
--
-- Elle ne dit pas QUELLES fonctions composent le bureau : cela reste
-- `fonctions.niveaux_applicables` (EF-REF-03). Une fonction applicable qui
-- n'aurait pas de ligne ici reste un poste du bureau, place par defaut a son
-- rang. Sans cela, oublier de poser un bloc ferait disparaitre un poste de
-- tresorier — et le bureau paraitrait complet.
-- =============================================================================

create table if not exists bureau_postes (
  id                 uuid primary key default gen_random_uuid(),
  bureau_id          uuid not null references bureaux(id)   on delete cascade,
  fonction_id        uuid not null references fonctions(id) on delete cascade,
  -- Le superieur DANS CE BUREAU. `null` : le poste est une racine.
  parent_fonction_id uuid references fonctions(id) on delete set null,
  -- Position libre sur le plan (EF-BUR-07) : l'utilisateur dispose comme il
  -- l'entend, la base ne recalcule rien.
  pos_x              double precision not null default 0,
  pos_y              double precision not null default 0,
  updated_by         uuid references profiles(id) on delete set null,
  updated_at         timestamptz not null default now(),

  constraint postes_parent_distinct check (parent_fonction_id is distinct from fonction_id)
);

comment on table bureau_postes is
  'Disposition de l''organigramme d''un bureau — EF-BUR-07. '
  'N''enumere pas les postes : elle place ceux que le referentiel declare.';

create unique index if not exists postes_bureau_fonction
  on bureau_postes (bureau_id, fonction_id);

create index if not exists postes_bureau_idx on bureau_postes (bureau_id);


-- -----------------------------------------------------------------------------
-- Un organigramme est un ARBRE : ni boucle, ni branche detachee
-- -----------------------------------------------------------------------------

/**
 * SECURITY DEFINER : le trigger remonte la chaine des parents dans
 * `bureau_postes`, verrouillee par RLS. Un trigger s'execute avec les droits de
 * l'appelant (regle 13) ; sans cela, la remontee s'arreterait sur la premiere
 * ligne invisible et laisserait passer le cycle qu'elle devait interdire.
 *
 * Le domaine refuse deja le geste a l'ecran, avec sa raison. Ici, c'est le
 * filet : un appel direct a l'API ne doit pas pouvoir rendre un organigramme
 * infiniment profond, que plus aucun affichage ne saurait dessiner.
 */
create or replace function fn_poste_sans_cycle() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_courant    uuid;
  v_suivant    uuid;
  v_profondeur integer := 0;
begin
  if new.parent_fonction_id is null then
    return new;
  end if;

  v_courant := new.parent_fonction_id;

  while v_courant is not null loop
    if v_courant = new.fonction_id then
      raise exception 'Ce rattachement creerait une boucle dans l''organigramme.'
        using errcode = 'check_violation';
    end if;

    v_profondeur := v_profondeur + 1;
    if v_profondeur > 64 then
      raise exception 'Cet organigramme est trop profond pour etre represente.'
        using errcode = 'check_violation';
    end if;

    select p.parent_fonction_id into v_suivant
      from bureau_postes p
     where p.bureau_id = new.bureau_id
       and p.fonction_id = v_courant;

    -- Sans ce test, une fonction sans ligne laisserait `v_suivant` inchange et
    -- la boucle tournerait indefiniment sur la meme valeur.
    if not found then
      v_courant := null;
    else
      v_courant := v_suivant;
    end if;
  end loop;

  return new;
end $$;

drop trigger if exists trg_poste_sans_cycle on bureau_postes;
create trigger trg_poste_sans_cycle
  before insert or update of parent_fonction_id on bureau_postes
  for each row execute function fn_poste_sans_cycle();


-- -----------------------------------------------------------------------------
-- RLS — la disposition se lit comme son bureau, se modifie comme sa composition
-- -----------------------------------------------------------------------------

alter table bureau_postes enable row level security;

-- Les politiques interrogent `bureaux` plutot que de recopier sa regle de
-- perimetre : deux ecritures d'une meme regle finissent toujours par diverger.

drop policy if exists postes_select on bureau_postes;
create policy postes_select on bureau_postes for select to authenticated
  using (exists (select 1 from bureaux b where b.id = bureau_postes.bureau_id));

drop policy if exists postes_insert on bureau_postes;
create policy postes_insert on bureau_postes for insert to authenticated
  with check (
    exists (
      select 1 from bureaux b
       where b.id = bureau_postes.bureau_id
         and can('bureau.manage', b.entity_id)
    )
  );

drop policy if exists postes_update on bureau_postes;
create policy postes_update on bureau_postes for update to authenticated
  using (
    exists (
      select 1 from bureaux b
       where b.id = bureau_postes.bureau_id
         and can('bureau.manage', b.entity_id)
    )
  );

drop policy if exists postes_delete on bureau_postes;
create policy postes_delete on bureau_postes for delete to authenticated
  using (
    exists (
      select 1 from bureaux b
       where b.id = bureau_postes.bureau_id
         and can('bureau.manage', b.entity_id)
    )
  );
