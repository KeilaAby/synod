-- =============================================================================
-- SYNOD — 0039 — La synthese periodique
-- =============================================================================
-- Reference : EF-FIN-24 — « Produire une synthese periodique (mensuelle,
--             trimestrielle, annuelle) : recettes et depenses par categorie,
--             evolution du solde, comparatif entre entites soeurs. »
--
-- CES FONCTIONS RENDENT UNE ANNEE ENTIERE, MOIS PAR MOIS
--
-- Elles pourraient rendre le total d'une periode demandee. Elles rendent le
-- DETAIL MENSUEL de l'annee, et c'est un choix, pas une facilite : changer de
-- mois ou passer du trimestre a l'annee devient alors une somme faite dans le
-- navigateur, instantanee, au lieu d'un aller-retour de 0,5 a 4 s (regles 17
-- et 28). L'utilisateur d'une synthese compare — il ne consulte pas une
-- periode, il en parcourt plusieurs.
--
-- Le volume le permet largement : une vingtaine de categories sur douze mois
-- font quelques centaines de lignes, moins qu'une page de mouvements.
--
-- LES DEUX PORTEES SONT RENDUES ENSEMBLE — propre et consolide. Le basculement
-- ne coute alors rien lui non plus, et surtout les deux nombres viennent du
-- MEME passage : deux appels separes pourraient tomber de part et d'autre
-- d'une validation et se contredire.
--
-- L'EVOLUTION DU SOLDE N'A PAS DE FONCTION : elle est la somme des categories
-- par mois, que l'ecran fait en une ligne. Une troisieme fonction aurait
-- reposer la meme question a la base pour obtenir un total qu'elle a deja
-- donne en detail.
--
-- SECURITY INVOKER (le defaut), comme `fn_finance_soldes_perimetre` : la RLS de
-- `finance_entries` et d'`entities` s'applique a l'appelant. L'ecran n'a aucun
-- filtrage a refaire, et ne peut donc pas se tromper en le faisant.
--
-- RG-18 PARTOUT : seul le VALIDE alimente une synthese. Le brouillon, le
-- soumis, le rejete et l'annule n'entrent nulle part — sans quoi une synthese
-- annoncerait un argent que personne n'a encore reconnu.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Par categorie et par mois — d'ou vient l'argent, ou va-t-il
-- -----------------------------------------------------------------------------

create or replace function fn_finance_synthese_categories(
  p_entity uuid,
  p_annee  integer
)
returns table (
  mois              date,
  categorie_id      uuid,
  libelle           text,
  sens              sens_finance,
  montant_propre    numeric,
  montant_consolide numeric,
  nombre_propre     integer,
  nombre_consolide  integer
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
  lignes as (
    select
      date_trunc('month', f.date_operation)::date as mois,
      f.categorie_id,
      f.entity_id,
      f.montant,
      f.id
    from finance_entries f
    join entities e on e.id = f.entity_id
    where f.statut = 'VALIDE'
      and f.deleted_at is null
      and f.date_operation >= make_date(p_annee, 1, 1)
      and f.date_operation <= make_date(p_annee, 12, 31)
      -- `<@` lit « est descendant de, ou egal a » : l'entite se compte donc
      -- elle-meme dans le consolide, comme il se doit.
      and e.path <@ (select path from cible)
  )
  select
    l.mois,
    c.id,
    c.libelle,
    c.sens,
    -- PROPRE : ce que l'entite a encaisse et depense ELLE-MEME.
    coalesce(sum(l.montant) filter (where l.entity_id = p_entity), 0),
    -- CONSOLIDE : elle et tout son sous-arbre — le filtre `<@` l'a deja borne.
    coalesce(sum(l.montant), 0),
    count(l.id) filter (where l.entity_id = p_entity)::integer,
    count(l.id)::integer
  from lignes l
  join finance_categories c on c.id = l.categorie_id
  group by l.mois, c.id, c.libelle, c.sens
  order by l.mois, c.sens, coalesce(sum(l.montant), 0) desc;
$$;

comment on function fn_finance_synthese_categories is
  'EF-FIN-24 — recettes et depenses par categorie et par mois sur une annee, '
  'en portee propre ET consolidee. SECURITY INVOKER : la RLS borne le resultat.';


-- -----------------------------------------------------------------------------
-- 2. Entre soeurs — sommes-nous dans la norme de nos pairs
-- -----------------------------------------------------------------------------
--
-- LES SOEURS SONT LES ENTITES DE MEME PARENT, l'entite comparee comprise : se
-- retirer du tableau obligerait a chercher ailleurs sa propre ligne pour se
-- situer, ce qui est precisement l'objet de la comparaison.
--
-- Le montant rendu est le CONSOLIDE de chaque soeur. Comparer le propre d'un
-- district a celui d'un autre ne dit rien : la ou l'un encaisse lui-meme,
-- l'autre laisse ses eglises le faire, et les deux sont des organisations
-- legitimes.
--
-- ELLE NE REND QUE DES MONTANTS, jamais les noms : une soeur SANS AUCUN
-- mouvement n'a pas de ligne ici, et doit pourtant figurer au tableau a zero —
-- absente, elle se lirait « hors perimetre » quand la verite est « elle n'a
-- rien encaisse » (regle 15). C'est donc l'ecran qui dresse la LISTE des
-- soeurs depuis l'arbre qu'il detient deja, et qui vient y poser ces montants.

create or replace function fn_finance_synthese_soeurs(
  p_entity uuid,
  p_annee  integer
)
returns table (
  mois      date,
  entity_id uuid,
  recettes  numeric,
  depenses  numeric
)
language sql
stable
as $$
  with cible as (
    select e.id, e.parent_id
    from entities e
    where e.id = p_entity
      and e.deleted_at is null
  ),
  soeurs as (
    select e.id, e.path
    from entities e, cible c
    where e.deleted_at is null
      -- `is not distinct from` couvre le Siege, dont le parent est `null` :
      -- `=` aurait rendu zero ligne, et l'ecran aurait conclu a une absence de
      -- droit la ou il n'y a qu'une racine (regle 15).
      and e.parent_id is not distinct from c.parent_id
  ),
  lignes as (
    select
      date_trunc('month', f.date_operation)::date as mois,
      f.sens,
      f.montant,
      e.path
    from finance_entries f
    join entities e on e.id = f.entity_id
    where f.statut = 'VALIDE'
      and f.deleted_at is null
      and f.date_operation >= make_date(p_annee, 1, 1)
      and f.date_operation <= make_date(p_annee, 12, 31)
  )
  select
    l.mois,
    s.id,
    coalesce(sum(l.montant) filter (where l.sens = 'RECETTE'), 0),
    coalesce(sum(l.montant) filter (where l.sens = 'DEPENSE'), 0)
  from soeurs s
  join lignes l on l.path <@ s.path
  group by l.mois, s.id;
$$;

comment on function fn_finance_synthese_soeurs is
  'EF-FIN-24 — montants consolides, mois par mois, des entites de meme parent. '
  'L''ecran dresse la liste des soeurs depuis l''arbre : une soeur sans aucun '
  'mouvement doit figurer a zero, pas disparaitre (regle 15).';

notify pgrst, 'reload schema';
