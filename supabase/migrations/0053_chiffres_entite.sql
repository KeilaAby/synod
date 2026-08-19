-- =============================================================================
-- SYNOD — 0053 — Les chiffres d'une entite, pour toute la structure en une passe
-- =============================================================================
-- Reference : EF-STR-06 (fiche d'entite), EF-DSH-02 (la RLS borne, l'ecran ne
--             refiltre pas), RG-20 (portee), regle 28 (le nombre d'allers-retours).
--
-- CE QU'ELLE REMPLACE
--
-- La fiche d'entite et le pop-up de l'organigramme annonçaient depuis le lot 1 :
-- « les effectifs, la composition du bureau et le solde apparaitront ici avec
-- les lots 2, 3 et 4 ». Ces lots sont livres. La promesse restait.
--
-- POURQUOI TOUT LE PERIMETRE, ET PAS UNE ENTITE
--
-- Le pop-up de l'organigramme s'ouvre sur n'importe quel noeud, sans requete —
-- c'est ce qui le rend instantane. Interroger a l'ouverture y ajouterait un
-- aller-retour de 0,5 a 4 s et un squelette, pour trois nombres. On charge donc
-- le perimetre ENTIER une fois, avec l'arbre, et l'ouverture reste gratuite
-- (regle 28). La fiche pleine page y lit sa propre ligne.
--
-- LES SOLDES NE SONT PAS ICI, ET C'EST VOULU. `fn_finance_soldes_perimetre`
-- (0026) les calcule deja, propre et consolide, en une passe. En ecrire une
-- seconde somme donnerait deux resultats que rien ne garantirait egaux
-- (regle 16) — les deux fonctions s'appellent cote a cote, en parallele.
--
-- SECURITY INVOKER (le defaut) : la RLS de `croyants`, de `bureaux` et
-- d'`entities` s'applique a l'appelant. Un gestionnaire de district n'obtient
-- que son district, et l'ecran n'a aucun filtrage a refaire — donc aucune
-- occasion de se tromper en le refaisant (EF-DSH-02).
--
-- REJOUABLE (regle 23). ATTENTION — `returns table` : les parametres OUT font
-- partie de la signature, donc ajouter une colonne est un changement de type de
-- retour que PostgreSQL refuse (42P13). D'ou le `drop function if exists` qui
-- precede, indispensable et lui-meme rejouable.
-- =============================================================================

drop function if exists fn_chiffres_perimetre();

create or replace function fn_chiffres_perimetre()
returns table (
  entity_id           uuid,
  croyants_propres    bigint,
  croyants_consolides bigint,
  bureau_id           uuid,
  bureau_libelle      text,
  bureau_date_fin     date,
  bureau_membres      bigint
)
language sql
stable
as $$
  with croyants_situes as (
    /**
     * RG-04 — un croyant est rattache a son EGLISE, jamais a un district.
     * Son chemin est donc celui de son eglise : c'est lui qui le fait remonter
     * dans le consolide de tous ses ascendants.
     *
     * Meme critere que le tableau de bord (0041) : `ACTIF` et non supprime. Un
     * effectif qui compterait les transferes partis serait faux des la premiere
     * mutation, et faux dans le sens qui flatte.
     */
    select c.eglise_id, e.path
    from croyants c
    join entities e on e.id = c.eglise_id
    where c.deleted_at is null
      and c.statut = 'ACTIF'
  ),
  bureau_courant as (
    /**
     * RG-10 — au plus UN bureau actif par entite, garanti par un index partiel.
     * Le `distinct on` n'est donc pas un choix arbitraire : il n'y a qu'une
     * ligne a prendre, et `date_debut desc` fixe laquelle si l'index venait a
     * manquer.
     */
    select distinct on (b.entity_id)
      b.entity_id, b.id, b.libelle, b.date_fin
    from bureaux b
    where b.deleted_at is null
      and b.is_active
    order by b.entity_id, b.date_debut desc
  ),
  membres_en_cours as (
    -- EF-BUR-04 — les mandats EN COURS. Une fonction dont le mandat s'est
    -- acheve n'est plus une place occupee : la compter ferait paraitre complet
    -- un bureau qui ne l'est plus.
    select m.bureau_id, count(*) as n
    from bureau_membres m
    where m.date_fin is null or m.date_fin >= current_date
    group by m.bureau_id
  )
  select
    e.id,
    -- PROPRE : les croyants de CETTE eglise. Nul pour un district, qui n'en
    -- porte aucun en propre — c'est la verite, pas une lacune.
    count(cs.eglise_id) filter (where cs.eglise_id = e.id),
    -- CONSOLIDE : elle et tout son sous-arbre. `<@` lit « est descendant de,
    -- ou egal a » : une eglise se compte donc elle-meme.
    count(cs.eglise_id),
    bc.id,
    bc.libelle,
    bc.date_fin,
    coalesce(mc.n, 0)
  from entities e
  left join bureau_courant bc on bc.entity_id = e.id
  left join membres_en_cours mc on mc.bureau_id = bc.id
  -- LEFT JOIN : une entite SANS croyant sort a ZERO, elle ne disparait pas.
  -- Une eglise absente du tableau se lirait « je ne la vois pas », quand la
  -- verite est « elle n'en compte aucun » — deux constats opposes (regle 15).
  left join croyants_situes cs on cs.path <@ e.path
  where e.deleted_at is null
  group by e.id, bc.id, bc.libelle, bc.date_fin, mc.n;
$$;

comment on function fn_chiffres_perimetre is
  'EF-STR-06 — effectifs et bureau courant de CHAQUE entite du perimetre, en '
  'une passe. Les soldes viennent de fn_finance_soldes_perimetre (0026) : une '
  'seconde somme donnerait deux resultats que rien ne garantirait egaux. '
  'SECURITY INVOKER : la RLS borne le resultat a la portee de l''appelant.';

notify pgrst, 'reload schema';
