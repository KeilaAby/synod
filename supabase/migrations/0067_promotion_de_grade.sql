-- =============================================================================
-- SYNOD — 0067 — La promotion de grade passe par l'entite superieure
-- =============================================================================
-- Reference : EF-CRO-12, RG-06. Demande du 20 aout 2026.
--
-- LE BESOIN. Changer le grade d'un croyant — le faire Diacre, puis Pasteur —
-- n'est pas une correction de fiche : c'est une reconnaissance, et elle engage
-- l'organisation. Aujourd'hui, quiconque detient `croyant.update` sur l'eglise
-- la pose seul, et rien n'en garde trace au-dela d'une ligne d'audit.
--
-- CE QUE CETTE MIGRATION APPORTE : un circuit, ACTIVABLE.
--
--   1. `organisation_settings.promotion_grade_validation` — le workflow existe
--      ou n'existe pas. Ferme, le grade se change comme avant : cette demande
--      n'invalide pas les organisations qui n'en veulent pas.
--   2. `promotions_grade` — la demande, et ce qu'elle est devenue.
--   3. `fn_decider_promotion` — approuver POSE le grade, en une transaction.
--
-- LE REGLAGE EST GLOBAL, PAS PAR ENTITE — et c'est l'ecart a signaler.
--
-- Le workflow financier, lui, s'active entite par entite (EF-FIN-15 amende) :
-- chaque bureau gere ses comptes. Un grade ne se compare pas : il vaut dans
-- TOUTE l'organisation. « Pasteur a Antananarivo » et « Pasteur a Toamasina »
-- doivent designer la meme chose, sans quoi le referentiel ne veut plus rien
-- dire. Un circuit ouvert ici et ferme la produirait exactement cela.
--
-- QUI DECIDE : L'ENTITE SUPERIEURE, FIGEE A LA DEMANDE.
--
-- `arbitre_id` porte le PARENT de l'eglise du croyant, copie au moment de la
-- demande — meme mecanique que `ancetre_commun_id` sur les transferts (`0011`).
-- Le figer evite qu'une reorganisation de la structure change, apres coup, qui
-- etait competent : une demande se juge sous la hierarchie du jour ou elle a
-- ete faite.
--
-- La competence tombe alors d'elle-meme : `can(..., arbitre_id)` n'est vrai que
-- pour un compte dont la portee couvre le PARENT. Celui qui est borne a
-- l'eglise ne peut pas s'approuver lui-meme, et il n'y a aucune regle de plus
-- a ecrire pour cela.
--
-- CE QU'ON NE FAIT PAS : toucher `croyants.grade_id` autrement que par
-- `fn_decider_promotion`. La table des demandes ne duplique pas le grade
-- courant — elle porte celui qu'on QUITTE et celui qu'on VISE, pour que le
-- document se relise ; le grade en vigueur reste sur la fiche, source unique.
--
-- REJOUABLE (regle 23) : `if not exists` partout, `drop policy` avant `create`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Le reglage
-- -----------------------------------------------------------------------------

alter table organisation_settings
  add column if not exists promotion_grade_validation boolean not null default false;

comment on column organisation_settings.promotion_grade_validation is
  'EF-CRO-12 — la promotion de grade doit-elle etre approuvee par l''entite '
  'superieure ? Ferme (defaut), le grade se change directement : cette regle '
  'n''invalide pas les organisations qui n''en veulent pas.';


-- -----------------------------------------------------------------------------
-- 2. La demande
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'statut_promotion') then
    create type statut_promotion as enum ('DEMANDE', 'APPROUVE', 'REFUSE', 'ANNULE');
  end if;
end $$;

create table if not exists promotions_grade (
  id             uuid primary key default gen_random_uuid(),
  croyant_id     uuid not null references croyants(id) on delete cascade,

  /**
   * LE GRADE QU'ON QUITTE, copie a la demande.
   *
   * Nullable : une fiche peut n'en porter aucun. Le conserver ici plutot que de
   * le relire sur la fiche au moment de decider est ce qui rend la demande
   * RELISIBLE — « de Croyant a Diacre » se comprend six mois plus tard, quand
   * la fiche porte deja autre chose.
   */
  grade_actuel_id  uuid references grades(id) on delete set null,
  grade_demande_id uuid not null references grades(id) on delete restrict,

  /** L'entite SUPERIEURE competente, figee : voir l'en-tete. */
  arbitre_id     uuid not null references entities(id) on delete restrict,
  /** L'eglise du croyant au moment de la demande — porte la RLS de lecture. */
  eglise_id      uuid not null references entities(id) on delete restrict,

  statut         statut_promotion not null default 'DEMANDE',
  motif          text,
  motif_refus    text,

  demande_par    uuid references profiles(id) on delete set null,
  date_demande   timestamptz not null default now(),
  decide_par     uuid references profiles(id) on delete set null,
  date_decision  timestamptz,

  -- Une promotion vers le grade qu'on porte deja n'est pas une promotion.
  constraint promotion_grade_different check (grade_actuel_id is distinct from grade_demande_id)
);

comment on table promotions_grade is
  'EF-CRO-12 — demande de changement de grade, tranchee par l''entite '
  'superieure. Le grade en vigueur reste sur la fiche du croyant : cette table '
  'porte la DEMANDE, pas l''etat.';

/**
 * RG-06 — UNE SEULE DEMANDE EN COURS PAR CROYANT.
 *
 * L'index partiel dit la regle mieux qu'un trigger : elle tient meme si
 * l'application se trompe. Deux demandes ouvertes laisseraient l'entite
 * superieure trancher deux fois, et le second verdict ecraserait le premier
 * sans que personne ne l'ait voulu.
 */
create unique index if not exists promotions_une_en_cours
  on promotions_grade (croyant_id)
  where statut = 'DEMANDE';

create index if not exists promotions_arbitre_idx
  on promotions_grade (arbitre_id, date_demande)
  where statut = 'DEMANDE';

alter table promotions_grade enable row level security;

/**
 * LA LECTURE SUIT DEUX CHEMINS, et il en faut bien deux.
 *
 * L'eglise doit voir les demandes qu'elle a faites — sinon elle ne saurait pas
 * ou elles en sont. L'arbitre doit voir celles qu'il a a trancher, y compris
 * quand l'eglise concernee n'est pas dans sa portee de lecture directe.
 */
drop policy if exists promotions_select on promotions_grade;
create policy promotions_select on promotions_grade for select to authenticated
  using (entity_in_scope(eglise_id) or entity_in_scope(arbitre_id));

/**
 * DEMANDER, C'EST METTRE A JOUR LE CROYANT — meme droit, meme portee.
 *
 * `croyant.update` sur l'eglise : celui qui pouvait poser le grade lui-meme
 * avant ce circuit peut desormais le DEMANDER. On ne cree pas un droit de plus
 * pour un geste qui n'a pas change de nature ; ce qui a change, c'est qui
 * tranche.
 */
drop policy if exists promotions_insert on promotions_grade;
create policy promotions_insert on promotions_grade for insert to authenticated
  with check (can('croyant.update', eglise_id));

/**
 * LA DECISION PASSE PAR LA FONCTION, pas par un `update` direct : elle doit
 * poser le grade DANS LA MEME TRANSACTION (regle 20). La politique couvre le
 * retrait de sa propre demande — l'eglise peut se raviser tant que rien n'est
 * tranche.
 */
drop policy if exists promotions_update on promotions_grade;
create policy promotions_update on promotions_grade for update to authenticated
  using (statut = 'DEMANDE' and can('croyant.update', eglise_id))
  with check (statut in ('DEMANDE', 'ANNULE'));


-- -----------------------------------------------------------------------------
-- 3. Decider — approuver POSE le grade, d'un seul tenant
-- -----------------------------------------------------------------------------

/**
 * DEUX ECRITURES INDISSOCIABLES (regle 20) : la demande se ferme ET le grade
 * change. L'une sans l'autre laisserait soit une promotion approuvee qui n'a
 * rien change, soit un grade pose dont la demande reste ouverte — deux etats
 * faux que rien n'affiche.
 *
 * SECURITY DEFINER, et le droit est verifie ICI, sur l'ARBITRE : c'est le
 * coeur de la regle. `can(..., arbitre_id)` n'est vrai que pour un compte dont
 * la portee couvre l'entite superieure ; celui qui est borne a l'eglise ne peut
 * pas s'approuver lui-meme.
 */
create or replace function fn_decider_promotion(
  p_promotion uuid,
  p_approuver boolean,
  p_motif     text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_arbitre uuid;
  v_croyant uuid;
  v_grade   uuid;
  v_profil  uuid := current_profile_id();
begin
  select arbitre_id, croyant_id, grade_demande_id
    into v_arbitre, v_croyant, v_grade
    from promotions_grade
   where id = p_promotion and statut = 'DEMANDE'
     for update;

  if v_arbitre is null then
    raise exception 'Cette demande est introuvable ou deja tranchee.'
      using errcode = 'no_data_found';
  end if;

  if not can('croyant.grade.approve', v_arbitre) then
    raise exception 'Seule l''entite superieure peut trancher une promotion de grade.'
      using errcode = 'insufficient_privilege';
  end if;

  /**
   * UN REFUS SE MOTIVE, une approbation non.
   *
   * Approuver confirme ce que la demande disait deja ; refuser dit le
   * contraire, et celui qui a demande doit pouvoir comprendre pourquoi sans
   * avoir a telephoner.
   */
  if not p_approuver and coalesce(trim(p_motif), '') = '' then
    raise exception 'Un refus de promotion doit etre motive.'
      using errcode = 'check_violation';
  end if;

  update promotions_grade
     set statut        = case when p_approuver then 'APPROUVE' else 'REFUSE' end,
         motif_refus   = case when p_approuver then null else trim(p_motif) end,
         decide_par    = v_profil,
         date_decision = now()
   where id = p_promotion;

  -- Le grade ne se pose QUE sur approbation, et seulement ici.
  if p_approuver then
    update croyants set grade_id = v_grade where id = v_croyant;
  end if;

  return case when p_approuver then 'APPROUVE' else 'REFUSE' end;
end $$;

comment on function fn_decider_promotion is
  'EF-CRO-12 — approuve ou refuse une promotion de grade. Approuver POSE le '
  'grade dans la meme transaction : l''un sans l''autre laisserait un etat faux '
  'que rien n''affiche. Le droit est verifie sur l''ARBITRE, donc sur l''entite '
  'superieure.';

revoke execute on function fn_decider_promotion from anon;


/**
 * PostgREST garde un CACHE DE SCHEMA : sans cette purge, l'API repondrait
 * « fonction inconnue » et « column ... does not exist » sur du SQL pourtant
 * en place — constate deux fois.
 */
notify pgrst, 'reload schema';
