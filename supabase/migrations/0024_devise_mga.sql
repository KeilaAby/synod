-- =============================================================================
-- SYNOD — 0024 — La devise est l'ariary malgache
-- =============================================================================
-- Reference : ARB-7 — devise unique pour toute l'organisation
--
-- `XOF` (franc CFA) etait une valeur de depart heritee du gabarit. L'eglise est
-- malgache : la devise est l'ARIARY (MGA). Une devise fausse ne se voit pas
-- comme une erreur — elle se lit comme un montant, et « 150 000 F CFA » a la
-- place de « 150 000 Ar » passe inapercu jusqu'a la premiere consolidation.
--
-- REJOUABLE (regle 23) : `alter column ... set default` et un `update` borne
-- par la valeur qu'il remplace.
-- =============================================================================

alter table organisation_settings
  alter column devise set default 'MGA';

-- On ne recrit QUE ce qui porte encore la valeur du gabarit : si quelqu'un a
-- deja choisi une autre devise, ce n'est pas a une migration de la defaire.
update organisation_settings
   set devise = 'MGA'
 where id = 1
   and devise = 'XOF';

comment on column organisation_settings.devise is
  'ARB-7 : devise unique de l''organisation. MGA (ariary malgache) par defaut.';
