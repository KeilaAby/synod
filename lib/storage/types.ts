import type { ActionResult } from '@/lib/domain/result';

/**
 * Contrat de stockage d'objets — ENF-POR-03.
 *
 * REGLE STRUCTURANTE : la base ne stocke QUE des cles relatives
 * (`photos/<uuid>.webp`, `justificatifs/<uuid>.pdf`, `rapports/<uuid>.pdf`).
 * Jamais d'URL signee, jamais de chemin propre a un hebergeur. C'est ce qui
 * rend l'export de `storage/` directement rejouable ailleurs (§14.3).
 *
 * Une regle ESLint interdit d'importer le SDK de l'hebergeur hors de ce dossier.
 */

export const PREFIXES = {
  photos: 'photos',
  justificatifs: 'justificatifs',
  rapports: 'rapports',
  logos: 'logos',
  imports: 'imports',
} as const;

export type PrefixeObjet = (typeof PREFIXES)[keyof typeof PREFIXES];

export interface OptionsDepot {
  readonly contentType?: string;
  /** Remplace un objet existant a la meme cle. */
  readonly upsert?: boolean;
}

export interface StorageAdapter {
  /** Depose un objet et retourne sa cle RELATIVE, a persister telle quelle. */
  put(
    cle: string,
    contenu: Blob | ArrayBuffer | Uint8Array,
    options?: OptionsDepot,
  ): Promise<ActionResult<string>>;

  /** ENF-SEC-06 — URL a duree limitee. N'est JAMAIS persistee en base. */
  signedUrl(cle: string, dureeSecondes?: number): Promise<ActionResult<string>>;

  /**
   * Signature EN LOT — une liste de cinquante photos ne doit pas coûter
   * cinquante allers-retours. Retourne une table cle -> URL ; une cle
   * introuvable est simplement absente, un objet manquant ne devant pas faire
   * echouer l'affichage des autres.
   */
  signedUrls(
    cles: readonly string[],
    dureeSecondes?: number,
  ): Promise<ActionResult<Map<string, string>>>;

  delete(cle: string): Promise<ActionResult<void>>;

  list(prefixe: string): Promise<ActionResult<string[]>>;

  /**
   * Le contenu BRUT d'un objet, en base64 — pour l'embarquer en `data:` dans
   * un document FIGÉ (RG-27, rapports). Une URL signée périmerait avant
   * qu'on relise le document trois mois plus tard ; ceci ne sort jamais du
   * serveur qui génère.
   */
  download(cle: string): Promise<ActionResult<{ base64: string; contentType: string }>>;
}

/** Duree de vie par defaut d'une URL signee : assez pour afficher, pas pour partager. */
export const DUREE_URL_SIGNEE_SECONDES = 60 * 10;

/**
 * Les photos vivent plus longtemps que dix minutes : une liste reste ouverte,
 * on y revient par le bouton « precedent », et des vignettes qui expirent en
 * cours de consultation se lisent comme une panne. Une heure reste tres en
 * deca d'un partage durable.
 */
export const DUREE_URL_PHOTO_SECONDES = 60 * 60;

/**
 * ENF-SEC-06 — types acceptes, par usage.
 * Le controle porte sur la SIGNATURE du fichier, pas sur son extension :
 * voir `verifierSignature` ci-dessous.
 */
export const CONTRAINTES_FICHIER = {
  photo: {
    types: ['image/jpeg', 'image/png', 'image/webp'] as const,
    tailleMaxOctets: 5 * 1024 * 1024, // EF-CRO-09 : 5 Mo
    libelle: 'JPEG, PNG ou WebP, 5 Mo maximum',
  },
  justificatif: {
    types: ['application/pdf', 'image/jpeg', 'image/png'] as const,
    tailleMaxOctets: 10 * 1024 * 1024, // EF-FIN-07 : 10 Mo
    libelle: 'PDF, JPEG ou PNG, 10 Mo maximum',
  },
} as const;

export type UsageFichier = keyof typeof CONTRAINTES_FICHIER;

/**
 * EF-CRO-09 — cote du carre produit par le recadrage client.
 *
 * 1024 px depuis le 26 aout 2026, contre 512 auparavant. LA RAISON EST UN
 * CHANGEMENT D'AFFICHAGE, pas une preference : la fiche du croyant montre
 * desormais un portrait de 192 px, et « Voir la photo » l'ouvre en grand. A
 * 512 px de source, le premier etait deja a la limite sur un ecran a haute
 * densite — qui demande le double de pixels physiques — et le second
 * s'affichait franchement mou.
 *
 * ON NE MONTE PAS PLUS HAUT. Le cout n'est pas le stockage mais la LIAISON :
 * chaque doublement du cote quadruple le nombre de pixels, donc le temps de
 * televersement depuis un telephone sur un reseau lent. 1024 couvre le plus
 * grand affichage prevu, retine comprise ; 2048 ne servirait qu'a l'impression,
 * que personne n'a demandee.
 *
 * LES PHOTOS DEJA ENVOYEES RESTENT A 512 px. Elles ne sont pas reprises : ce
 * serait retelecharger, redimensionner et renvoyer chaque portrait du
 * perimetre pour un gain que seul un grand affichage revele. Elles se
 * remplacent au fil de l'eau, en changeant la photo depuis la fiche.
 */
export const COTE_PHOTO_PIXELS = 1024;

/** Signatures binaires (magic numbers) des formats autorises. */
const SIGNATURES: ReadonlyArray<{ type: string; octets: readonly number[]; decalage: number }> = [
  { type: 'image/jpeg', octets: [0xff, 0xd8, 0xff], decalage: 0 },
  { type: 'image/png', octets: [0x89, 0x50, 0x4e, 0x47], decalage: 0 },
  { type: 'application/pdf', octets: [0x25, 0x50, 0x44, 0x46], decalage: 0 }, // %PDF
  { type: 'image/webp', octets: [0x57, 0x45, 0x42, 0x50], decalage: 8 }, // "WEBP" dans RIFF
];

/**
 * ENF-SEC-06 — determine le type reel d'un fichier a partir de ses premiers
 * octets. Un `.pdf` renomme en `.png` est ainsi rejete.
 */
export function typeReel(entete: Uint8Array): string | null {
  for (const { type, octets, decalage } of SIGNATURES) {
    if (entete.length < decalage + octets.length) continue;
    if (octets.every((o, i) => entete[decalage + i] === o)) return type;
  }
  return null;
}

export function verifierFichier(
  usage: UsageFichier,
  entete: Uint8Array,
  tailleOctets: number,
): ActionResult<string> {
  const contrainte = CONTRAINTES_FICHIER[usage];

  if (tailleOctets > contrainte.tailleMaxOctets) {
    const maxMo = Math.round(contrainte.tailleMaxOctets / (1024 * 1024));
    return { ok: false, error: `Le fichier depasse ${maxMo} Mo.` };
  }

  const type = typeReel(entete);
  if (!type || !(contrainte.types as readonly string[]).includes(type)) {
    return { ok: false, error: `Format non accepte. Attendu : ${contrainte.libelle}.` };
  }

  return { ok: true, data: type };
}

/** Construit une cle relative opaque : aucune donnee personnelle dans le nom. */
export function construireCle(prefixe: PrefixeObjet, id: string, extension: string): string {
  const ext = extension.replace(/^\./, '').toLowerCase();
  return `${prefixe}/${id}.${ext}`;
}
