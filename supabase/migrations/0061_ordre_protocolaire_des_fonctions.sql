-- =============================================================================
-- SYNOD — 0061 — L'ordre protocolaire des fonctions revient, pour une AUTRE raison
-- =============================================================================
-- Reference : EF-REF-02, EF-REF-03. Demande de l'utilisateur, 20 aout 2026.
--
-- CETTE MIGRATION DEFAIT LA 0022, ET IL FAUT DIRE POURQUOI CE N'EST PAS UN
-- REVIREMENT.
--
-- La colonne a ete supprimee le 9 aout 2026 (migration 0022) parce qu'elle
-- servait a DEDUIRE l'organigramme d'un bureau : rang 10 en racine, rang 20 en
-- dessous. Depuis la 0021 l'organigramme se DESSINE — on pose les blocs, on
-- tire les traits — et le rang ne decidait donc plus de rien. Un champ qui ne
-- decide de rien devient un piege : quelqu'un finit par croire qu'il compte.
--
-- Ce raisonnement reste JUSTE, et il n'est pas remis en cause : la hierarchie
-- d'un bureau vit dans `bureau_postes`, propre a chaque bureau, et nulle part
-- ailleurs. Cette colonne-ci ne la touche pas.
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE : elle donne son ORDRE D'AFFICHAGE a la
-- liste des fonctions. L'ordre alphabetique qui l'avait remplacee presentait le
-- tresorier avant le president dans la composition d'un bureau, ce qu'aucune
-- assemblee ne fait. C'est une question de PRESENTATION, pas de deduction.
--
-- La distinction tient a un mot : la 0022 retirait un rang qui PRETENDAIT dire
-- la hierarchie ; celle-ci pose un rang qui ne pretend rien de plus que l'ordre
-- dans lequel on lit une liste.
--
-- LES VALEURS DE DEPART REPRENNENT L'ORDRE ALPHABETIQUE ACTUEL.
--
-- Un defaut uniforme a 100 laisserait l'ordre indefini : la liste changerait
-- toute seule au premier rechargement, sans que personne n'ait rien demande.
-- En partant de ce qui est deja a l'ecran, la migration ne DEPLACE rien — elle
-- rend seulement l'ordre modifiable. Ce qui bouge ensuite bouge parce qu'on l'a
-- voulu.
--
-- Espacement de dix, comme l'action de reordonnancement : il laisse la place a
-- une insertion sans toucher aux voisines.
--
-- REJOUABLE (regle 23) : `add column if not exists`, et l'initialisation est
-- bornee aux lignes restees au defaut — un rejeu ne defait donc pas un ordre
-- pose entre-temps a l'ecran.
-- =============================================================================

alter table fonctions
  add column if not exists ordre_protocolaire smallint not null default 100;

comment on column fonctions.ordre_protocolaire is
  'EF-REF-02 : ordre d''AFFICHAGE de la liste des fonctions, pose au '
  'glisser-deposer. Ne decrit PAS la hierarchie d''un bureau — celle-ci vit '
  'dans bureau_postes, propre a chaque bureau (voir 0021 et 0022).';

/**
 * Reprise : on numerote par ordre alphabetique, et SEULEMENT ce qui est reste
 * au defaut. Le `where` est ce qui rend la migration rejouable sans degat.
 */
with rangs as (
  select id, row_number() over (order by libelle) * 10 as rang
  from fonctions
)
update fonctions f
   set ordre_protocolaire = r.rang
  from rangs r
 where r.id = f.id
   and f.ordre_protocolaire = 100;

comment on table fonctions is
  'Role occupe au sein d''un bureau — EF-REF-03. '
  'La hierarchie ne vit pas ici : elle est propre a chaque bureau '
  '(bureau_postes). ordre_protocolaire ne fixe que l''ordre d''affichage.';

notify pgrst, 'reload schema';
