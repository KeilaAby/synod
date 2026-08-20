-- =============================================================================
-- SYNOD — 0062 — Reordonner un referentiel en UNE ecriture
-- =============================================================================
-- Reference : EF-REF-02, regle 20 (deux ecritures indissociables se font en
--             base), regle 28 (le nombre d'allers-retours).
--
-- CE QUI NE MARCHAIT PAS, ET POURQUOI L'ERREUR ARRIVE LOIN DE SA CAUSE
--
-- L'action envoyait la liste reordonnee en un seul `upsert` :
--
--     upsert([{ id, ordre_protocolaire: 10 }, …], { onConflict: 'id' })
--
-- PostgREST le traduit en `insert … on conflict (id) do update`. Or PostgreSQL
-- VALIDE LE TUPLE INSERE AVANT de resoudre le conflit : `code` et `libelle`
-- sont `not null` SANS defaut, et l'ecriture echouait donc en 23502 —
-- « null value in column "code" violates not-null constraint » — alors qu'on
-- ne voulait rien inserer du tout.
--
-- Le message accuse une colonne a laquelle on ne touchait pas. C'est ce qui
-- rend la panne difficile a lire : `upsert` ressemble a « mets a jour si ca
-- existe », mais c'est un INSERT qui se rattrape, pas un UPDATE qui s'etend.
--
-- POURQUOI UNE FONCTION PLUTOT QUE N `update`
--
-- Reordonner dix fonctions par dix appels, c'est dix allers-retours a 0,5–4 s
-- (regle 28) — et surtout, une interruption a mi-parcours laisserait un ordre
-- A MOITIE APPLIQUE : deux fonctions au meme rang, ou un trou. L'etat
-- intermediaire est faux ET indetectable, donc l'ecriture se fait en base
-- (regle 20).
--
-- SECURITY INVOKER (le defaut) : les politiques `*_write` exigent
-- `has_perm('referentiel.manage')`, et elles s'appliquent a l'appelant. La
-- fonction n'accorde donc rien que l'appelant n'ait deja — elle ne fait que
-- grouper.
--
-- LA LISTE BLANCHE N'EST PAS DECORATIVE. Le nom de table vient du client.
-- `format(%I)` echappe l'identifiant, ce qui empeche l'injection mais PAS de
-- viser une autre table — `profiles`, par exemple, n'a pas de colonne `ordre`,
-- mais le raisonnement ne doit pas dependre de cela. On enumere donc ce qui est
-- reordonnable, et le reste est refuse en le disant.
--
-- Cette liste DOIT rester alignee sur les entrees `colonneOrdre` de
-- `lib/domain/referentiels.ts` ; un test lit ce fichier et compare.
--
-- REJOUABLE (regle 23) : `create or replace` sur une fonction dont la signature
-- ne change pas.
-- =============================================================================

create or replace function fn_reordonner_referentiel(p_table text, p_ids uuid[])
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_colonne text;
  v_touchees integer;
begin
  v_colonne := case p_table
    when 'grades'             then 'ordre'
    when 'finance_categories' then 'ordre'
    when 'fonctions'          then 'ordre_protocolaire'
    else null
  end;

  if v_colonne is null then
    raise exception 'Ce referentiel ne se reordonne pas : %', p_table
      using errcode = 'invalid_parameter_value';
  end if;

  /**
   * `with ordinality` donne le rang SANS le calculer : c'est la position dans
   * le tableau recu, donc exactement l'ordre pose a l'ecran.
   *
   * Espacement de dix : une valeur creee plus tard, ou par un import, doit
   * pouvoir s'inserer entre deux voisines sans qu'on ait a les renumeroter.
   */
  execute format(
    'update %I t
        set %I = r.rang * 10
       from unnest($1) with ordinality as r(id, rang)
      where t.id = r.id',
    p_table, v_colonne
  ) using p_ids;

  get diagnostics v_touchees = row_count;

  /**
   * On rend le NOMBRE DE LIGNES TOUCHEES plutot que rien.
   *
   * Un identifiant qui ne correspond a aucune ligne — supprimee entre-temps,
   * ou hors de ce que la RLS laisse voir — ne fait pas echouer l'ordre : il est
   * simplement ignore. L'appelant peut comparer au nombre envoye et le dire,
   * au lieu d'annoncer une reussite complete sur une reussite partielle.
   */
  return v_touchees;
end $$;

comment on function fn_reordonner_referentiel is
  'EF-REF-02 : pose l''ordre d''affichage d''un referentiel en UNE ecriture. '
  'SECURITY INVOKER — les politiques *_write exigent referentiel.manage. '
  'La liste blanche des tables doit rester alignee sur les entrees '
  'colonneOrdre de lib/domain/referentiels.ts.';

notify pgrst, 'reload schema';
