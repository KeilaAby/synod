-- =============================================================================
-- SYNOD — 0077 — Évolution temporelle et historique des effectifs (Croyants)
-- =============================================================================
-- Référence : Évolution des statistiques du tableau de bord (Semaine, Mois,
--             Trimestre, Semestre, Année) et vue graphique en Aire.
--
-- UNE FONCTION UNIQUE, UN SEUL ALLER-RETOUR.
-- Calcule pour le périmètre p_entity à une date ancre p_ancre :
--   1. Les effectifs aux 5 jalons comparatifs (S-1, M-1, T-1, Sem-1, N-1)
--   2. La série mensuelle des 12 derniers mois pour la courbe en Aire
--
-- SECURITY INVOKER : la RLS de `croyants` et `entities` s'applique à l'appelant.
-- =============================================================================

create or replace function fn_evolution_effectifs(
  p_entity uuid,
  p_ancre  date default current_date
)
returns table (
  indicateur         text,
  actuel             integer,
  val_semaine        integer,
  val_mois           integer,
  val_trimestre      integer,
  val_semestre       integer,
  val_annee          integer,
  serie_mensuelle    jsonb
)
language plpgsql
stable
as $$
declare
  v_ancre timestamptz := (p_ancre || ' 23:59:59.999999+00')::timestamptz;
  v_semaine timestamptz := ((p_ancre - interval '7 days')::date || ' 23:59:59.999999+00')::timestamptz;
  v_mois timestamptz := ((p_ancre - interval '1 month')::date || ' 23:59:59.999999+00')::timestamptz;
  v_trimestre timestamptz := ((p_ancre - interval '3 months')::date || ' 23:59:59.999999+00')::timestamptz;
  v_semestre timestamptz := ((p_ancre - interval '6 months')::date || ' 23:59:59.999999+00')::timestamptz;
  v_annee timestamptz := ((p_ancre - interval '1 year')::date || ' 23:59:59.999999+00')::timestamptz;
  v_serie jsonb;
  v_jours_bapteme integer;
begin
  -- Récupérer la fenêtre de nouveaux baptisés
  select coalesce(max(fenetre_nouveaux_baptises_jours), 15)
  into v_jours_bapteme
  from organisation_settings;

  -- 1. Calcul de la série mensuelle sur les 12 mois précédant l'ancre
  with cible as (
    select e.id, e.path
    from entities e
    where e.id = p_entity
      and e.deleted_at is null
  ),
  perimetre as (
    select e.id
    from entities e, cible c
    where e.path <@ c.path
      and e.deleted_at is null
  ),
  mois_gen as (
    select generate_series(
      date_trunc('month', p_ancre - interval '11 months'),
      date_trunc('month', p_ancre),
      interval '1 month'
    )::date as premier_jour
  ),
  mois_bornes as (
    select
      premier_jour,
      (premier_jour + interval '1 month - 1 microsecond')::timestamptz as fin_mois
    from mois_gen
  ),
  points as (
    select
      to_char(mb.premier_jour, 'YYYY-MM-DD') as mois,
      to_char(mb.premier_jour, 'TMMonth YYYY') as libelle,
      count(c.id) filter (
        where c.created_at <= mb.fin_mois
          and (c.deleted_at is null or c.deleted_at > mb.fin_mois)
      )::integer as croyants,
      count(c.id) filter (
        where c.created_at <= mb.fin_mois
          and (c.deleted_at is null or c.deleted_at > mb.fin_mois)
          and c.sexe = 'F'
      )::integer as femmes,
      count(c.id) filter (
        where c.created_at <= mb.fin_mois
          and (c.deleted_at is null or c.deleted_at > mb.fin_mois)
          and c.sexe = 'M'
      )::integer as hommes,
      count(c.id) filter (
        where c.created_at <= mb.fin_mois
          and (c.deleted_at is null or c.deleted_at > mb.fin_mois)
          and c.cellule_id is not null
      )::integer as encellules
    from mois_bornes mb
    left join croyants c on c.eglise_id in (select id from perimetre)
      and c.statut = 'ACTIF'
      and c.created_at <= mb.fin_mois
    group by mb.premier_jour, mb.fin_mois
    order by mb.premier_jour asc
  )
  select jsonb_agg(jsonb_build_object(
    'mois', p.mois,
    'libelle', p.libelle,
    'croyants', p.croyants,
    'femmes', p.femmes,
    'hommes', p.hommes,
    'encellules', p.encellules
  ))
  into v_serie
  from points p;

  -- 2. Calcul des variations pour chaque indicateur clé
  return query
  with cible as (
    select e.id, e.path
    from entities e
    where e.id = p_entity
      and e.deleted_at is null
  ),
  perimetre as (
    select e.id
    from entities e, cible c
    where e.path <@ c.path
      and e.deleted_at is null
  ),
  gens as (
    select
      c.id,
      c.sexe,
      c.cellule_id,
      c.date_bapteme,
      c.created_at,
      c.deleted_at
    from croyants c
    where c.statut = 'ACTIF'
      and c.eglise_id in (select id from perimetre)
      and c.created_at <= v_ancre
  )
  -- Total croyants
  select
    'croyants'::text as indicateur,
    count(id) filter (where (deleted_at is null or deleted_at > v_ancre))::integer as actuel,
    count(id) filter (where created_at <= v_semaine and (deleted_at is null or deleted_at > v_semaine))::integer as val_semaine,
    count(id) filter (where created_at <= v_mois and (deleted_at is null or deleted_at > v_mois))::integer as val_mois,
    count(id) filter (where created_at <= v_trimestre and (deleted_at is null or deleted_at > v_trimestre))::integer as val_trimestre,
    count(id) filter (where created_at <= v_semestre and (deleted_at is null or deleted_at > v_semestre))::integer as val_semestre,
    count(id) filter (where created_at <= v_annee and (deleted_at is null or deleted_at > v_annee))::integer as val_annee,
    coalesce(v_serie, '[]'::jsonb) as serie_mensuelle
  from gens
  union all
  -- Femmes
  select
    'femmes'::text as indicateur,
    count(id) filter (where sexe = 'F' and (deleted_at is null or deleted_at > v_ancre))::integer,
    count(id) filter (where sexe = 'F' and created_at <= v_semaine and (deleted_at is null or deleted_at > v_semaine))::integer,
    count(id) filter (where sexe = 'F' and created_at <= v_mois and (deleted_at is null or deleted_at > v_mois))::integer,
    count(id) filter (where sexe = 'F' and created_at <= v_trimestre and (deleted_at is null or deleted_at > v_trimestre))::integer,
    count(id) filter (where sexe = 'F' and created_at <= v_semestre and (deleted_at is null or deleted_at > v_semestre))::integer,
    count(id) filter (where sexe = 'F' and created_at <= v_annee and (deleted_at is null or deleted_at > v_annee))::integer,
    coalesce(v_serie, '[]'::jsonb)
  from gens
  union all
  -- Hommes
  select
    'hommes'::text as indicateur,
    count(id) filter (where sexe = 'M' and (deleted_at is null or deleted_at > v_ancre))::integer,
    count(id) filter (where sexe = 'M' and created_at <= v_semaine and (deleted_at is null or deleted_at > v_semaine))::integer,
    count(id) filter (where sexe = 'M' and created_at <= v_mois and (deleted_at is null or deleted_at > v_mois))::integer,
    count(id) filter (where sexe = 'M' and created_at <= v_trimestre and (deleted_at is null or deleted_at > v_trimestre))::integer,
    count(id) filter (where sexe = 'M' and created_at <= v_semestre and (deleted_at is null or deleted_at > v_semestre))::integer,
    count(id) filter (where sexe = 'M' and created_at <= v_annee and (deleted_at is null or deleted_at > v_annee))::integer,
    coalesce(v_serie, '[]'::jsonb)
  from gens
  union all
  -- En cellule
  select
    'encellules'::text as indicateur,
    count(id) filter (where cellule_id is not null and (deleted_at is null or deleted_at > v_ancre))::integer,
    count(id) filter (where cellule_id is not null and created_at <= v_semaine and (deleted_at is null or deleted_at > v_semaine))::integer,
    count(id) filter (where cellule_id is not null and created_at <= v_mois and (deleted_at is null or deleted_at > v_mois))::integer,
    count(id) filter (where cellule_id is not null and created_at <= v_trimestre and (deleted_at is null or deleted_at > v_trimestre))::integer,
    count(id) filter (where cellule_id is not null and created_at <= v_semestre and (deleted_at is null or deleted_at > v_semestre))::integer,
    count(id) filter (where cellule_id is not null and created_at <= v_annee and (deleted_at is null or deleted_at > v_annee))::integer,
    coalesce(v_serie, '[]'::jsonb)
  from gens
  union all
  -- Nouveaux baptisés
  select
    'nouveaux_baptises'::text as indicateur,
    count(id) filter (where date_bapteme >= p_ancre - (v_jours_bapteme || ' days')::interval and (deleted_at is null or deleted_at > v_ancre))::integer,
    count(id) filter (where date_bapteme >= (p_ancre - interval '7 days')::date - (v_jours_bapteme || ' days')::interval and (deleted_at is null or deleted_at > v_semaine))::integer,
    count(id) filter (where date_bapteme >= (p_ancre - interval '1 month')::date - (v_jours_bapteme || ' days')::interval and (deleted_at is null or deleted_at > v_mois))::integer,
    count(id) filter (where date_bapteme >= (p_ancre - interval '3 months')::date - (v_jours_bapteme || ' days')::interval and (deleted_at is null or deleted_at > v_trimestre))::integer,
    count(id) filter (where date_bapteme >= (p_ancre - interval '6 months')::date - (v_jours_bapteme || ' days')::interval and (deleted_at is null or deleted_at > v_semestre))::integer,
    count(id) filter (where date_bapteme >= (p_ancre - interval '1 year')::date - (v_jours_bapteme || ' days')::interval and (deleted_at is null or deleted_at > v_annee))::integer,
    coalesce(v_serie, '[]'::jsonb)
  from gens;
end $$;

comment on function fn_evolution_effectifs is
  'Calcule les jalons comparatifs (S-1, M-1, T-1, Sem-1, N-1) et la série des effectifs sur 12 mois pour le tableau de bord.';

notify pgrst, 'reload schema';
