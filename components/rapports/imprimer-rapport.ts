import { avertir } from '@/components/shared/messages';

/**
 * Imprimer un rapport — EF-RAP-05, EF-RAP-16.
 *
 * POURQUOI UNE FENÊTRE, ET PLUS UN MASQUAGE DE LA PAGE.
 *
 * La première approche imprimait l'écran en cachant tout ce qui n'était pas
 * l'aperçu, au moyen d'un sélecteur `:has()`. Elle a été réécrite trois fois et
 * a échoué trois fois — la dernière laissait une première feuille blanche. La
 * raison de fond n'est pas le sélecteur : c'est qu'il faut **énumérer ce qui
 * gêne**, et cette liste est toujours incomplète d'un élément qu'on n'a pas
 * prévu. Barre latérale collante, hauteurs d'écran, `transform`, portails de
 * notification montés sur `body`, superpositions de développement : chacun s'est
 * invité à son tour.
 *
 * Ici, il n'y a **rien à cacher**. Le document ne contient que l'aperçu, parce
 * qu'on ne lui donne que lui.
 *
 * CE N'EST PAS UN SECOND RENDU (règle 16). On ne refabrique pas le document à
 * partir des données : on déplace le **balisage déjà produit** par
 * `RenduRapport`, tel quel, avec les feuilles de style de l'application. Le
 * papier montre donc exactement l'aperçu — c'est la même chaîne de rendu, dans
 * une page vide.
 *
 * EXTRACTION DU RENDU PUR : on cherche directement `[data-rendu-rapport]` pour
 * ne JAMAIS emporter les conteneurs intermédiaires d'échelle (`transform: scale`)
 * ou de hauteur fixe de l'éditeur.
 */
export function imprimerRapport(titre: string): void {
  const rendu =
    document.querySelector('[data-rendu-rapport]') ??
    document.querySelector('[data-apercu] [data-rendu-rapport]') ??
    document.querySelector('[data-apercu]');

  if (!rendu) {
    avertir("L’aperçu n’est pas affiché : il n’y a rien à imprimer.", {
      ton: 'information',
      titre: 'Rien à imprimer',
    });
    return;
  }

  /**
   * La fenêtre s'ouvre AVANT tout traitement : une pop-up qui ne suit pas
   * immédiatement le clic est prise pour intempestive et bloquée.
   */
  const fenetre = window.open('', '_blank', 'width=1024,height=768');
  if (!fenetre) {
    avertir("La fenêtre d'impression a été bloquée. Autorisez les pop-ups pour ce site.");
    return;
  }

  /**
   * LES FEUILLES DE STYLE DE L'APPLICATION, TELLES QUELLES.
   *
   * On emporte `<link>` et `<style>`, y compris celui que `RenduRapport` pose
   * pour les 4 marges réglables de la page (EF-RAP-05).
   */
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')]
    .map((noeud) => noeud.outerHTML)
    .join('');

  const echappe = titre.replace(/[<>&"]/g, '');

  const contenuHtml = rendu.outerHTML;

  fenetre.document.write(
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
      `<base href="${location.origin}/">` +
      `<title>${echappe}</title>` +
      styles +
      '<style>' +
      'html, body { margin: 0; padding: 0; background: #fff; color: #0f172a; }' +
      '@media print {' +
      '  body { background: #fff !important; }' +
      '  article {' +
      '    page-break-inside: avoid;' +
      '    break-inside: avoid;' +
      '    box-shadow: none !important;' +
      '  }' +
      '  .page-break {' +
      '    page-break-after: always;' +
      '    break-after: page;' +
      '  }' +
      '}' +
      '@media screen {' +
      '  body {' +
      '    background: #f8fafc;' +
      '    padding: 24px;' +
      '    display: flex;' +
      '    flex-direction: column;' +
      '    align-items: center;' +
      '  }' +
      '  article {' +
      '    margin-bottom: 24px;' +
      '    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);' +
      '  }' +
      '}' +
      '</style>' +
      '</head><body>' +
      contenuHtml +
      '</body></html>',
  );
  fenetre.document.close();

  /**
   * L'impression attend que le document soit chargé et posé.
   *
   * Deux chemins (événement load + délai de sécurité), le verrou garantit
   * qu'un seul appel à print() s'exécute.
   */
  let lance = false;
  const imprimer = () => {
    if (lance) return;
    lance = true;
    fenetre.focus();
    fenetre.print();
  };

  fenetre.addEventListener('load', imprimer);
  setTimeout(imprimer, 500);
}
