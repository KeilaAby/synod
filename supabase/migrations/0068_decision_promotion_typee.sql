-- =============================================================================
-- SYNOD — 0068 — La décision de promotion écrit un ENUM, pas du texte
-- =============================================================================
-- Reference : EF-CRO-12. Constate a l'essai du 21 aout 2026, sur le bouton
-- « Approuver » : « column "statut" is of type statut_promotion but expression
-- is of type text ».
--
-- LA CAUSE.
--
-- `fn_decider_promotion` (migration `0067`) ecrivait :
--
--     set statut = case when p_approuver then 'APPROUVE' else 'REFUSE' end
--
-- PostgreSQL resout les litteraux d'un `case` en TEXT — le type de la colonne
-- n'entre pas dans cette resolution — puis refuse d'affecter du texte a une
-- colonne enumeree. Le refus arrive donc a l'EXECUTION, jamais a l'ecriture de
-- la migration : le SQL est syntaxiquement correct, et rien ne signale
-- l'incompatibilite tant que personne n'appuie sur le bouton.
--
-- CE PIEGE A DEJA ETE PAYE, et le code en portait meme la trace : dans
-- `fn_saisir_collecte_dime`, un `coalesce` sur `nature_versement` s'accompagne
-- du commentaire « exige des types compatibles : les deux branches sont
-- typees ». La lecon n'avait pas ete reportee ici.
--
-- LA REGLE A RETENIR : dans une fonction, TOUT LITTERAL DESTINE A UNE COLONNE
-- ENUMEREE SE TYPE EXPLICITEMENT. Un `insert … values ('APPROUVE')` passe,
-- parce que PostgreSQL connait alors la colonne cible ; un `case`, un
-- `coalesce` ou un `nullif` ne le savent pas.
--
-- La fonction est par ailleurs IDENTIQUE a celle de `0067` : meme controle du
-- droit sur l'ARBITRE, meme refus motive, meme pose du grade dans la meme
-- transaction (regle 20).
--
-- REJOUABLE (regle 23) : `create or replace` sur une signature inchangee.
-- =============================================================================

create or replace function fn_decider_promotion(
  p_promotion uuid,
  p_approuver boolean,
  p_motif     text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_arbitre uuid;
  v_croyant uuid;
  v_grade   uuid;
  v_profil  uuid := current_profile_id();
  v_statut  statut_promotion;
begin
  select arbitre_id, croyant_id, grade_demande_id
    into v_arbitre, v_croyant, v_grade
    from promotions_grade
   where id = p_promotion and statut = 'DEMANDE'
     for update;

  if v_arbitre is null then
    raise exception 'Cette demande est introuvable ou deja tranchee.'
      using errcode = 'no_data_found';
  end if;

  -- Le droit se verifie sur l'ARBITRE : un compte borne a l'eglise ne couvre
  -- pas son parent, donc ne peut pas s'approuver lui-meme.
  if not can('croyant.grade.approve', v_arbitre) then
    raise exception 'Seule l''entite superieure peut trancher une promotion de grade.'
      using errcode = 'insufficient_privilege';
  end if;

  /**
   * UN REFUS SE MOTIVE, une approbation non. Approuver confirme ce que la
   * demande disait deja ; refuser dit le contraire, et celui qui a demande doit
   * pouvoir comprendre pourquoi sans avoir a telephoner.
   */
  if not p_approuver and coalesce(trim(p_motif), '') = '' then
    raise exception 'Un refus de promotion doit etre motive.'
      using errcode = 'check_violation';
  end if;

  /**
   * LE STATUT EST CALCULE DANS UNE VARIABLE TYPEE.
   *
   * C'est la correction de cette migration : une variable declaree
   * `statut_promotion` force la resolution du litteral vers l'enum, la ou un
   * `case` place directement dans le `set` la laissait en `text`.
   *
   * Ecrire la conversion ici plutot qu'un `::statut_promotion` en fin
   * d'expression la rend difficile a perdre : la prochaine main qui touchera au
   * `case` heritera du bon type sans avoir a y penser.
   */
  v_statut := (case when p_approuver then 'APPROUVE' else 'REFUSE' end)::statut_promotion;

  update promotions_grade
     set statut        = v_statut,
         motif_refus   = case when p_approuver then null else trim(p_motif) end,
         decide_par    = v_profil,
         date_decision = now()
   where id = p_promotion;

  -- Le grade ne se pose QUE sur approbation, et seulement ici : l'un sans
  -- l'autre laisserait une promotion accordee qui n'a rien change (regle 20).
  if p_approuver then
    update croyants set grade_id = v_grade where id = v_croyant;
  end if;

  return v_statut::text;
end $$;

comment on function fn_decider_promotion is
  'EF-CRO-12 — approuve ou refuse une promotion de grade. Approuver POSE le '
  'grade dans la meme transaction. Le droit est verifie sur l''ARBITRE. Le '
  'statut passe par une variable TYPEE : un case rend du text, que PostgreSQL '
  'refuse d''affecter a une colonne enumeree (corrige le 21 aout 2026).';

revoke execute on function fn_decider_promotion from anon;


/**
 * PostgREST garde un CACHE DE SCHEMA : sans cette purge, l'API continuerait
 * d'appeler la definition perimee, et le meme refus se reproduirait sur du SQL
 * pourtant corrige.
 */
notify pgrst, 'reload schema';
