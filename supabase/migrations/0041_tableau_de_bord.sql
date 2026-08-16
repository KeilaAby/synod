-- =============================================================================
-- SYNOD — 0041 — Les indicateurs du tableau de bord
-- =============================================================================
-- Reference : EF-DSH-01 a 04, EF-DSH-12 — un tableau de bord par perimetre,
--             borne aux donnees de l'utilisateur, dont les indicateurs se
--             masquent quand l'habilitation manque.
--
-- UNE FONCTION, UN ALLER-RETOUR, QUINZE INDICATEURS. Les demander un par un
-- couterait quinze fois 0,5 a 4 secondes avant le premier chiffre — soit une
-- minute pour une page qui doit s'ouvrir d'un coup (regle 28). Chaque compte
-- est un sous-select independant : PostgreSQL les evalue en une passe, et le
-- resultat tient en UNE ligne.
--
-- SECURITY INVOKER (le defaut), et c'est ce qui tient EF-DSH-02. La RLS de
-- `croyants`, d'`entities`, de `bureau_membres` et de `finance_entries`
-- s'applique a l'appelant : un gestionnaire de district n'obtient que son
-- district, sans que l'ecran n'ait le moindre filtrage a refaire. Ce qu'on ne
-- refait pas, on ne peut pas le rater.
--
-- LE PERIMETRE EST LE SOUS-ARBRE de `p_entity`, elle comprise — `<@` lit « est
-- descendant de, ou egal a ». Un district compte ses vingt eglises ET
-- lui-meme ; c'est ce que « vue consolidee » veut dire.
--
-- LES COMPTES D'EFFECTIF SONT INSTANTANES, les montants sont PERIODIQUES. Un
-- effectif est un etat — « combien sommes-nous aujourd'hui ? » — quand une
-- recette est un flux : « combien avons-nous recu ce mois-ci ? ». Leur donner
-- la meme borne temporelle rendrait l'un des deux faux.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================

create or replace function fn_tableau_de_bord(
  p_entity uuid,
  p_debut  date,
  p_fin    date
)
returns table (
  croyants           integer,
  femmes             integer,
  hommes             integer,
  nouveaux_baptises  integer,
  encellules         integer,
  cellules           integer,
  eglises            integer,
  paroisses          integer,
  districts          integer,
  regionaux          integer,
  membres_bureau     integer,
  membres_finances   integer,
  bureaux_actifs     integer,
  recettes           numeric,
  depenses           numeric,
  solde_consolide    numeric,
  transferts_attente integer,
  mouvements_attente integer
)
language sql
stable
as $$
  with cible as (
    select e.id, e.path
    from entities e
    where e.id = p_entity
      and e.deleted_at is null
  ),
  perimetre as (
    select e.id, e.type
    from entities e, cible c
    where e.path <@ c.path
      and e.deleted_at is null
  ),
  -- RG-30 : la fenetre des nouveaux baptises est un REGLAGE, jamais une
  -- constante. La coder en dur ici rendrait le parametre decoratif (regle 21).
  reglage as (
    select coalesce(max(fenetre_nouveaux_baptises_jours), 15) as jours
    from organisation_settings
  ),
  gens as (
    select c.id, c.sexe, c.date_bapteme, c.cellule_id
    from croyants c
    where c.deleted_at is null
      and c.statut = 'ACTIF'
      and c.eglise_id in (select id from perimetre)
  ),
  -- Un membre de bureau est un croyant dont le mandat est EN COURS : un mandat
  -- clos appartient a l'historique (EF-BUR-08), pas a l'effectif du jour.
  mandats as (
    select distinct m.croyant_id, f.est_financiere
    from bureau_membres m
    join bureaux b on b.id = m.bureau_id
    join fonctions f on f.id = m.fonction_id
    where b.deleted_at is null
      and b.is_active
      and b.entity_id in (select id from perimetre)
      and m.date_fin is null
  ),
  argent as (
    select f.sens, f.montant, f.date_operation
    from finance_entries f
    where f.statut = 'VALIDE'
      and f.deleted_at is null
      and f.entity_id in (select id from perimetre)
  )
  select
    (select count(*) from gens)::integer,
    (select count(*) from gens where sexe = 'F')::integer,
    (select count(*) from gens where sexe = 'M')::integer,
    (select count(*) from gens, reglage
      where date_bapteme >= current_date - (reglage.jours || ' days')::interval)::integer,
    (select count(*) from gens where cellule_id is not null)::integer,

    (select count(*) from perimetre where type = 'CELLULE')::integer,
    (select count(*) from perimetre where type = 'EGLISE')::integer,
    (select count(*) from perimetre where type = 'PAROISSE')::integer,
    (select count(*) from perimetre where type = 'DISTRICT')::integer,
    (select count(*) from perimetre where type = 'REGIONAL')::integer,

    (select count(distinct croyant_id) from mandats)::integer,
    (select count(distinct croyant_id) from mandats where est_financiere)::integer,
    (select count(*) from bureaux b
      where b.deleted_at is null and b.is_active
        and b.entity_id in (select id from perimetre))::integer,

    -- Les FLUX sont bornes a la periode demandee.
    (select coalesce(sum(montant), 0) from argent
      where sens = 'RECETTE' and date_operation between p_debut and p_fin),
    (select coalesce(sum(montant), 0) from argent
      where sens = 'DEPENSE' and date_operation between p_debut and p_fin),
    /**
     * LE SOLDE, LUI, EST UN CUMUL DEPUIS TOUJOURS.
     *
     * C'est de la tresorerie : « de combien disposons-nous ? ». Le borner a la
     * periode donnerait le RESULTAT du mois, un nombre tout aussi plausible
     * mais qui repond a une autre question — et sur lequel quelqu'un
     * engagerait une depense.
     */
    (select coalesce(sum(case when sens = 'RECETTE' then montant else -montant end), 0)
      from argent),

    /**
     * Les transferts qui attendent une DECISION DE CE PERIMETRE.
     *
     * C'est l'eglise de DESTINATION qui approuve : compter ceux qui partent
     * ferait apparaitre chez l'expediteur un travail qui ne lui revient pas.
     */
    (select count(*) from transferts t
      where t.statut = 'DEMANDE'
        and t.to_eglise_id in (select id from perimetre))::integer,
    (select count(*) from finance_entries f
      where f.statut = 'SOUMIS'
        and f.deleted_at is null
        and f.entity_id in (select id from perimetre))::integer;
$$;

comment on function fn_tableau_de_bord is
  'EF-DSH-01 a 04 — les indicateurs d''un perimetre en UNE passe. '
  'SECURITY INVOKER : la RLS borne le resultat a la portee de l''appelant, '
  'l''ecran n''a aucun filtrage a refaire.';

notify pgrst, 'reload schema';
