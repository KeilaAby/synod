-- =============================================================================
-- SYNOD — 0020 — Clore un bureau le jour meme, et le clore d'un seul tenant
-- =============================================================================
-- EF-BUR-02, EF-BUR-08. Corrige un defaut constate le 8 aout 2026.
--
-- LE SYMPTOME
--
-- Un bureau ouvert le matin, clos l'apres-midi : « L'operation n'a pas pu
-- aboutir ». La contrainte exigeait `date_fin > date_debut`, donc INTERDISAIT
-- de cloturer le jour de l'ouverture — precisement le cas d'une ouverture faite
-- par erreur, celui ou l'on veut revenir en arriere tout de suite.
--
-- La contrainte soeur sur les mandats individuels disait deja `>=`. Deux
-- regles pour la meme idee, ecrites a deux endroits : elles avaient diverge.
--
-- CE QUI EST VRAI
--
-- Un mandat ne se clot pas AVANT d'avoir commence. Il peut se clore le jour
-- meme : sa duree est alors d'un jour, ce qui se lit et se comprend.
-- =============================================================================

alter table bureaux drop constraint if exists bureaux_periode;

alter table bureaux add constraint bureaux_periode
  check (date_fin is null or date_fin >= date_debut);

comment on constraint bureaux_periode on bureaux is
  'Un mandat ne se clot pas avant d''avoir commence. Le jour meme est permis : '
  'une ouverture par erreur se corrige le jour meme (EF-BUR-02).';


-- -----------------------------------------------------------------------------
-- La cloture d'un bureau est UNE operation, sur DEUX tables
-- -----------------------------------------------------------------------------

/**
 * Clore un bureau, c'est clore son mandat ET ceux de ses titulaires. L'action
 * le faisait en deux appels HTTP, qui ne forment pas une transaction : un echec
 * entre les deux laissait un bureau clos peuple de mandats en cours — un etat
 * que rien n'affiche et que rien ne rattrape (regle 20).
 *
 * `greatest` n'est pas une precaution decorative. Deux cas le rendent
 * necessaire, et tous deux se produisent :
 *
 *   · un renouvellement clot le mandat precedent LA VEILLE de la nouvelle date
 *     de debut ; si le precedent a ete ouvert le jour meme, cette veille est
 *     anterieure a son ouverture ;
 *   · un titulaire designe apres la date de cloture choisie verrait son mandat
 *     finir avant d'avoir commence.
 *
 * Dans les deux cas la contrainte de periode refuserait l'ecriture, et
 * l'utilisateur lirait un nom d'index a la place d'une explication.
 *
 * SECURITY INVOKER (le defaut) : la RLS doit s'appliquer. La fonction sert
 * l'atomicite et l'arithmetique des dates, pas le contournement des droits.
 */
create or replace function fn_clore_bureau(p_bureau uuid, p_date date default current_date)
returns integer
language plpgsql
as $$
declare
  v_debut date;
  v_jour  date;
  v_clos  integer;
begin
  select date_debut into v_debut
    from bureaux
   where id = p_bureau
     and deleted_at is null
   for update;

  if not found then
    raise exception 'Ce bureau est introuvable ou hors de votre perimetre.'
      using errcode = 'no_data_found';
  end if;

  v_jour := greatest(p_date, v_debut);

  update bureaux
     set is_active = false,
         date_fin  = v_jour
   where id = p_bureau;

  -- La ligne est LISIBLE (politique de select) sans etre MODIFIABLE (politique
  -- d'update) : sans ce controle, la cloture ne ferait rien en silence.
  if not found then
    raise exception 'Vous n''avez pas l''autorisation de clore ce bureau.'
      using errcode = 'insufficient_privilege';
  end if;

  update bureau_membres
     set date_fin = greatest(v_jour, date_debut)
   where bureau_id = p_bureau
     and date_fin is null;

  get diagnostics v_clos = row_count;
  return v_clos;
end $$;

comment on function fn_clore_bureau(uuid, date) is
  'Clot un bureau et les mandats individuels en cours, d''un seul tenant. '
  'Retourne le nombre de mandats clos — EF-BUR-02, EF-BUR-08.';
