-- =============================================================================
-- SYNOD — 0059 — Un mandat a un terme, et un bureau clos ne se supprime plus
-- =============================================================================
-- Reference : EF-BUR-02, EF-BUR-08, RG-07, RG-10. Demandes du 20 aout 2026.
--
-- DEUX REGLES, ET ELLES SE TIENNENT.
--
-- 1. UN MANDAT A UN TERME.
--
--    `bureaux.date_fin` etait facultative : un bureau pouvait s'ouvrir sans
--    qu'on sache quand il finit. Depuis que le mandat echu ferme l'application
--    (RG-07), cette absence a une consequence qu'elle n'avait pas : un mandat
--    sans terme ne s'acheve JAMAIS, et l'acces de ses membres non plus. La
--    regle « seuls les membres de bureau en exercice ont un compte » devient
--    alors une regle qu'on ne peut plus appliquer.
--
--    ON NE MET PAS `not null` SUR LA COLONNE, et c'est la decision qui compte.
--    Des bureaux existent, ouverts avant cette regle, sans date de fin. Une
--    contrainte `not null` exigerait de leur en inventer une — et une date de
--    fin de mandat inventee est pire qu'une absente : elle a l'air vraie, elle
--    fermera des acces le jour venu, et personne ne saura d'ou elle sort.
--
--    Le terme est donc EXIGE A L'OUVERTURE, par un trigger qui ne regarde que
--    les insertions. L'existant survit tel quel et se corrige a l'ecran, quand
--    quelqu'un connait la reponse. La regle est tenue pour tout ce qui nait
--    apres elle, ce qui est exactement ce qu'on peut garantir.
--
-- 2. UN BUREAU CLOS EST ARCHIVE, JAMAIS SUPPRIME.
--
--    `bureaux_delete` autorisait le Siege a effacer n'importe quel bureau.
--    Effacer un bureau CLOS efface ce qui a ete : qui etait tresorier en 2024,
--    qui a signe les comptes de l'exercice, qui figurait sur l'organigramme.
--    Ces mandats sont cites par des lignes d'audit, des rapports generes et des
--    reçus — l'histoire ne se corrige pas, elle se lit.
--
--    La suppression reste possible sur un bureau EN COURS : c'est le rattrapage
--    d'une ouverture faite par erreur, le matin meme, et rien n'en depend
--    encore. Un bureau clos, lui, a vecu.
--
--    LE VERROU EST EN BASE, pas sur un bouton grise : un bouton se contourne
--    par un appel direct a l'API. Meme raison que la cloture de periode (0040).
--
-- REJOUABLE (regle 23) : `drop trigger if exists` avant chaque `create`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Le terme est exige a l'OUVERTURE
-- -----------------------------------------------------------------------------

create or replace function fn_bureau_terme_requis() returns trigger
language plpgsql as $$
begin
  /**
   * A L'INSERTION SEULEMENT.
   *
   * Un `update` qui laisse `date_fin` a null sur un bureau ancien doit rester
   * possible : sinon corriger le LIBELLE d'un bureau de 2024 exigerait d'abord
   * d'inventer sa date de fin, et l'on inventerait.
   */
  if tg_op = 'INSERT' and new.date_fin is null then
    raise exception
      'EF-BUR-02 : un mandat a un terme. Indiquez la date de fin — elle peut '
      'etre corrigee ensuite, et le mandat se reconduit.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

comment on function fn_bureau_terme_requis is
  'EF-BUR-02, RG-07 — un bureau ne s''ouvre pas sans terme : un mandat sans fin '
  'ne s''acheve jamais, et l''acces de ses membres non plus. Borne a l''INSERT, '
  'pour ne pas forcer a inventer une date sur les bureaux anterieurs.';

drop trigger if exists trg_bureau_terme_requis on bureaux;
create trigger trg_bureau_terme_requis
  before insert on bureaux
  for each row execute function fn_bureau_terme_requis();


-- -----------------------------------------------------------------------------
-- 2. Un bureau CLOS ne se supprime plus
-- -----------------------------------------------------------------------------

/**
 * Le verrou est un TRIGGER et non une politique RLS.
 *
 * Une politique `delete` peut rendre la ligne invisible a la suppression, mais
 * elle le fait en SILENCE : l'appel repond « 0 ligne supprimee », l'ecran
 * annonce une reussite, et le bureau est toujours la. Le trigger, lui, REFUSE
 * en disant pourquoi — et c'est ce message que l'utilisateur doit lire.
 */
create or replace function fn_bureau_clos_immuable() returns trigger
language plpgsql as $$
begin
  if not old.is_active then
    raise exception
      'EF-BUR-08 : un bureau clos ne se supprime pas. Sa composition est citee '
      'par des rapports, des recus et le journal d''audit — elle se consulte '
      'dans les archives.'
      using errcode = 'check_violation';
  end if;

  return old;
end $$;

comment on function fn_bureau_clos_immuable is
  'EF-BUR-08 — effacer un bureau clos effacerait ce qui a ete : qui etait '
  'tresorier, qui a signe les comptes. La suppression reste ouverte sur un '
  'bureau EN COURS, ou elle rattrape une ouverture faite par erreur.';

drop trigger if exists trg_bureau_clos_immuable on bureaux;
create trigger trg_bureau_clos_immuable
  before delete on bureaux
  for each row execute function fn_bureau_clos_immuable();


/**
 * PostgREST garde un CACHE DE SCHEMA : sans cette purge, l'API pourrait
 * repondre sur une definition perimee des fonctions qu'on vient de poser.
 */
notify pgrst, 'reload schema';
