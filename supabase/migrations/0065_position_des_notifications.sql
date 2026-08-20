-- =============================================================================
-- SYNOD — 0065 — Ou apparaissent les notifications
-- =============================================================================
-- Reference : EF-ADM-13. Demande de l'utilisateur, 20 aout 2026, sur capture
--             de l'ecran equivalent d'un autre de ses projets.
--
-- POURQUOI LA POSITION SE REGLE
--
-- Elle etait en dur, en haut a droite. C'est le mauvais coin sur les ecrans de
-- cette application : le menu ⋮ d'une ligne de tableau, le bouton d'export et
-- les actions d'en-tete y vivent tous. Une notification qui s'y pose recouvre
-- exactement ce sur quoi on vient de cliquer, au moment ou l'on s'apprete a
-- cliquer a nouveau.
--
-- CE QUE LA LISTE CONTIENT, ET POURQUOI ELLE EST CLOSE
--
-- Les six coins que Sonner accepte, pas un de plus. Ecrire une valeur libre
-- ferait passer au composant une chaine qu'il ignorerait en silence — la
-- notification reviendrait a son defaut, et personne ne comprendrait pourquoi
-- le reglage « ne marche pas » (regle 18 : un ensemble clos et connu).
--
-- REJOUABLE (regle 23) : `add column if not exists`, contrainte sous garde.
-- =============================================================================

alter table organisation_settings
  add column if not exists toast_position text not null default 'bottom-right';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organisation_settings_toast_position'
  ) then
    alter table organisation_settings
      add constraint organisation_settings_toast_position
      check (toast_position in (
        'top-left', 'top-center', 'top-right',
        'bottom-left', 'bottom-center', 'bottom-right'
      ));
  end if;
end $$;

comment on column organisation_settings.toast_position is
  'EF-ADM-13 : coin ou apparaissent les notifications de confirmation. Les six '
  'valeurs que Sonner accepte, et rien d''autre — une chaine inconnue serait '
  'ignoree en silence et le reglage paraitrait sans effet.';

-- LE DEFAUT EST `bottom-right`, et non l'ancien `top-right` code en dur.
-- En haut a droite vivent le menu ⋮ des lignes, le bouton d'export et les
-- actions d'en-tete : la notification s'y posait sur ce qu'on venait de
-- cliquer. `add column` pose ce defaut sur la ligne existante — aucune reprise
-- n'est necessaire.

notify pgrst, 'reload schema';
