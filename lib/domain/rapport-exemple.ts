import {
  type BlocRapport,
  type ContenuBloc,
  type SourceRapport,
  definitionBloc,
  sourceDuBloc,
} from './rapport';

/**
 * Les donnees d'EXEMPLE de l'apercu — EF-RAP-05.
 *
 * POURQUOI SIMULER PLUTOT QUE DE LAISSER DES CADRES VIDES.
 *
 * Un cadre nommant sa source ne dit rien de ce qu'il fera : un tableau de
 * quinze lignes ne tient pas dans le meme espace que le meme tableau vide, une
 * courbe n'a pas la hauteur du rectangle qui l'annonce, et un indicateur en
 * tiers de colonne se juge sur un chiffre a six caracteres. Sans matiere,
 * l'auteur compose a l'aveugle et decouvre sa mise en page a la generation —
 * c'est-a-dire trop tard.
 *
 * LES VRAIES DONNEES NE PEUVENT PAS Y ETRE. Un modele n'a ni entite ni periode:
 * elles se choisissent a la generation (EF-RAP-12), et la resolution s'execute
 * sous la session du GENERATEUR pour que la RLS borne ce qu'il voit (EF-RAP-13).
 * Les afficher ici demanderait de deviner les deux, et montrerait a l'auteur un
 * rapport que son lecteur n'obtiendra pas.
 *
 * ELLES SE DISENT. L'apercu porte la mention « donnees d'exemple » : un chiffre
 * plausible qu'on prendrait pour un vrai est pire qu'un cadre vide — on le
 * citerait.
 *
 * DETERMINISTE. La valeur derive de l'IDENTIFIANT du bloc, jamais d'un tirage :
 * un apercu qui changerait de chiffres a chaque frappe donnerait l'impression
 * que les donnees bougent, et rendrait toute comparaison impossible.
 */

/** Alias historique : l'exemple et le reel partagent la MEME forme. */
export type ContenuExemple = ContenuBloc;

/**
 * Un entier stable, tire de l'identifiant du bloc.
 *
 * Ce n'est pas du hasard : c'est une empreinte. Deux blocs differents montrent
 * des chiffres differents — sans quoi trois indicateurs cote a cote afficheraient
 * le meme, ce qui ne ressemble a aucun rapport reel — et le MEME bloc montre
 * toujours le sien.
 */
function empreinte(cle: string): number {
  let valeur = 0;
  for (let i = 0; i < cle.length; i += 1) {
    valeur = (valeur * 31 + cle.charCodeAt(i)) % 100_000;
  }
  return valeur;
}

/** Un nombre dans un intervalle, stable pour une clé donnée. */
function entre(cle: string, min: number, max: number): number {
  return min + (empreinte(cle) % Math.max(1, max - min + 1));
}

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin'];

/** Ce que chaque source raconte, en une carte a un chiffre. */
const INDICATEURS: Record<SourceRapport, { legende: string; min: number; max: number }> = {
  CROYANTS: { legende: 'Croyants actifs', min: 120, max: 2400 },
  ENTITES: { legende: 'Entités rattachées', min: 3, max: 42 },
  BUREAUX: { legende: 'Bureaux en cours', min: 2, max: 28 },
  FINANCES: { legende: 'Solde disponible', min: 400_000, max: 12_000_000 },
  TRANSFERTS: { legende: 'Transferts du trimestre', min: 1, max: 36 },
  BAPTEMES: { legende: 'Baptisés sur la période', min: 2, max: 64 },
};

const COLONNES: Record<SourceRapport, readonly string[]> = {
  CROYANTS: ['Nom', 'Matricule', 'Grade', 'Église'],
  ENTITES: ['Entité', 'Type', 'Croyants', 'Solde'],
  BUREAUX: ['Fonction', 'Titulaire', 'Depuis'],
  FINANCES: ['Date', 'Catégorie', 'Sens', 'Montant'],
  TRANSFERTS: ['Croyant', 'Origine', 'Destination', 'Statut'],
  BAPTEMES: ['Baptisé', 'Date', 'Lieu', 'Célébrant'],
};

const LIGNES: Record<SourceRapport, readonly (readonly string[])[]> = {
  CROYANTS: [
    ['RAKOTO Jean', 'CRO-00412', 'Croyant', 'Analakely'],
    ['RASOA Marie', 'CRO-00518', 'Diacre', 'Analakely'],
    ['ANDRY Paul', 'CRO-00733', 'Croyant', 'Ambohipo'],
    ['NIRINA Hanta', 'CRO-00891', 'Ancien', 'Ambohipo'],
  ],
  ENTITES: [
    ['Paroisse Analakely', 'Paroisse', '412', '2 480 000 Ar'],
    ['Église Ambohipo', 'Église', '188', '860 000 Ar'],
    ['Église Itaosy', 'Église', '96', '415 000 Ar'],
    ['Cellule Ankorondrano', 'Cellule', '24', '—'],
  ],
  BUREAUX: [
    ['Président', 'RAKOTO Jean', '01/01/2026'],
    ['Trésorier', 'RASOA Marie', '01/01/2026'],
    ['Secrétaire', 'ANDRY Paul', '01/01/2026'],
  ],
  FINANCES: [
    ['12/03/2026', 'Dîmes', 'Recette', '1 240 000 Ar'],
    ['14/03/2026', 'Offrandes', 'Recette', '385 000 Ar'],
    ['18/03/2026', 'Entretien', 'Dépense', '210 000 Ar'],
    ['22/03/2026', 'Mission', 'Dépense', '450 000 Ar'],
  ],
  TRANSFERTS: [
    ['RAKOTO Jean', 'Analakely', 'Ambohipo', 'Approuvé'],
    ['NIRINA Hanta', 'Itaosy', 'Analakely', 'En attente'],
    ['ANDRY Paul', 'Ambohipo', 'Itaosy', 'Approuvé'],
  ],
  BAPTEMES: [
    ['RANDRIA Koto', '08/02/2026', 'Analakely', 'Passeur Rado'],
    ['SOA Vololona', '08/02/2026', 'Analakely', 'Passeur Rado'],
    ['TIANA Fara', '15/03/2026', 'Ambohipo', 'Passeur Naina'],
  ],
};

/** Le contenu d'exemple d'un bloc, ou `null` si le bloc n'en demande pas. */
export function contenuExemple(bloc: BlocRapport): ContenuExemple | null {
  const definition = definitionBloc(bloc.type);
  const source = sourceDuBloc(bloc);
  if (!definition || source === null) return null;

  switch (bloc.type) {
    case 'INDICATEUR': {
      const modele = INDICATEURS[source];
      const valeur = entre(bloc.id, modele.min, modele.max);

      return {
        genre: 'INDICATEUR',
        legende: modele.legende,
        valeur:
          source === 'FINANCES'
            ? `${new Intl.NumberFormat('fr-FR').format(valeur)} Ar`
            : new Intl.NumberFormat('fr-FR').format(valeur),
      };
    }

    case 'TABLEAU':
      return { genre: 'TABLEAU', colonnes: COLONNES[source], lignes: LIGNES[source] };

    case 'GRAPHIQUE':
      return {
        genre: 'SERIE',
        libelles: MOIS,
        // Six valeurs qui varient sans jamais s'annuler : une barre a zero
        // ressemble a une donnee manquante, pas a un exemple.
        valeurs: MOIS.map((_, i) => entre(`${bloc.id}-${i}`, 30, 100)),
        legende: INDICATEURS[source].legende,
      };

    case 'JAUGE': {
      const total = entre(`${bloc.id}-total`, 8, 40);
      return {
        genre: 'JAUGE',
        // L'atteint reste STRICTEMENT sous le total : une jauge pleine ne
        // montre pas ce qu'une jauge sait faire.
        atteint: Math.max(1, Math.round(total * (0.4 + (empreinte(bloc.id) % 40) / 100))),
        total,
        legende: INDICATEURS[source].legende,
      };
    }

    case 'FRISE':
      return {
        genre: 'FRISE',
        evenements: [
          { date: '08/01/2026', texte: 'Ouverture du bureau exécutif' },
          { date: '14/02/2026', texte: 'Cérémonie de baptême — 12 baptisés' },
          { date: '22/03/2026', texte: 'Transfert approuvé vers Ambohipo' },
        ],
      };

    case 'ORGANIGRAMME':
      return {
        genre: 'ARBRE',
        racine: 'District Avaradrano',
        enfants: ['Paroisse Analakely', 'Paroisse Ambohipo', 'Paroisse Itaosy'],
      };

    default:
      return null;
  }
}
