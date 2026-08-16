-- =============================================================================
-- SYNOD — 0037 — Remettre un lot de collectes au Siege
-- =============================================================================
-- Reference : EF-FIN-30 — la dime est portee EN MAINS PROPRES au Siege par le
--             tresorier principal de l'eglise ou son adjoint.
--
-- POURQUOI UNE FONCTION
--
-- Une remise, ce sont DEUX ecritures indissociables (regle 20) : le bordereau
-- nait, et les collectes s'y rattachent. L'une sans l'autre laisserait soit un
-- bordereau vide — un papier qui ne prouve rien —, soit des collectes marquees
-- remises sans document pour l'attester. Deux etats faux, et le second
-- indetectable : on croirait l'argent arrive.
--
-- Le numero de bordereau est attribue PAR LA BASE (regle 14) : deux eglises
-- peuvent se presenter au Siege le meme matin.
--
-- CE QUE CETTE FONCTION NE FAIT PAS : verifier le delai. Les dimes d'un culte
-- doivent parvenir dans la semaine, mais REFUSER une remise tardive
-- empecherait de regulariser — exactement l'inverse du but. Le retard se
-- CONSTATE a l'ecran, il ne s'interdit pas.
--
-- REJOUABLE (regle 23) : `create or replace`.
-- =============================================================================

create or replace function fn_remettre_collectes(
  p_entite      uuid,
  p_collectes   uuid[],
  p_porteur     uuid default null,
  p_date_remise date default current_date,
  p_observation text default null
)
returns table (remise_id uuid, reference text, collectes integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code      text;
  v_reference text;
  v_remise    uuid;
  v_nombre    integer;
begin
  if not can('finance.dime.collect', p_entite) then
    raise exception 'Vous n''avez pas le droit de remettre les dimes de cette entite.'
      using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from entities where id = p_entite;
  if v_code is null then
    raise exception 'Cette entite est introuvable.';
  end if;

  v_reference := fn_generer_bordereau(v_code);

  insert into dime_remises (
    entite_id, porteur_id, date_remise, reference, observation, saisi_par
  )
  values (
    p_entite, p_porteur, p_date_remise, v_reference, p_observation,
    current_profile_id()
  )
  returning id into v_remise;

  /**
   * SEULES LES COLLECTES ENCORE NON REMISES sont rattachees.
   *
   * `dime_remise_id is null` n'est pas une precaution de style : deux
   * utilisateurs peuvent preparer le meme bordereau en meme temps, et
   * rattacher une collecte deja remise la ferait compter DEUX FOIS — le Siege
   * croirait avoir recu le double.
   */
  update finance_entries f
     set dime_remise_id = v_remise
   where f.id = any (p_collectes)
     and f.entite_collecte_id = p_entite
     and f.dime_remise_id is null
     and f.deleted_at is null;

  get diagnostics v_nombre = row_count;

  /**
   * UN BORDEREAU VIDE N'A PAS LIEU D'EXISTER.
   *
   * Si aucune collecte n'a pu etre rattachee — toutes deja remises, ou hors de
   * l'entite —, on annule tout : un papier qui ne porte rien se retrouverait
   * dans la liste des remises sans qu'on sache quoi en faire.
   */
  if v_nombre = 0 then
    raise exception
      'Aucune de ces collectes n''est a remettre : elles ont deja ete portees au Siege.';
  end if;

  return query select v_remise, v_reference, v_nombre;
end $$;

comment on function fn_remettre_collectes is
  'EF-FIN-30 — cree un bordereau et y rattache les collectes, en UNE '
  'transaction. Le numero vient de la base ; une collecte deja remise est '
  'ignoree, et un bordereau reste vide echoue.';

revoke execute on function fn_remettre_collectes from anon;

notify pgrst, 'reload schema';
