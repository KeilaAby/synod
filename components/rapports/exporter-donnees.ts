import { type CelluleXlsx, ecrireXlsx } from '@/lib/domain/xlsx-ecriture';
import type { ContenuRapport, StructureRapport } from '@/lib/domain/rapport';

/**
 * EF-RAP-16 — exporter les DONNEES SOUS-JACENTES en Excel.
 *
 * PAS LE DOCUMENT, LES DONNEES. Le PDF sert a transmettre ; le classeur sert a
 * REPRENDRE — sommer une colonne, trier, croiser. Ce sont deux usages, et aucun
 * ne remplace l'autre : c'est le meme raisonnement que les trois exports du
 * registre financier (EF-FIN-25).
 *
 * ON EXPORTE CE QUI EST FIGE. Les valeurs viennent de `contenu`, capture a la
 * generation (RG-27) : le classeur dit exactement ce que dit le papier, meme
 * six mois plus tard. Les relire en base donnerait un fichier qui ne
 * correspondrait plus au rapport qu'on a sous les yeux.
 *
 * UNE SEULE FEUILLE, les tableaux les uns sous les autres, chacun sous son
 * titre. `ecrireXlsx` n'ecrit qu'une feuille, et c'est suffisant : ce qu'on
 * cherche dans ce fichier, c'est de la matiere a retravailler, pas une
 * arborescence.
 */
export function lignesExportables(
  structure: StructureRapport,
  contenu: ContenuRapport,
): CelluleXlsx[][] {
  const lignes: CelluleXlsx[][] = [];

  for (const section of structure.sections) {
    for (const bloc of section.blocs) {
      const resolu = contenu[bloc.id];
      if (!resolu) continue;

      const titre =
        typeof bloc.reglages.titre === 'string' && bloc.reglages.titre
          ? bloc.reglages.titre
          : (section.titre ?? '');

      switch (resolu.genre) {
        case 'TABLEAU':
          lignes.push([titre]);
          lignes.push([...resolu.colonnes]);
          for (const ligne of resolu.lignes) lignes.push([...ligne]);
          lignes.push([]);
          break;

        case 'SERIE':
          lignes.push([titre || resolu.legende]);
          lignes.push(['Période', 'Valeur']);
          resolu.libelles.forEach((libelle, i) => {
            // Le NOMBRE reste un nombre : c'est la première chose qu'on fait
            // d'un export — le sommer. Un texte le perdrait (EF-FIN-25).
            lignes.push([libelle, resolu.valeurs[i] ?? 0]);
          });
          lignes.push([]);
          break;

        case 'INDICATEUR':
          lignes.push([titre || resolu.legende, resolu.valeur]);
          break;

        case 'JAUGE':
          lignes.push([titre || resolu.legende, resolu.atteint, resolu.total]);
          break;

        case 'FRISE':
          lignes.push([titre || 'Chronologie']);
          lignes.push(['Date', 'Événement']);
          for (const e of resolu.evenements) lignes.push([e.date, e.texte]);
          lignes.push([]);
          break;

        case 'ARBRE':
          lignes.push([titre || resolu.racine]);
          for (const enfant of resolu.enfants) lignes.push([enfant]);
          lignes.push([]);
          break;
      }
    }
  }

  return lignes;
}

export function exporterDonnees(
  nom: string,
  structure: StructureRapport,
  contenu: ContenuRapport,
): void {
  const lignes = lignesExportables(structure, contenu);
  const donnees = ecrireXlsx(lignes.length > 0 ? lignes : [['Aucune donnée']], 'Rapport');

  const url = URL.createObjectURL(
    new Blob([donnees as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );

  const fichier = `${nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()}.xlsx`;

  const lien = document.createElement('a');
  lien.href = url;
  lien.download = fichier || 'rapport.xlsx';
  lien.click();

  // L'URL se libère APRÈS le clic : révoquée trop tôt, le navigateur n'a plus
  // rien à télécharger et échoue en silence.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
