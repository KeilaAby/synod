-- =============================================================================
-- SYNOD — 0006 — Parametres generaux et journal d'audit
-- =============================================================================
-- Reference : plan.md §3.10 — EF-ADM-09, EF-ADM-11, ENF-SEC-08
-- =============================================================================

-- Table a ligne unique : les parametres globaux de l'organisation.
create table organisation_settings (
  id               smallint primary key default 1 check (id = 1),
  nom_organisation text    not null default 'SYNOD',
  logo_key         text,                                   -- cle d'objet relative
  devise           char(3) not null default 'XOF',         -- ARB-7 : devise unique
  fuseau_horaire   text    not null default 'Africa/Porto-Novo',
  format_matricule text    not null default '{CODE}-{ANNEE}-{SEQ}',

  -- ARB-5 : fenetre « nouveaux baptises », 15 jours par defaut (RG-30)
  fenetre_nouveaux_baptises_jours smallint not null default 15
    check (fenetre_nouveaux_baptises_jours between 1 and 365),

  -- ARB-3 : workflow de validation financiere, active/desactive par le SuperAdmin
  finance_validation_active       boolean not null default false,
  separation_saisie_validation    boolean not null default true,   -- EF-FIN-18

  -- ARB-4 : auto-approbation des transferts internes au perimetre (EF-TRF-05)
  transfert_auto_approbation_interne boolean not null default true,

  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table organisation_settings is
  'Parametres globaux — une seule ligne (id = 1). EF-ADM-11';
comment on column organisation_settings.finance_validation_active is
  'ARB-3 : si vrai, tout mouvement suit Brouillon -> Soumis -> Valide (RG-16)';

insert into organisation_settings (id) values (1) on conflict (id) do nothing;

-- Empeche la suppression de la ligne unique de parametrage.
create or replace function fn_settings_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Les parametres de l''organisation ne peuvent pas etre supprimes'
    using errcode = 'check_violation';
end $$;

create trigger trg_settings_no_delete
  before delete on organisation_settings
  for each row execute function fn_settings_no_delete();


-- -----------------------------------------------------------------------------
-- Journal d'audit — insertion seule, immuable (ENF-SEC-08)
-- Conserve 5 ans minimum. Aucune mise a jour ni suppression n'est possible.
-- -----------------------------------------------------------------------------
create table audit_log (
  id         bigserial primary key,
  user_id    uuid references profiles(id) on delete set null,
  action     text not null,
  table_name text not null,
  record_id  uuid,
  entity_id  uuid references entities(id) on delete set null,
  diff       jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),

  constraint audit_action_connue check (action in (
    'CREATE','UPDATE','DELETE','RESTORE','PURGE',
    'TRANSFER','APPROVE','REJECT',
    'SUBMIT','VALIDATE','CANCEL',
    'GRANT','REVOKE',
    'REPORT','EXPORT',
    'LOGIN','LOGOUT','DENIED'
  ))
);

comment on table audit_log is
  'Journal immuable : insertion seule. UPDATE et DELETE sont revoques (ENF-SEC-08)';
comment on column audit_log.action is
  'DENIED trace notamment les tentatives d''elevation de privilege (ENF-SEC-11)';

create index audit_created_idx on audit_log (created_at desc);
create index audit_record_idx  on audit_log (table_name, record_id);
create index audit_action_idx  on audit_log (action, created_at desc);
create index audit_entity_idx  on audit_log (entity_id, created_at desc);

-- Immuabilite garantie au niveau du moteur, pas seulement par les privileges.
create or replace function fn_audit_immuable() returns trigger
language plpgsql as $$
begin
  raise exception 'ENF-SEC-08 : le journal d''audit est immuable (insertion seule)'
    using errcode = 'insufficient_privilege';
end $$;

create trigger trg_audit_immuable
  before update or delete on audit_log
  for each row execute function fn_audit_immuable();
