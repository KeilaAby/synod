-- =============================================================================
-- SYNOD — 0047 — Responsable informatique, et preparation du courriel
-- =============================================================================
-- Reference : EF-ADM-01, EF-ADM-11, EF-ADM-13, EF-AUT-02.
--
-- TROIS OBJETS, POUR TROIS DEMANDES DISTINCTES.
--
-- 1. `profiles.est_responsable_informatique` — L'EXCEPTION A LA REGLE DES
--    BUREAUX.
--
--    « Seuls les membres de bureaux ont un compte » ferme une porte utile : le
--    jour ou un bureau est renouvele, plus personne n'a le droit d'ouvrir les
--    comptes des nouveaux elus, puisque les anciens ont perdu leur mandat. La
--    regle se mordrait la queue.
--
--    Le responsable informatique est designe HORS des bureaux, par le Siege, et
--    son compte survit aux renouvellements. Il ne siege pas, il ne vote pas —
--    il ouvre des comptes. C'est un role technique, et c'est exactement pour
--    cela qu'il ne doit pas dependre d'un mandat.
--
--    UN SEUL PAR ENTITE, et c'est voulu : deux personnes qui ouvrent les
--    comptes d'une meme entite, sans se coordonner, produisent des doublons que
--    la connexion par matricule ne saurait pas departager.
--
-- 2. `email_settings` — LA CONFIGURATION SMTP, PREPAREE ET NON BRANCHEE.
--
--    Rien n'envoie encore de courriel. Cette table existe pour que la
--    configuration soit SAISIE et VALIDEE avant qu'un envoi ne depende d'elle :
--    decouvrir un port faux le jour ou l'on active les notifications, c'est
--    decouvrir que personne n'a rien recu.
--
--    LE MOT DE PASSE N'EST PAS ICI, et c'est le point le plus important de
--    cette migration. `organisation_settings` est lisible par TOUT COMPTE
--    AUTHENTIFIE — l'application en depend partout. Y poser un secret SMTP le
--    donnerait a chaque utilisateur. Cette table-ci a donc sa propre RLS,
--    bornee a `settings.manage`, et le mot de passe reste malgre tout HORS
--    BASE : il se pose dans la variable d'environnement `SMTP_PASSWORD`. Un
--    secret qui vit dans une table finit dans une sauvegarde, dans un export,
--    dans un journal de requetes.
--
-- 3. `email_templates` — LES MODELES DE MESSAGE.
--
--    Ils portent un SUJET et un CORPS par cle fonctionnelle. Lisibles par
--    `settings.manage` seulement : un modele contient souvent des tournures
--    internes qu'on ne diffuse pas.
--
-- REJOUABLE (regle 23).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Le responsable informatique
-- -----------------------------------------------------------------------------

alter table profiles
  add column if not exists est_responsable_informatique boolean not null default false;

comment on column profiles.est_responsable_informatique is
  'EF-ADM-01 — designe HORS des bureaux par le Siege : il ouvre les comptes des '
  'nouveaux elus, et son acces survit aux renouvellements de mandat.';

/**
 * UN SEUL RESPONSABLE PAR ENTITE.
 *
 * Un index unique PARTIEL : il ne contraint que les lignes concernees, et
 * laisse les autres comptes libres. Deux responsables sur une meme entite
 * produiraient des comptes en double que la connexion par matricule ne saurait
 * pas departager.
 */
create unique index if not exists profiles_responsable_informatique_unique
  on profiles (entity_id)
  where est_responsable_informatique;


-- -----------------------------------------------------------------------------
-- 2. La configuration SMTP
-- -----------------------------------------------------------------------------

create table if not exists email_settings (
  -- Une seule ligne, comme `organisation_settings` : la contrainte le dit.
  id smallint primary key default 1 check (id = 1),

  actif       boolean not null default false,
  hote        text,
  port        integer default 587 check (port is null or (port > 0 and port < 65536)),
  -- `STARTTLS` sur 587, `TLS` sur 465, `AUCUNE` en reseau interne.
  securite    text not null default 'STARTTLS'
                check (securite in ('AUCUNE', 'STARTTLS', 'TLS')),
  utilisateur text,

  -- Ce que le destinataire lira dans « De : ».
  expediteur_nom   text,
  expediteur_email text,

  updated_at timestamptz not null default now()
);

comment on table email_settings is
  'EF-ADM-13 — configuration SMTP. LE MOT DE PASSE N''Y FIGURE PAS : il vit '
  'dans la variable d''environnement SMTP_PASSWORD. Un secret en base finit '
  'dans une sauvegarde, un export ou un journal de requetes.';

insert into email_settings (id) values (1) on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 3. Les modeles de message
-- -----------------------------------------------------------------------------

create table if not exists email_templates (
  cle         text primary key,
  libelle     text not null,
  description text,
  sujet       text not null,
  corps       text not null,
  actif       boolean not null default true,
  updated_at  timestamptz not null default now()
);

comment on table email_templates is
  'EF-ADM-13 — sujet et corps par cle fonctionnelle. Les champs dynamiques '
  's''ecrivent {{entre_doubles_accolades}} et sont remplaces a l''envoi.';

/**
 * Les trois modeles que l'application saura employer le jour ou l'envoi sera
 * branche. Poses ici pour que la configuration soit RELUE et corrigee avant
 * cela — un modele decouvert le jour du premier envoi part tel quel.
 *
 * `on conflict do nothing` : une migration rejouee ne doit pas ecraser un
 * modele que quelqu'un a reecrit.
 */
insert into email_templates (cle, libelle, description, sujet, corps) values
  (
    'REINITIALISATION',
    'Reinitialisation du mot de passe',
    'Envoye lorsque la reinitialisation par courriel est active et que l''utilisateur en fait la demande.',
    'Reinitialisation de votre mot de passe — {{organisation}}',
    E'Bonjour {{nom}},\n\nVous avez demande a reinitialiser votre mot de passe.\nSuivez ce lien pour en choisir un nouveau :\n\n{{lien}}\n\nSi vous n''etes pas a l''origine de cette demande, ignorez ce message.\n\n{{organisation}}'
  ),
  (
    'OUVERTURE_COMPTE',
    'Ouverture d''un compte',
    'Envoye a l''ouverture d''un compte, lorsque l''adresse est une vraie boite aux lettres.',
    'Votre compte {{organisation}} est ouvert',
    E'Bonjour {{nom}},\n\nUn compte vous a ete ouvert sur {{organisation}}.\n\nIdentifiant : {{identifiant}}\nMot de passe provisoire : {{mot_de_passe}}\n\nIl vous sera demande de le changer a la premiere connexion.\n\n{{organisation}}'
  ),
  (
    'RAPPORT_PUBLIE',
    'Publication d''un rapport',
    'Envoye aux comptes du perimetre lorsqu''un rapport y est publie (EF-RAP-18).',
    '{{titre}} — {{entite}}',
    E'Bonjour,\n\nUn rapport vient d''etre publie pour {{entite}} :\n\n{{titre}}\nPeriode : {{periode}}\n\nOuvrez-le depuis l''application.\n\n{{organisation}}'
  )
on conflict (cle) do nothing;


-- -----------------------------------------------------------------------------
-- RLS — les deux tables sont RESERVEES a `settings.manage`
-- -----------------------------------------------------------------------------

alter table email_settings  enable row level security;
alter table email_templates enable row level security;

/**
 * CONTRAIREMENT A `organisation_settings`, CES DEUX TABLES NE SE LISENT PAS
 * LIBREMENT.
 *
 * La devise ou le fuseau sont lus par chaque ecran ; un hote SMTP et un nom
 * d'utilisateur ne servent a personne d'autre qu'a l'administration, et
 * decrivent l'infrastructure. `settings.manage` est non delegable : la
 * configuration reste au Siege.
 */
drop policy if exists email_settings_all on email_settings;
create policy email_settings_all on email_settings
  for all to authenticated
  using (has_perm('settings.manage'))
  with check (has_perm('settings.manage'));

drop policy if exists email_templates_all on email_templates;
create policy email_templates_all on email_templates
  for all to authenticated
  using (has_perm('settings.manage'))
  with check (has_perm('settings.manage'));


-- `updated_at` sur les deux tables.
create or replace function fn_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_email_settings_bu on email_settings;
create trigger trg_email_settings_bu
  before update on email_settings
  for each row execute function fn_touch_updated_at();

drop trigger if exists trg_email_templates_bu on email_templates;
create trigger trg_email_templates_bu
  before update on email_templates
  for each row execute function fn_touch_updated_at();


/**
 * PostgREST garde un CACHE DE SCHEMA. Deux tables et une colonne ajoutees sans
 * cette purge restent invisibles a l'API : elle repondrait « relation
 * inconnue » sur du SQL pourtant en place. Le piege a deja coute deux fois.
 */
notify pgrst, 'reload schema';
