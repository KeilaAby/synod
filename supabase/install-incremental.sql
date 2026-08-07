-- =============================================================================
-- SYNOD — Mise a jour de la base
-- =============================================================================
-- FICHIER GENERE — ne pas editer a la main.
-- Regenerer avec : pnpm db:bundle --depuis 0016
--
-- Contient uniquement les migrations POSTERIEURES a « 0016 » :
--   · 0017_bureaux_multiples.sql
--
-- L'amorce (seed) n'est PAS incluse : elle a deja ete appliquee.
--
-- Genere le 2026-08-07T18:38:49.358Z
-- =============================================================================


-- #############################################################################
-- ## 0000_migrations.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0000 — Suivi des migrations appliquees
-- =============================================================================
-- Sans registre, rien ne distingue une base neuve d'une base deja installee :
-- rejouer `install.sql` echoue des le premier `create type`, et l'on ne sait
-- pas ou l'on en est.
--
-- Chaque section des fichiers generes s'enregistre ici. `diagnostic.sql` lit
-- cette table pour dire quelles migrations restent a appliquer.
-- =============================================================================

create table if not exists schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now()
);

comment on table schema_migrations is
  'Registre des migrations appliquees. Alimente par les fichiers generes.';

insert into schema_migrations (version) values ('0000')
  on conflict (version) do nothing;

-- #############################################################################
-- ## Rattrapage du registre — migrations deja appliquees
-- #############################################################################

insert into schema_migrations (version) values
  ('0001'),
  ('0002'),
  ('0003'),
  ('0004'),
  ('0005'),
  ('0006'),
  ('0007'),
  ('0008'),
  ('0009'),
  ('0010'),
  ('0011'),
  ('0012'),
  ('0013'),
  ('0014'),
  ('0015'),
  ('0016')
  on conflict (version) do nothing;

-- #############################################################################
-- ## Preflight — ce fichier correspond-il a l etat de la base ?
-- #############################################################################

do $$
declare v_dernier text;
begin
  select max(version) into v_dernier from schema_migrations;

  if v_dernier is not null and v_dernier >= '0017' then
    raise exception
      'Ce fichier commence a la migration 0017, mais la base en est deja a %.',
      v_dernier
      using hint =
        'Regenerez le fichier avec :  pnpm db:bundle --depuis ' || v_dernier ||
        '   puis rejouez-le. Aucune modification n''a ete appliquee.';
  end if;
end $$;

-- #############################################################################
-- ## 0017_bureaux_multiples.sql
-- #############################################################################

-- =============================================================================
-- SYNOD — 0017 — Une entite peut avoir PLUSIEURS bureaux
-- =============================================================================
-- Correction de RG-10 — arbitrage du 7 aout 2026.
--
-- CE QUI ETAIT FAUX
--
-- La migration 0016 posait « au plus un bureau actif par entite ». C'est trop
-- strict : une meme entite fait coexister un « Bureau executif », un « Comite
-- des finances », une « Commission des jeunes ». L'index unique sur
-- `entity_id` seul refusait le second.
--
-- CE QUI EST VRAI
--
-- Une entite a au plus un mandat actif PAR BUREAU. Deux « Bureau executif »
-- ouverts en meme temps pour la meme entite restent une erreur — c'est ce que
-- la regle voulait dire.
--
-- `bureaux.libelle` devient donc le NOM DU BUREAU (« Bureau executif ») et non
-- celui du mandat : la periode se lit deja dans `date_debut` et `date_fin`.
-- L'affichage compose les deux (`libelleAffichage`), la base ne stocke pas ce
-- qu'elle sait deriver.
-- =============================================================================

drop index if exists bureaux_un_seul_actif;

/**
 * Comparaison sur le libelle NORMALISE : « Bureau Executif » et
 * « bureau executif  » designent le meme organe. Sans cette normalisation, la
 * contrainte se contournerait d'une majuscule.
 *
 * Les accents ne sont pas replies : `unaccent` n'est pas garantie presente, et
 * l'ecart « Comite » / « Comité » reste visible a l'oeil dans la liste — la
 * contrainte protege de l'erreur, elle ne corrige pas la saisie.
 */
create unique index if not exists bureaux_un_actif_par_nom
  on bureaux (entity_id, lower(btrim(libelle)))
  where is_active and deleted_at is null;

comment on column bureaux.libelle is
  'NOM du bureau (« Bureau executif »), pas du mandat : la periode se lit dans les dates.';

comment on table bureaux is
  'Bureau d''une entite et son mandat courant — EF-BUR-01, EF-BUR-02. '
  'Une entite peut en avoir plusieurs, de noms differents (RG-10).';

/**
 * RG-09 reste INCHANGEE — arbitrage du 7 aout 2026.
 *
 * Un croyant siege dans le bureau de toute entite qui CONTIENT son eglise :
 * son eglise, sa paroisse, son district, son regional, le Siege. Il peut donc
 * cumuler plusieurs mandats, dans une meme entite comme dans plusieurs, tant
 * qu'elles sont sur sa chaine d'ancetres.
 *
 * La variante examinee — sieger au regional ouvrirait ses sous-entites — a ete
 * ecartee : l'eligibilite dependrait alors des mandats deja detenus, et
 * changerait a la cloture de l'un d'eux.
 *
 * EF-TRF-09 est confirme dans la foulee : un transfert DEMET des mandats de
 * l'origine et n'en accorde AUCUN a la destination, qui designe si elle le
 * souhaite. Le comportement de la migration 0016 est donc conserve tel quel.
 */

insert into schema_migrations (version) values ('0017')
  on conflict (version) do nothing;
