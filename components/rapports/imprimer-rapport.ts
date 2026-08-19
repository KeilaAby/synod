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
 * C'est aussi le patron qui sert déjà l'organigramme et les reçus de dîme, et
 * qui n'a jamais failli.
 */
export function imprimerRapport(titre: string): void {
  const apercu = document.querySelector('[data-apercu]');
  if (!apercu) {
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
   * Le rendu doit être IDENTIQUE, pas ressemblant : recopier quelques règles à
   * la main aurait produit un document qui dérive du premier ajustement de
   * l'aperçu. On emporte donc `<link>` et `<style>`, y compris celui que
   * `RenduRapport` pose pour la marge de page (EF-RAP-06).
   */
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')]
    .map((noeud) => noeud.outerHTML)
    .join('');

  const echappe = titre.replace(/[<>&"]/g, '');

  /**
   * L'ENVELOPPE `data-apercu` EST CONSERVÉE, et ce n'est pas cosmétique : les
   * règles d'impression de `globals.css` s'y accrochent — remise à zéro de la
   * marge intérieure des feuilles, que `@page` fournit déjà, et interdiction de
   * couper une feuille en son milieu. Les réécrire ici en aurait fait une
   * seconde version à maintenir.
   */
  fenetre.document.write(
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
      /*
        LA BASE DES URL, ET C'EST ELLE QUI MANQUAIT.

        `window.open('')` ouvre un document `about:blank`. Les feuilles de
        style de l'application sont référencées en chemin ABSOLU DEPUIS LA
        RACINE (`/_next/static/css/…`) : recopiées telles quelles, elles se
        résolvent contre `about:blank` et ne chargent jamais. Le document
        sortait donc sans la moindre mise en forme — un logo en pleine page,
        du texte empilé, et rien qui ressemble au rapport affiché.

        `<base>` doit précéder les `<link>` : le navigateur résout au fil de
        la lecture, et une base posée après arriverait trop tard.
      */
      `<base href="${location.origin}/">` +
      `<title>${echappe}</title>` +
      styles +
      '<style>html,body{margin:0;padding:0;background:#fff}</style>' +
      '</head><body><div data-apercu>' +
      apercu.innerHTML +
      '</div></body></html>',
  );
  fenetre.document.close();

  /**
   * L'impression attend le CHARGEMENT DES FEUILLES DE STYLE. Lancée trop tôt,
   * elle sortirait le document sans mise en forme — le pire des résultats,
   * parce qu'il ressemble à une panne de l'application.
   *
   * Deux chemins, parce que `load` a pu se produire pendant `close()` : le
   * verrou garantit qu'un seul aboutit.
   */
  let lance = false;
  const imprimer = () => {
    if (lance) return;
    lance = true;
    fenetre.focus();
    fenetre.print();
  };

  fenetre.addEventListener('load', imprimer);
  if (fenetre.document.readyState === 'complete') imprimer();
}
