-- =============================================================================
-- SYNOD — 0012 — Correctifs sur les croyants
-- =============================================================================
-- 1. Les fonctions de trigger doivent contourner la RLS des tables internes.
-- 2. La date de bapteme devient facultative.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. SECURITY DEFINER sur les fonctions de trigger
--
-- `matricule_sequences` porte une politique `using (false)` : c'est une table
-- de comptage interne, que personne ne doit lire ni ecrire directement. Mais
-- `fn_generer_matricule` y ecrit, et un trigger s'execute par defaut avec les
-- droits de l'APPELANT — donc du role `authenticated`, a qui tout est refuse.
--
-- Resultat : toute creation de croyant echouait sur
-- « new row violates row-level security policy for table matricule_sequences ».
--
-- SECURITY DEFINER fait executer ces fonctions avec les droits du proprietaire.
-- L'autorisation reste portee par la politique RLS de `croyants` : c'est elle
-- qui decide QUI peut inserer, la fonction ne fait qu'attribuer un numero.
-- -----------------------------------------------------------------------------

create or replace function fn_generer_matricule(p_code_eglise text) returns text
language plpgsql security definer set search_path = public as $$
declare v_cle text; v_seq integer;
begin
  v_cle := p_code_eglise || ':' || extract(year from current_date)::text;

  insert into matricule_sequences (cle, dernier)
  values (v_cle, 1)
  on conflict (cle) do update set dernier = matricule_sequences.dernier + 1
  returning dernier into v_seq;

  return format('%s-%s-%s', p_code_eglise, extract(year from current_date),
                lpad(v_seq::text, 4, '0'));
end $$;


-- Meme raison : ce trigger lit `entities`, table soumise a la RLS. Si le
-- filtrage masquait la ligne, la fonction conclurait a tort que l'eglise
-- n'existe pas et leverait « RG-04 » — un message faux.
create or replace function fn_croyants_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_eglise entities%rowtype; v_cellule entities%rowtype;
begin
  select * into v_eglise from entities where id = new.eglise_id;
  if not found or v_eglise.type <> 'EGLISE' then
    raise exception 'RG-04 : le rattachement principal doit etre une Eglise'
      using errcode = 'check_violation';
  end if;

  if new.cellule_id is not null then
    select * into v_cellule from entities where id = new.cellule_id;
    if not found or v_cellule.type <> 'CELLULE' then
      raise exception 'RG-05 : la cellule indiquee n''est pas une Cellule de priere'
        using errcode = 'check_violation';
    end if;
    if v_cellule.parent_id is distinct from new.eglise_id then
      raise exception 'RG-05 : la cellule « % » n''appartient pas a l''eglise « % »',
        v_cellule.nom, v_eglise.nom
        using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.matricule := fn_generer_matricule(v_eglise.code);
  else
    new.matricule := old.matricule;   -- RG-29
  end if;

  new.updated_at := now();
  return new;
end $$;


-- Idem : `fn_ancetre_commun` parcourt `entities` pour determiner l'approbateur
-- competent (RG-12). Un filtrage RLS fausserait ce calcul.
create or replace function fn_ancetre_commun(a uuid, b uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select e.id
    from entities e,
         (select path from entities where id = a) pa,
         (select path from entities where id = b) pb
   where pa.path <@ e.path
     and pb.path <@ e.path
     and e.deleted_at is null
   order by nlevel(e.path) desc
   limit 1
$$;


-- -----------------------------------------------------------------------------
-- 2. Date de bapteme facultative
--
-- Une fiche se cree souvent avant que la date de bapteme ne soit connue —
-- reprise d'un registre papier, croyant en cours de preparation. L'exiger
-- bloquait la saisie sur une information qui arrive plus tard.
--
-- Les contraintes CHECK existantes tolerent deja NULL : `NULL >= date` vaut
-- NULL, et un CHECK n'echoue que sur FALSE. Seul le NOT NULL est a lever.
--
-- `baptemes.date_bapteme` reste obligatoire : cette table n'existe que
-- lorsqu'un bapteme est effectivement declare (EF-BAP-01).
-- -----------------------------------------------------------------------------
alter table croyants alter column date_bapteme drop not null;

comment on column croyants.date_bapteme is
  'Facultative : peut etre renseignee apres coup. RG-30 ne compte que les fiches ou elle est presente.';
