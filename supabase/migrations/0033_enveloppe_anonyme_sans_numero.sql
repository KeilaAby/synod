-- =============================================================================
-- SYNOD — 0033 — Une enveloppe anonyme n'a pas forcement de numero
-- =============================================================================
-- Reference : EF-FIN-33 — precise le 13 aout 2026.
--
-- CE QUE LA CONTRAINTE DE `0030` IMPOSAIT A TORT
--
-- Elle exigeait un NUMERO pour toute `ENVELOPPE_ANONYME`, et renvoyait au vrac
-- ce qui n'en avait pas. C'etait une distinction d'informaticien, pas de
-- tresorier :
--
--   - une enveloppe SANS NUMERO reste une enveloppe. Elle a ete pliee, remise,
--     ouverte ; l'appeler « en vrac » — des especes jetees dans l'urne — decrit
--     autre chose que ce qui s'est passe ;
--   - et surtout, elle otait un CHOIX a l'utilisateur. Devant une enveloppe
--     numerotee mais sans nom, c'est a lui de trancher : chercher le porteur par
--     le numero (la suggestion), ou la classer « enveloppe anonyme ». La
--     contrainte decidait a sa place.
--
-- CE QUI RESTE VRAI : le VRAC n'a ni nom ni numero — c'est ce qui le definit.
-- Un versement NOMINATIF a toujours un croyant.
--
-- REJOUABLE (regle 23).
-- =============================================================================

alter table dime_versements
  drop constraint if exists dime_versements_nature_coherente;

alter table dime_versements
  add constraint dime_versements_nature_coherente check (
    (nature = 'NOMINATIF'         and croyant_id is not null)
    -- Le numero devient FACULTATIF : une enveloppe sans numero reste une
    -- enveloppe, et l'utilisateur garde le choix de la qualifier ainsi.
 or (nature = 'ENVELOPPE_ANONYME' and croyant_id is null)
    -- Le vrac, lui, n'a NI nom NI enveloppe : c'est sa definition meme.
 or (nature = 'EN_VRAC'           and croyant_id is null and enveloppe_numero is null)
  );

comment on column dime_versements.nature is
  'EF-FIN-33 : nominatif, enveloppe anonyme (avec ou sans numero) ou especes en '
  'vrac. Les trois entrent dans le total ; seul le nominatif ouvre un recu.';
