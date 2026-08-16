-- =============================================================================
-- SYNOD — 0028 — Reprise des dimes deja enregistrees
-- =============================================================================
-- Reference : RG-33, EF-FIN-29 — conception dans plan.md §4.bis
--
-- CE QUE CETTE MIGRATION CORRIGE
--
-- Avant RG-33, les dimes etaient saisies comme des recettes de l'eglise qui les
-- collecte. Elles sont donc rattachees a l'eglise par `entity_id`, alors
-- qu'elles appartiennent au SIEGE. Deux consequences, dont la seconde est la
-- plus grave :
--
--   - elles GONFLENT LE SOLDE PROPRE des eglises, qui pourraient croire
--     disponible un argent qui ne leur appartient pas ;
--   - elles remontent en consolide chez chaque ancetre, ou elles seront
--     comptees UNE SECONDE FOIS le jour ou le Siege les enregistrera pour de
--     bon.
--
-- Construire les dimes ne suffisait donc pas : cela change ce qu'on saisira
-- desormais, pas ce qui est deja ecrit.
-- =============================================================================

do $$
declare
  v_siege   uuid;
  v_reprises integer;
begin
  select id into v_siege from entities where type = 'SIEGE' and deleted_at is null limit 1;

  if v_siege is null then
    raise notice 'Aucun Siege : rien a reprendre.';
    return;
  end if;

  /**
   * RG-17 S'Y OPPOSE, et la suspension doit se LIRE.
   *
   * Un mouvement valide est immuable : `trg_finance_biu` refusera l'`update`
   * de `entity_id`. On le desactive donc le temps de la reprise — c'est
   * legitime pour une correction de donnees, mais cela ne se glisse pas
   * discretement. Le jour ou quelqu'un relit cette migration, il doit
   * comprendre POURQUOI la regle a ete suspendue, et constater qu'elle est
   * retablie trois lignes plus bas.
   */
  alter table finance_entries disable trigger trg_finance_biu;

  /**
   * BORNEE A CE QUI N'A PAS DEJA ETE REPRIS.
   *
   * La regle 23 exige qu'une migration soit rejouable. Or une fois basculees,
   * ces lignes portent `entity_id = <Siege>` et l'eglise d'origine n'est plus
   * lisible ailleurs que dans `entite_collecte_id`. Sans la condition
   * `entite_collecte_id is null`, un second passage ecraserait la tracabilite
   * que le premier vient d'etablir — et l'eglise collectrice deviendrait le
   * Siege lui-meme.
   */
  with a_reprendre as (
    update finance_entries f
       set entite_collecte_id = f.entity_id,
           entity_id          = v_siege,
           -- Le contexte n'est pas connu retroactivement : ces collectes sont
           -- anterieures a la notion de rassemblement. « Culte » est le cas
           -- ordinaire, et le seul qu'on puisse affirmer sans inventer.
           dime_evenement     = coalesce(f.dime_evenement, 'CULTE')
      from finance_categories c
     where c.id = f.categorie_id
       and c.sens = 'RECETTE'
       and f.deleted_at is null
       and f.entite_collecte_id is null
       and f.entity_id <> v_siege
       -- Le referentiel nomme la categorie librement : on reconnait la dime
       -- par son code ou son libelle, accents et casse ignores.
       and (
            upper(c.code) like '%DIME%'
         or upper(translate(c.libelle, 'îÎïÏ', 'iIiI')) like '%DIME%'
       )
    returning f.id
  )
  select count(*) into v_reprises from a_reprendre;

  alter table finance_entries enable trigger trg_finance_biu;

  raise notice 'Reprise des dimes : % mouvement(s) rattache(s) au Siege.', v_reprises;
end $$;
