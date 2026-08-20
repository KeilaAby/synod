-- =============================================================================
-- SYNOD — 0064 — Le poste en derivation : un adjoint sur le tronc
-- =============================================================================
-- Reference : EF-BUR-07. Demande de l'utilisateur, 20 aout 2026, sur modele
--             fourni : « Directeur general » en tete, « Vice-president
--             adjoint » accroche au trait vertical qui en descend, decale sur
--             le cote, AU-DESSUS de la rangee des autres subordonnes.
--
-- CE QUE C'EST, ET CE QUE CE N'EST PAS
--
-- C'est le motif classique du poste EN DERIVATION : adjoint, cabinet, assistant
-- de direction. Il depend du meme superieur que les autres, mais il ne se RANGE
-- pas avec eux — il se pose a cote du tronc, entre le superieur et la rangee.
--
-- CE N'EST DONC PAS UN NIVEAU DE PLUS. Le vice-president adjoint est bien un
-- enfant du directeur general : lui donner un rang intermediaire decalerait
-- toute la descendance d'un cran, et changerait la hierarchie pour obtenir un
-- effet de dessin. Ce qui change est le PLACEMENT, pas la parente.
--
-- D'OU UN DRAPEAU SUR LE POSTE, et non une table ni un `parent_fonction_id`
-- detourne. `parent_fonction_id` continue de dire de qui l'on depend ;
-- `en_derivation` dit seulement ou l'on se dessine.
--
-- CE QUE LE DRAPEAU NE TOUCHE PAS
--
-- La composition tabulaire reste la source des vacances (EF-BUR-04) : elle
-- enumere les fonctions applicables, l'organigramme ne fait que les placer.
-- Un poste en derivation est un poste comme un autre — il s'occupe, il se
-- libere, il compte dans les effectifs de bureau.
--
-- UNE RACINE NE PEUT PAS ETRE EN DERIVATION : il n'y a pas de tronc au-dessus
-- d'elle a quoi s'accrocher. Le cas se produirait en detachant un bloc deja
-- marque, et le dessin n'aurait alors nulle part ou le poser. La contrainte
-- l'interdit plutot que de laisser l'impression choisir a notre place.
--
-- REJOUABLE (regle 23) : `add column if not exists`, contrainte sous garde.
-- =============================================================================

alter table bureau_postes
  add column if not exists en_derivation boolean not null default false;

comment on column bureau_postes.en_derivation is
  'EF-BUR-07 : le poste se dessine A COTE DU TRONC de son superieur, pas dans '
  'la rangee de ses freres — adjoint, cabinet. Ne change NI la parente, NI le '
  'niveau : seulement le placement, a l''ecran comme a l''impression.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'postes_derivation_a_un_parent'
  ) then
    alter table bureau_postes
      add constraint postes_derivation_a_un_parent
      check (not en_derivation or parent_fonction_id is not null);
  end if;
end $$;

notify pgrst, 'reload schema';
