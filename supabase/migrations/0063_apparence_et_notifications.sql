-- =============================================================================
-- SYNOD — 0063 — L'apparence et les notifications se reglent, au lieu d'etre ecrites
-- =============================================================================
-- Reference : EF-ADM-13 (les options configurables au meme endroit), regle 21
--             (un parametre configurable se lit a chaque rendu).
--
-- CE QUI ETAIT FIGE
--
-- La couleur des boutons vivait dans `--primary` de `globals.css`, et la duree
-- d'une notification dans les props du `Toaster`. Les deux se changent en
-- editant du code et en redeployant — autant dire qu'elles ne se changent pas.
--
-- POURQUOI DES JETONS ET NON DES CLASSES
--
-- Regle 32, payee une fois : une classe Tailwind fabriquee a la volee n'existe
-- dans aucune feuille — Tailwind lit le SOURCE, il ne devine pas ce que le
-- serveur enverra. Une valeur arbitraire pointant une variable CSS casse la
-- compilation de TOUTE la feuille. La couleur voyage donc comme une VALEUR, et
-- se pose sur la variable `--primary` du document.
--
-- POURQUOI LE CONTRASTE N'EST PAS UN CHAMP
--
-- On ne demande PAS la couleur du texte des boutons : elle se deduit de la
-- luminance du fond choisi. La laisser saisir permettrait de poser du blanc sur
-- du jaune, et personne ne relit un bouton qu'il a lui-meme regle.
--
-- LES NOTIFICATIONS : CE QUI SE REGLE, ET CE QUI NE SE REGLE PAS
--
-- La regle 30 tient : seule une CONFIRMATION passe par une notification, tout
-- le reste — refus, avertissement, panne — va dans un pop-up qu'on ferme.
-- Ces reglages ne rouvrent pas ce que cette regle a ferme : ils ne decident que
-- de la maniere dont s'affiche ce qui a DEJA le droit de s'y afficher.
--
-- REJOUABLE (regle 23) : `add column if not exists`.
-- =============================================================================

alter table organisation_settings
  add column if not exists couleur_primaire text not null default '#0f172a',
  add column if not exists toast_duree_ms integer not null default 4000,
  add column if not exists toast_bouton_fermer boolean not null default true,
  add column if not exists toast_couleurs_vives boolean not null default true;

/**
 * La couleur est une valeur QUE L'ON POSE DANS UNE FEUILLE DE STYLE : elle doit
 * etre un hexadecimal, et rien d'autre. Sans cette contrainte, une chaine
 * quelconque irait telle quelle dans un attribut `style` — la borne est ici,
 * pas seulement dans le formulaire.
 */
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organisation_settings_couleur_valide'
  ) then
    alter table organisation_settings
      add constraint organisation_settings_couleur_valide
      check (couleur_primaire ~ '^#[0-9a-fA-F]{6}$');
  end if;
end $$;

/**
 * Bornes de la duree : ni trop courte pour etre lue, ni assez longue pour
 * s'empiler. Deux secondes suffisent a « Croyant enregistre » ; au-dela de
 * vingt, une notification cesse d'etre une notification.
 */
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organisation_settings_toast_duree'
  ) then
    alter table organisation_settings
      add constraint organisation_settings_toast_duree
      check (toast_duree_ms between 2000 and 20000);
  end if;
end $$;

comment on column organisation_settings.couleur_primaire is
  'EF-ADM-13 : couleur des boutons principaux. Posee sur --primary a chaque '
  'rendu (regle 21). Le contraste du texte s''en DEDUIT, il ne se saisit pas.';

comment on column organisation_settings.toast_duree_ms is
  'EF-ADM-13 : duree d''affichage d''une notification de confirmation. La '
  'regle 30 reste entiere — un refus ou une panne ne passe pas par la.';

notify pgrst, 'reload schema';
