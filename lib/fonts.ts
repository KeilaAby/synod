import localFont from 'next/font/local';

/**
 * Typographie — plan.md §8.2, P-9.
 *
 * -----------------------------------------------------------------------------
 * POLICES AUTO-HEBERGEES
 * -----------------------------------------------------------------------------
 * Les fichiers `.woff2` sont versionnes dans `app/fonts/` et servis par
 * l'application : AUCUNE requete vers un CDN externe, ni au build, ni au
 * runtime. C'est exige par P-9 et par la CSP stricte d'ENF-SEC-07, et cela rend
 * le build reproductible hors ligne.
 *
 * Les fichiers proviennent des paquets npm `@fontsource-variable/*`, copies une
 * fois dans `app/fonts/`. Pour les mettre a jour : relancer la copie depuis
 * `node_modules/@fontsource-variable/<police>/files/`.
 *
 * -----------------------------------------------------------------------------
 * A PROPOS DE GOOGLE SANS
 * -----------------------------------------------------------------------------
 * `designrules.md` prescrit **Google Sans**. Cette police est proprietaire :
 * elle n'est ni distribuee publiquement ni licenciable, et ne peut donc pas
 * etre embarquee. On expedie **Inter**, son substitut fonctionnel le plus
 * proche pour une interface a forte densite : meme grammage optique, chiffres
 * tabulaires natifs, excellent rendu entre 12 et 14 px.
 *
 * POUR BASCULER, une fois les fichiers sous licence obtenus :
 *   1. deposer `GoogleSans-Variable.woff2` dans `app/fonts/`
 *   2. remplacer le `src` de `fontSans` ci-dessous
 * Aucun autre fichier n'est concerne : tout passe par la variable CSS
 * `--font-sans`.
 * -----------------------------------------------------------------------------
 */
export const fontSans = localFont({
  src: [{ path: '../app/fonts/inter-variable.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-sans',
  // UI-17 : `swap` evite le FOIT ; la metrique de repli etant proche,
  // aucun decalage de mise en page perceptible.
  display: 'swap',
  fallback: ['system-ui', 'Segoe UI', 'sans-serif'],
  preload: true,
});

/**
 * UI-07 / UI-13 — toute valeur numerique, tout pourcentage et tout montant sont
 * rendus en chasse fixe. Geist Mono possede de vrais chiffres tabulaires, ce
 * qui stabilise les colonnes de chiffres dans les DataTable.
 */
export const fontMono = localFont({
  src: [
    { path: '../app/fonts/geist-mono-variable.woff2', weight: '100 900', style: 'normal' },
  ],
  variable: '--font-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
  preload: true,
});
