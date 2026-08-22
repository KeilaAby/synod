-- =============================================================================
-- SYNOD — 0070 — L'attestation de transfert devient configurable
-- =============================================================================
-- Reference : EF-TRF-08. Demande de l'utilisateur, 21 aout 2026 (soir),
-- tranchee le 22 aout 2026 : SON PROPRE GABARIT REGLABLE, sur le meme patron
-- que les modeles de courriel (`email_settings`/`email_templates`, 0047) —
-- pas un bloc du generateur de rapports (lot 6). Le generateur compose des
-- blocs qui AGREGENT des donnees sur une periode ; une attestation porte UN
-- transfert precis, a une date precise. Le rapprochement se serait paye par
-- un bloc d'un genre nouveau que rien d'autre n'aurait employe.
--
-- CE QUI EST REGLABLE, ET RIEN DE PLUS : logo, texte du corps, mentions
-- legales, cartouche de signature — exactement la liste posee par la demande.
-- Le NOM de l'organisation et celui de l'entite emettrice restent DYNAMIQUES,
-- lus a chaque document (ils le sont deja) : les rendre configurables ici
-- aurait fige une valeur que l'ecran connait deja, avec le risque qu'elle
-- diverge de celle affichee ailleurs (l'entete de l'application, les rapports).
--
-- UNE SEULE LIGNE, PAS UNE PAR ENTITE. Le nom de l'entite emettrice varie deja
-- (colonne dynamique) ; ce que ce gabarit regle — le texte du corps, les
-- mentions legales — est un choix d'ORGANISATION, comme le sujet et le corps
-- d'un courriel. Vingt eglises avec vingt mentions legales differentes ne
-- serait pas une personnalisation, ce serait une incoherence.
--
-- LECTURE LIBRE, ECRITURE RESERVEE — a la difference d'`email_settings`. Un
-- hote SMTP ne sert qu'a l'administration ; ce gabarit, lui, doit etre lu par
-- QUICONQUE imprime une attestation (`transfer.certify`), potentiellement
-- delegue loin du Siege. Le modifier reste sous `settings.manage`, non
-- delegable : la configuration reste au Siege, comme pour les courriels.
-- =============================================================================

create table if not exists attestation_transfert_settings (
  -- Une seule ligne, comme `organisation_settings` et `email_settings`.
  id smallint primary key default 1 check (id = 1),

  -- Cle d'objet RELATIVE (regle 11) — jamais d'URL, signee a l'affichage.
  logo_key text,

  texte_corps text not null default (
    'Le soussigné atteste que le croyant désigné ci-dessus a été régulièrement '
    || 'transféré de son entité d''origine vers son entité d''accueil, et que ce '
    || 'transfert a été approuvé aux dates portées au présent document.'
  ),

  mentions_legales text,

  cartouche_signature text not null default 'Pour l''entité émettrice',

  updated_at timestamptz not null default now()
);

comment on table attestation_transfert_settings is
  'EF-TRF-08 — gabarit reglable de l''attestation de transfert : logo, texte '
  'du corps, mentions legales, cartouche de signature. La piece de dossier '
  '(transfert encore DEMANDE) n''y puise RIEN : son texte de mise en garde '
  'reste fixe, pour ne jamais pouvoir etre attenue par un reglage.';

insert into attestation_transfert_settings (id) values (1) on conflict (id) do nothing;


alter table attestation_transfert_settings enable row level security;

drop policy if exists attestation_transfert_settings_select on attestation_transfert_settings;
create policy attestation_transfert_settings_select on attestation_transfert_settings
  for select to authenticated
  using (true);

drop policy if exists attestation_transfert_settings_update on attestation_transfert_settings;
create policy attestation_transfert_settings_update on attestation_transfert_settings
  for update to authenticated
  using (has_perm('settings.manage'))
  with check (has_perm('settings.manage'));


-- `fn_touch_updated_at` existe deja (migration 0047) — `create or replace`
-- la rend rejouable sans dependre de l'ordre d'application des migrations.
create or replace function fn_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_attestation_transfert_settings_bu on attestation_transfert_settings;
create trigger trg_attestation_transfert_settings_bu
  before update on attestation_transfert_settings
  for each row execute function fn_touch_updated_at();

notify pgrst, 'reload schema';
