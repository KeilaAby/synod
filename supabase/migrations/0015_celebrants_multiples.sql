-- =============================================================================
-- SYNOD — 0015 — Plusieurs celebrants par bapteme
-- =============================================================================
-- EF-BAP-03.
--
-- Un bapteme est frequemment celebre a plusieurs — un pasteur assiste d'un
-- diacre, deux pasteurs lors d'une ceremonie collective. La colonne
-- `celebrant_id` n'en portait qu'un : le second etait perdu, sans que rien ne
-- le signale.
--
-- POURQUOI UNE TABLE ET NON UN TABLEAU DE UUID
--
-- `uuid[]` aurait evite une table, mais aurait aussi perdu l'integrite
-- referentielle : rien n'empecherait d'y glisser l'identifiant d'un croyant
-- supprime, ou inexistant. Une table de liaison rend la contrainte a la base,
-- qui est le seul endroit ou elle tienne quoi qu'il arrive.
-- =============================================================================

create table if not exists bapteme_celebrants (
  bapteme_id uuid not null references baptemes(id) on delete cascade,
  -- `cascade` et non `restrict` : c'est la semantique que portait deja
  -- `celebrant_id ... on delete set null`. Purger un croyant de la corbeille
  -- ne doit pas etre bloque par un bapteme qu'il a celebre ; on perd le lien,
  -- pas le bapteme.
  croyant_id uuid not null references croyants(id) on delete cascade,
  primary key (bapteme_id, croyant_id)
);

comment on table bapteme_celebrants is
  'Celebrants d''un bapteme — EF-BAP-03. Plusieurs par ceremonie.';

create index if not exists bapteme_celebrants_croyant_idx
  on bapteme_celebrants (croyant_id);


-- -----------------------------------------------------------------------------
-- Reprise des celebrants deja saisis
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'baptemes'
       and column_name  = 'celebrant_id'
  ) then
    insert into bapteme_celebrants (bapteme_id, croyant_id)
    select id, celebrant_id from baptemes where celebrant_id is not null
    on conflict do nothing;

    -- La colonne part : deux sources de verite pour la meme information
    -- divergent toujours.
    alter table baptemes drop column celebrant_id;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- RLS — un celebrant se voit si son bapteme se voit
-- -----------------------------------------------------------------------------
--
-- La politique ne reecrit AUCUNE regle de perimetre : elle interroge
-- `baptemes`, qui porte deja la sienne (`entity_in_scope`). Recopier la regle
-- ici la ferait diverger le jour ou l'une des deux changerait.

alter table bapteme_celebrants enable row level security;

drop policy if exists bapteme_celebrants_select on bapteme_celebrants;
drop policy if exists bapteme_celebrants_ecriture on bapteme_celebrants;
drop policy if exists bapteme_celebrants_suppression on bapteme_celebrants;

create policy bapteme_celebrants_select on bapteme_celebrants
  for select to authenticated
  using (
    exists (select 1 from baptemes b where b.id = bapteme_celebrants.bapteme_id)
  );

create policy bapteme_celebrants_ecriture on bapteme_celebrants
  for insert to authenticated
  with check (
    exists (
      select 1 from baptemes b
       where b.id = bapteme_celebrants.bapteme_id
         and can('bapteme.create', b.entity_id)
    )
  );

create policy bapteme_celebrants_suppression on bapteme_celebrants
  for delete to authenticated
  using (
    exists (
      select 1 from baptemes b
       where b.id = bapteme_celebrants.bapteme_id
         and can('bapteme.create', b.entity_id)
    )
  );
