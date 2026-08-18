-- =============================================================================
-- SYNOD — 0044 — Le fuseau par defaut passe a Indian/Antananarivo
-- =============================================================================
-- Reference : EF-ADM-11 — le fuseau horaire est un parametre d'organisation.
--
-- POURQUOI CE CHANGEMENT. `Africa/Porto-Novo` (UTC+1) etait le defaut herite du
-- gabarit initial. L'organisation est a Madagascar : `Indian/Antananarivo`
-- (UTC+3). Deux heures d'ecart ne se voient pas sur un horodatage lu de loin,
-- mais elles decalent d'un JOUR tout ce qui est saisi apres 21 h — une collecte
-- du dimanche soir tombait au lundi.
--
-- DEUX ECRITURES, ET LA SECONDE EST LA VRAIE.
--
-- Changer le DEFAUT de la colonne ne touche que les lignes a venir, et cette
-- table n'en compte qu'une, posee au tout premier deploiement : sans la mise a
-- jour, le nouveau defaut n'aurait jamais servi a rien.
--
-- LA MISE A JOUR EST BORNEE A L'ANCIENNE VALEUR. Si quelqu'un a deja choisi un
-- fuseau depuis l'ecran des parametres, ce n'est pas a une migration de le
-- defaire : elle corrige un defaut, elle n'impose pas un reglage.
--
-- REJOUABLE (regle 23) : les deux instructions sont idempotentes, et la seconde
-- ne trouve plus rien a mettre a jour au second passage.
-- =============================================================================

alter table organisation_settings
  alter column fuseau_horaire set default 'Indian/Antananarivo';

update organisation_settings
   set fuseau_horaire = 'Indian/Antananarivo',
       updated_at     = now()
 where fuseau_horaire = 'Africa/Porto-Novo';

comment on column organisation_settings.fuseau_horaire is
  'EF-ADM-11 — fuseau de l''organisation. Defaut Indian/Antananarivo (UTC+3) '
  'depuis 0044 : les dates METIER restent des colonnes `date` sans fuseau, ce '
  'reglage ne sert qu''a l''affichage des horodatages.';
