-- =============================================================================
-- SYNOD — 0042 — Repartitions analytiques du tableau de bord
-- =============================================================================
-- Reference : EF-DSH-05 — « repartition par grade, nationalite, tranche d'age,
--             sexe ; taux d'encellulement ; couverture des bureaux ; classement
--             des entites filles. »
--
-- UNE SEULE FONCTION POUR QUATRE REPARTITIONS. Elles repondent a la meme
-- question — « comment se decompose notre effectif ? » — et ne different que
-- par la colonne de regroupement. Quatre fonctions auraient donne quatre
-- allers-retours et quatre endroits ou corriger la meme borne de perimetre
-- (regle 28).
--
-- LE CLASSEMENT DES ENTITES FILLES EST UNE REPARTITION, lui aussi : « combien
-- de croyants par eglise » se decompose exactement comme « combien par grade ».
-- Lui donner sa propre fonction aurait duplique le meme calcul sous un autre
-- nom.
--
-- SECURITY INVOKER (le defaut) : la RLS de `croyants` et d'`entities` borne le
-- resultat a la portee de l'appelant, et l'ecran n'a aucun filtrage a refaire.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Les repartitions
-- -----------------------------------------------------------------------------
--
-- `cle` sert a l'ordre et au lien ; `libelle` s'affiche. Les deux existent parce
-- qu'une tranche d'age se TRIE par sa borne basse et se LIT « 26 a 40 ans » :
-- trier sur le libelle mettrait « 18 a 25 » apres « 0 a 17 » mais aussi apres
-- « 61 ans et plus ».

-- On depose avant de creer, pour la meme raison que plus bas : ajouter une
-- colonne au `returns table` d'une fonction existante est un changement de type
-- de retour, et `create or replace` le refuse. Le faire des maintenant evite de
-- buter dessus a la premiere evolution.
drop function if exists fn_repartitions(uuid);

create function fn_repartitions(p_entity uuid)
returns table (
  dimension text,
  cle       text,
  libelle   text,
  effectif  integer
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
    select e.id, e.nom, e.code, e.type, e.parent_id
    from entities e, cible c
    where e.path <@ c.path
      and e.deleted_at is null
  ),
  gens as (
    select c.id, c.grade_id, c.nationalite_id, c.date_naissance, c.eglise_id
    from croyants c
    where c.deleted_at is null
      and c.statut = 'ACTIF'
      and c.eglise_id in (select id from perimetre)
  )

  -- Par GRADE.
  select 'GRADE', g.code, g.libelle, count(gens.id)::integer
    from grades g
    join gens on gens.grade_id = g.id
   group by g.code, g.libelle

  union all

  -- Par NATIONALITE. La colonne est `code_iso` et non `code` : une
  -- nationalite se designe par son code a trois lettres (EF-REF-02).
  select 'NATIONALITE', n.code_iso::text, n.libelle, count(gens.id)::integer
    from nationalites n
    join gens on gens.nationalite_id = n.id
   group by n.code_iso, n.libelle

  union all

  /**
   * Par TRANCHE D'AGE.
   *
   * Les bornes sont ECRITES ICI et non deduites d'un pas regulier : « 0 a 17 »
   * et « 18 a 25 » n'ont pas la meme largeur parce qu'elles ne repondent pas a
   * la meme question — l'une est la jeunesse, l'autre l'entree dans la vie
   * adulte. Un decoupage par tranches de dix ans serait regulier et ne dirait
   * rien.
   */
  select
    'AGE',
    t.cle,
    t.libelle,
    count(gens.id)::integer
  from (values
    ('1', '0 à 17 ans',      0,  17),
    ('2', '18 à 25 ans',    18,  25),
    ('3', '26 à 40 ans',    26,  40),
    ('4', '41 à 60 ans',    41,  60),
    ('5', '61 ans et plus', 61, 200)
  ) as t(cle, libelle, borne_basse, borne_haute)
  join gens
    on extract(year from age(gens.date_naissance))
       between t.borne_basse and t.borne_haute
  group by t.cle, t.libelle

  union all

  /**
   * Par ENTITE FILLE — le classement d'EF-DSH-05.
   *
   * LES FILLES DIRECTES, avec le total de LEUR sous-arbre : comparer un
   * district a une cellule n'aurait aucun sens, et ne compter que les croyants
   * rattaches en propre a un district en donnerait zero — ils sont dans ses
   * eglises.
   *
   * UNE FILLE SANS PERSONNE SORT A ZERO, et c'est le seul cas ou une tranche
   * vide merite sa ligne : un grade que nul ne detient est du bruit, une eglise
   * sans croyant est precisement celle qu'on cherche. Les `left join` sont la
   * pour cela.
   */
  select
    'ENTITE',
    fille.id::text,
    fille.nom,
    count(g.id)::integer
  from entities fille
  join cible ci on fille.parent_id = ci.id
  left join entities sous
    on sous.path <@ fille.path
   and sous.deleted_at is null
  left join croyants g
    on g.eglise_id = sous.id
   and g.deleted_at is null
   and g.statut = 'ACTIF'
  where fille.deleted_at is null
  group by fille.id, fille.nom;
$$;

comment on function fn_repartitions is
  'EF-DSH-05 — repartitions par grade, nationalite, tranche d''age et entite '
  'fille, en UNE passe. SECURITY INVOKER : la RLS borne le resultat.';


-- -----------------------------------------------------------------------------
-- 2. La couverture des bureaux entre au tableau de bord
-- -----------------------------------------------------------------------------
--
-- DEUX COLONNES DE PLUS, et non un ratio deja calcule : une jauge doit pouvoir
-- dire « 12 sur 20 », pas seulement « 60 % ». Un pourcentage seul ne distingue
-- pas trois entites sur cinq de six cents sur mille.
--
-- LES CELLULES SONT HORS DU COMPTE. RG-10 veut un bureau par entite, mais une
-- cellule de priere n'en a pas : les inclure ferait plonger la couverture de
-- toute organisation qui en compte beaucoup — c'est-a-dire de celles qui vont
-- le mieux.
--
-- IL FAUT DEPOSER LA FONCTION AVANT DE LA RECREER, et `create or replace` n'y
-- suffit pas : les parametres OUT font partie de la signature, si bien
-- qu'AJOUTER UNE COLONNE au `returns table` est un changement de type de
-- retour, que PostgreSQL refuse en remplacement (42P13).
--
-- Le `drop ... if exists` garde la migration rejouable (regle 23). Aucune vue
-- ni aucun trigger ne depend de cette fonction : rien ne tombe avec elle.

drop function if exists fn_tableau_de_bord(uuid, date, date);

create function fn_tableau_de_bord(
  p_entity uuid,
  p_debut  date,
  p_fin    date
)
returns table (
  croyants            integer,
  femmes              integer,
  hommes              integer,
  nouveaux_baptises   integer,
  encellules          integer,
  cellules            integer,
  eglises             integer,
  paroisses           integer,
  districts           integer,
  regionaux           integer,
  membres_bureau      integer,
  membres_finances    integer,
  bureaux_actifs      integer,
  entites_a_bureau    integer,
  recettes            numeric,
  depenses            numeric,
  solde_consolide     numeric,
  transferts_attente  integer,
  mouvements_attente  integer
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
    -- EF-DSH-05 — le denominateur de la couverture : les entites qui DOIVENT
    -- avoir un bureau. Les cellules n'en ont pas.
    (select count(*) from perimetre where type <> 'CELLULE')::integer,

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
  'EF-DSH-01 a 05 — les indicateurs d''un perimetre en UNE passe. '
  'SECURITY INVOKER : la RLS borne le resultat a la portee de l''appelant, '
  'l''ecran n''a aucun filtrage a refaire.';

notify pgrst, 'reload schema';
