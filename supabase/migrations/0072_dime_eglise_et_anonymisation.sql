-- =============================================================================
-- SYNOD — 0072 — Le rapprochement des dîmes rendu à l'ÉGLISE, et l'enveloppe anonyme
-- =============================================================================
-- Reference : EF-FIN-34, RG-33. Demandes du 20 aout 2026, notes/todos.md §3
-- (« l'eglise lue, et le travail rendu a l'eglise »).
--
-- CE QUE CETTE MIGRATION CHANGE, EN UNE PHRASE : une ligne dont l'eglise a ete
-- RECONNUE (`dime_rapprochements.eglise_id`, migration 0058) devient visible
-- ET traitable par CETTE eglise, pas seulement par l'entite qui a collecte.
-- Avant `0072`, `eglise_id` n'etait qu'une etiquette d'affichage ; ici elle
-- devient une seconde porte d'acces.
--
-- POURQUOI DEUX PORTES, PAS UNE SEULE. Une ligne SANS eglise reconnue (le nom
-- ne correspondait a rien de connu) n'a QUE le collecteur pour la traiter —
-- rien ne change pour elle. Une ligne AVEC eglise reconnue, elle, concerne
-- deux entites a la fois : celle qui a physiquement recueilli l'argent
-- (`entite_id`, deja RLS avant cette migration) ET celle dont un membre est
-- concerne (`eglise_id`) — c'est ELLE qui connait les gens, et c'est ELLE qui
-- doit pouvoir rapprocher, creer une fiche, ou retrouver un porteur
-- d'enveloppe. RG-33 n'est PAS en cause ici : aucun solde ne bouge, seule la
-- VISIBILITE d'une file de travail s'elargit.
--
-- « RESOLU », REDEFINI SUR resolu_le, PAS SUR croyant_id. Une ligne se
-- fermait jusqu'ici uniquement en lui donnant un croyant. Or « basculer une
-- enveloppe en anonyme » (plus bas) ferme une ligne SANS jamais lui donner de
-- croyant — `croyant_id is null` resterait vrai indefiniment, et la ligne
-- resterait dans la file malgre la decision prise a son sujet. `resolu_le`
-- porte donc a lui seul la question « reste-t-il quelque chose a faire ? »,
-- quelle que soit la façon dont la ligne s'est fermee.
--
-- L'ENVELOPPE ANONYME VISE `nature_versement.ENVELOPPE_ANONYME` (migration
-- `0030`), deja prevue par la contrainte `dime_versements_nature_coherente`
-- pour un versement SANS croyant MAIS AVEC un numero — exactement le cas
-- d'une regle C (numero, sans nom) dont le porteur reste introuvable. Aucune
-- colonne nouvelle sur `dime_versements` : l'etat existait deja, il manquait
-- le chemin pour l'atteindre.
--
-- REJOUABLE (regle 23) : `create or replace` sur des signatures inchangees,
-- `drop policy if exists` avant chaque `create policy`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. « Resolu » se lit sur `resolu_le`, pas sur `croyant_id`.
-- -----------------------------------------------------------------------------
drop index if exists dime_rapprochements_attente_idx;
create index if not exists dime_rapprochements_attente_idx
  on dime_rapprochements (entite_id, created_at)
  where resolu_le is null;

create index if not exists dime_rapprochements_eglise_attente_idx
  on dime_rapprochements (eglise_id, created_at)
  where resolu_le is null and eglise_id is not null;


-- -----------------------------------------------------------------------------
-- 2. La RLS s'ouvre a l'eglise RECONNUE, en plus de l'entite collectrice.
-- -----------------------------------------------------------------------------
drop policy if exists dime_rapprochements_select on dime_rapprochements;
create policy dime_rapprochements_select on dime_rapprochements for select to authenticated
  using (
    entity_in_scope(entite_id)
    or (eglise_id is not null and entity_in_scope(eglise_id))
  );

drop policy if exists dime_rapprochements_write on dime_rapprochements;
create policy dime_rapprochements_write on dime_rapprochements for all to authenticated
  using (
    can('finance.dime.collect', entite_id)
    or (eglise_id is not null and can('finance.dime.collect', eglise_id))
  )
  with check (
    can('finance.dime.collect', entite_id)
    or (eglise_id is not null and can('finance.dime.collect', eglise_id))
  );


-- -----------------------------------------------------------------------------
-- 3. `fn_resoudre_rapprochement` : la meme extension de droit, et le meme
--    changement de definition de « resolu ».
-- -----------------------------------------------------------------------------
create or replace function fn_resoudre_rapprochement(
  p_rapprochement uuid,
  p_croyant       uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entite    uuid;
  v_eglise    uuid;
  v_versement uuid;
  v_enveloppe text;
  v_code      text;
  v_recu      text;
begin
  select r.entite_id, r.eglise_id, r.versement_id, r.enveloppe_source
    into v_entite, v_eglise, v_versement, v_enveloppe
    from dime_rapprochements r
   where r.id = p_rapprochement and r.resolu_le is null;

  if v_entite is null then
    raise exception 'Ce rapprochement est introuvable ou deja resolu.';
  end if;

  if not (
    can('finance.dime.collect', v_entite)
    or (v_eglise is not null and can('finance.dime.collect', v_eglise))
  ) then
    raise exception 'Vous n''avez pas le droit de resoudre ce rapprochement.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Le recu deja emis fait foi : il est peut-etre deja entre les mains du
  -- donateur.
  select recu_numero into v_recu from dime_versements where id = v_versement;

  if v_recu is null then
    select code into v_code from entities where id = v_entite;
    v_recu := fn_generer_recu_dime(v_code);
  end if;

  update dime_versements
     set croyant_id  = p_croyant,
         nature      = 'NOMINATIF',
         recu_numero = v_recu
   where id = v_versement;

  update dime_rapprochements
     set croyant_id = p_croyant,
         resolu_le  = now(),
         resolu_par = current_profile_id()
   where id = p_rapprochement;

  -- Regle B : le numero lu devient le sien, s'il n'appartient a personne.
  if v_enveloppe is not null then
    perform fn_attribuer_enveloppe(p_croyant, v_enveloppe);
  end if;

  return v_recu;
end $$;

revoke execute on function fn_resoudre_rapprochement from anon;


-- -----------------------------------------------------------------------------
-- 4. « Basculer une enveloppe en anonyme » — meme forme que la resolution,
--    ecriture en DEUX tables, indissociable (regle 20).
-- -----------------------------------------------------------------------------
create or replace function fn_marquer_enveloppe_anonyme(
  p_rapprochement uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entite    uuid;
  v_eglise    uuid;
  v_versement uuid;
  v_numero    text;
begin
  select r.entite_id, r.eglise_id, r.versement_id
    into v_entite, v_eglise, v_versement
    from dime_rapprochements r
   where r.id = p_rapprochement and r.resolu_le is null;

  if v_entite is null then
    raise exception 'Ce rapprochement est introuvable ou deja resolu.';
  end if;

  if not (
    can('finance.dime.collect', v_entite)
    or (v_eglise is not null and can('finance.dime.collect', v_eglise))
  ) then
    raise exception 'Vous n''avez pas le droit de resoudre ce rapprochement.'
      using errcode = 'insufficient_privilege';
  end if;

  select enveloppe_numero into v_numero from dime_versements where id = v_versement;

  if v_numero is null then
    raise exception
      'Cette ligne ne porte aucun numero d''enveloppe : rien a declarer anonyme.';
  end if;

  -- `dime_versements_nature_coherente` (0030) exige : ENVELOPPE_ANONYME =>
  -- croyant_id null ET enveloppe_numero non nul — deja le cas ici.
  update dime_versements
     set nature     = 'ENVELOPPE_ANONYME',
         croyant_id = null
   where id = v_versement;

  update dime_rapprochements
     set resolu_le  = now(),
         resolu_par = current_profile_id()
   where id = p_rapprochement;
end $$;

revoke execute on function fn_marquer_enveloppe_anonyme from anon;

comment on function fn_marquer_enveloppe_anonyme is
  'EF-FIN-34 : le porteur d''une enveloppe numerotee reste introuvable. '
  'Ferme la ligne SANS jamais lui donner de croyant — resolu_le porte seul '
  'la fermeture, dime_versements.nature passe a ENVELOPPE_ANONYME.';

notify pgrst, 'reload schema';
