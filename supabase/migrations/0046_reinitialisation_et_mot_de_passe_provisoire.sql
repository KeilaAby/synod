-- =============================================================================
-- SYNOD — 0046 — Reinitialisation du mot de passe, et mot de passe provisoire
-- =============================================================================
-- Reference : EF-AUT-02, EF-ADM-01, EF-ADM-08, EF-ADM-11, EF-ADM-13.
--
-- DEUX COLONNES, ET ELLES REPONDENT A DEUX QUESTIONS DIFFERENTES.
--
-- 1. `organisation_settings.reinitialisation_par_email` — PAR QUEL CIRCUIT un
--    utilisateur qui a oublie son mot de passe en obtient un nouveau :
--
--      actif    : il demande lui-meme, un lien lui parvient par courriel ;
--      inactif  : il contacte le Siege ou l'administrateur de son entite, qui
--                 lui remet un mot de passe provisoire de la main a la main.
--
--    CE N'EST PAS UN DETAIL DE CONFORT. Les comptes se creent sans invitation
--    par courriel : beaucoup d'adresses sont de convenance — saisies une fois,
--    jamais relevees. Un circuit par courriel qui aboutit dans une boite que
--    personne n'ouvre ne reinitialise rien, et l'utilisateur reste dehors sans
--    comprendre pourquoi. Fermer le circuit est alors plus HONNETE que de le
--    laisser ouvert.
--
--    Le defaut est `true` : c'est le comportement en vigueur avant cette
--    migration, et une migration corrige un defaut, elle n'impose pas un
--    reglage.
--
-- 2. `profiles.doit_changer_mot_de_passe` — UN MOT DE PASSE PROVISOIRE EST
--    PROVISOIRE.
--
--    Qu'il arrive par courriel ou de la main de l'administrateur, un mot de
--    passe que QUELQU'UN D'AUTRE connait n'est pas un mot de passe : il a ete
--    dicte au telephone, ecrit sur un papier, peut-etre relu par un tiers. Tant
--    que l'utilisateur ne l'a pas remplace, le compte est partage sans que
--    personne ne l'ait voulu.
--
--    Le drapeau est pose a la creation du compte et a chaque reinitialisation
--    administrative ; il tombe quand l'utilisateur choisit le sien. L'ecran
--    l'y conduit avant toute autre chose.
--
--    Il vaut `false` pour les comptes EXISTANTS : ils ont deja choisi leur mot
--    de passe. Le poser a `true` les enverrait tous changer un mot de passe que
--    personne ne leur a communique.
--
-- REJOUABLE (regle 23) : `add column if not exists`.
-- =============================================================================

alter table organisation_settings
  add column if not exists reinitialisation_par_email boolean not null default true;

comment on column organisation_settings.reinitialisation_par_email is
  'EF-AUT-02 — `true` : l''utilisateur demande lui-meme un lien par courriel. '
  '`false` : il contacte le Siege ou l''administrateur de son entite, qui lui '
  'remet un mot de passe provisoire.';

alter table profiles
  add column if not exists doit_changer_mot_de_passe boolean not null default false;

comment on column profiles.doit_changer_mot_de_passe is
  'EF-ADM-01, EF-ADM-08 — un mot de passe provisoire est provisoire : pose a la '
  'creation du compte et a chaque reinitialisation administrative, il tombe '
  'quand l''utilisateur choisit le sien.';

/**
 * PostgREST garde un CACHE DE SCHEMA.
 *
 * Deux colonnes ajoutees sans cette purge restent invisibles a l'API : la
 * lecture des parametres et celle du profil repondraient « column ... does not
 * exist » sur du SQL pourtant en place. Le piege a deja coute deux fois.
 */
notify pgrst, 'reload schema';
