/**
 * L'apparence reglable — EF-ADM-13.
 *
 * Module PUR : aucune dependance serveur, donc directement testable, et lisible
 * des deux cotes de la frontiere (regle 31).
 */

/** Le noir de l'interface, valeur de depart et repli. */
export const COULEUR_PRIMAIRE_DEFAUT = '#0f172a';

/**
 * Une couleur qui va dans une feuille de style DOIT etre un hexadecimal.
 *
 * La verification vit ici parce qu'elle sert aux deux bouts : le formulaire
 * refuse avant d'envoyer, l'action refuse avant d'ecrire, et la base porte la
 * meme contrainte (0063). Une chaine quelconque poussee dans un attribut
 * `style` n'est pas seulement laide — c'est du contenu non borne dans du CSS.
 */
export function estCouleurHex(valeur: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(valeur);
}

/**
 * LE TEXTE D'UN BOUTON NE SE CHOISIT PAS, IL SE DEDUIT.
 *
 * Laisser saisir la couleur du texte permettrait de poser du blanc sur du
 * jaune — et personne ne relit un bouton qu'il a lui-meme regle. On calcule
 * donc la luminance du fond et on prend le contraire.
 *
 * La formule est celle de la luminance relative (WCAG 2.1) : les trois canaux
 * ne pesent pas pareil, l'oeil etant beaucoup plus sensible au vert qu'au bleu.
 * Une moyenne simple donnerait du texte blanc sur un fond jaune vif, qui est
 * pourtant clair.
 *
 * Le seuil de 0,5 n'est pas la valeur exacte du contraste 4,5:1, mais il
 * departage juste sur toute la plage utile — et la seule alternative serait de
 * calculer deux rapports de contraste pour choisir le meilleur, ce que
 * personne ne relira.
 */
export function texteSurCouleur(fond: string): '#ffffff' | '#0f172a' {
  if (!estCouleurHex(fond)) return '#ffffff';

  const canal = (debut: number) => {
    const brut = parseInt(fond.slice(debut, debut + 2), 16) / 255;
    // Correction gamma : le sRGB n'est pas lineaire, et ignorer la conversion
    // fait basculer le seuil d'un cran sur les teintes moyennes.
    return brut <= 0.03928 ? brut / 12.92 : ((brut + 0.055) / 1.055) ** 2.4;
  };

  const luminance = 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);

  return luminance > 0.5 ? '#0f172a' : '#ffffff';
}

// -----------------------------------------------------------------------------
// Notifications — regle 30
// -----------------------------------------------------------------------------

/**
 * CE QUE CES REGLAGES NE FONT PAS.
 *
 * La regle 30 tient : seule une CONFIRMATION passe par une notification, et
 * tout le reste — refus motive, avertissement, panne — va dans un pop-up que
 * l'utilisateur ferme. ESLint refuse les autres appels.
 *
 * Ces reglages ne rouvrent donc pas ce que cette regle a ferme : ils decident
 * de la MANIERE dont s'affiche ce qui a deja le droit de s'y afficher.
 */
export interface ReglagesNotification {
  /** Entre 2 et 20 s : en deca on ne lit pas, au-dela ca s'empile. */
  readonly dureeMs: number;
  readonly boutonFermer: boolean;
  /** Le fond prend la teinte du cas — vert pour une reussite, etc. */
  readonly couleursVives: boolean;
}

export const NOTIFICATIONS_DEFAUT: ReglagesNotification = {
  dureeMs: 4000,
  boutonFermer: true,
  couleursVives: true,
};

export const DUREE_TOAST_MIN = 2000;
export const DUREE_TOAST_MAX = 20000;

export function bornerDuree(ms: number): number {
  if (!Number.isFinite(ms)) return NOTIFICATIONS_DEFAUT.dureeMs;
  return Math.min(DUREE_TOAST_MAX, Math.max(DUREE_TOAST_MIN, Math.round(ms)));
}
