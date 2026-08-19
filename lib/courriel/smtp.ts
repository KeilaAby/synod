import 'server-only';

import net from 'node:net';
import tls from 'node:tls';

/**
 * Un client SMTP minimal — EF-ADM-13.
 *
 * ÉCRIT À LA MAIN, comme le SVG de l'organigramme et l'écriture XLSX (règle 29).
 * Une bibliothèque d'envoi apporte les pièces jointes, les files d'attente, les
 * connexions groupées et le rendu multipart : rien de tout cela ne sert à
 * ENVOYER UN MESSAGE DE TEST de six lignes. `node:net` et `node:tls` sont dans
 * la plateforme, et le dialogue SMTP tient en une dizaine d'échanges.
 *
 * CE QUE CE CLIENT NE FAIT PAS, ET QU'IL FAUDRA LE JOUR D'UN VRAI ENVOI :
 * les pièces jointes, l'encodage `quoted-printable` des corps longs, le repli
 * texte d'un message HTML, la reprise sur échec. Le dire ici évite qu'on
 * l'emploie un jour pour ce qu'il ne sait pas faire.
 *
 * LE MOT DE PASSE VIENT DE L'ENVIRONNEMENT, jamais de la base : un secret rangé
 * dans une table finit dans une sauvegarde ou un export.
 */

export interface ParametresSmtp {
  readonly hote: string;
  readonly port: number;
  readonly securite: 'AUCUNE' | 'STARTTLS' | 'TLS';
  readonly utilisateur: string | null;
  readonly expediteurNom: string | null;
  readonly expediteurEmail: string;
}

export interface ResultatEnvoi {
  readonly ok: boolean;
  /** Ce qui a échoué, dit en clair — jamais un code seul. */
  readonly message: string;
}

/** Au-delà, on considère que le serveur ne répondra pas. */
const DELAI_MS = 10_000;

/**
 * Un dialogue SMTP est une suite de « j'écris une ligne, j'attends un code ».
 *
 * Cette enveloppe rend cette suite lisible : chaque étape attend le code
 * qu'elle exige, et signale précisément lequel n'est pas venu — c'est ce qui
 * distingue « serveur injoignable » de « mot de passe refusé », les deux
 * diagnostics qu'on cherche en testant une configuration.
 */
class Conversation {
  private tampon = '';

  constructor(private readonly socket: net.Socket) {}

  /** Attend une réponse dont le code commence par l'un des préfixes donnés. */
  attendre(codes: readonly string[]): Promise<string> {
    return new Promise((resoudre, rejeter) => {
      const minuteur = setTimeout(
        () => rejeter(new Error('Le serveur n’a pas répondu dans le délai imparti.')),
        DELAI_MS,
      );

      const surDonnees = (morceau: Buffer) => {
        this.tampon += morceau.toString('utf8');

        // Une réponse SMTP peut tenir sur plusieurs lignes : seule la dernière
        // porte un espace après le code (« 250-… » puis « 250 … »).
        const lignes = this.tampon.split(/\r?\n/).filter(Boolean);
        const derniere = lignes.at(-1) ?? '';
        if (!/^\d{3} /.test(derniere)) return;

        clearTimeout(minuteur);
        this.socket.off('data', surDonnees);
        const reponse = this.tampon;
        this.tampon = '';

        if (codes.some((c) => derniere.startsWith(c))) resoudre(reponse);
        else rejeter(new Error(derniere.trim()));
      };

      this.socket.on('data', surDonnees);
      this.socket.once('error', (e) => {
        clearTimeout(minuteur);
        rejeter(e);
      });
    });
  }

  ecrire(ligne: string) {
    this.socket.write(`${ligne}\r\n`);
  }
}

function connecter(parametres: ParametresSmtp): Promise<net.Socket> {
  return new Promise((resoudre, rejeter) => {
    const options = { host: parametres.hote, port: parametres.port };

    const socket =
      parametres.securite === 'TLS'
        ? tls.connect({ ...options, servername: parametres.hote }, () => resoudre(socket))
        : net.connect(options, () => resoudre(socket));

    socket.setTimeout(DELAI_MS);
    socket.once('error', rejeter);
    socket.once('timeout', () =>
      rejeter(new Error('Connexion au serveur impossible : délai dépassé.')),
    );
  });
}

/** L'en-tête `From:` tel que le destinataire le lira. */
function expediteur(p: ParametresSmtp): string {
  return p.expediteurNom ? `${p.expediteurNom} <${p.expediteurEmail}>` : p.expediteurEmail;
}

/**
 * Envoie un message. Rend TOUJOURS un résultat — jamais d'exception.
 *
 * Le message d'échec est destiné à l'utilisateur : il porte la réponse du
 * serveur telle quelle quand il y en a une (« 535 Authentication failed »),
 * parce que c'est la seule chose qui permette de corriger la configuration.
 */
export async function envoyerMessage(
  parametres: ParametresSmtp,
  destinataire: string,
  sujet: string,
  corpsHtml: string,
): Promise<ResultatEnvoi> {
  let socket: net.Socket | null = null;

  try {
    socket = await connecter(parametres);
    let dialogue = new Conversation(socket);

    await dialogue.attendre(['220']);
    dialogue.ecrire(`EHLO ${parametres.expediteurEmail.split('@')[1] ?? 'synod'}`);
    await dialogue.attendre(['250']);

    if (parametres.securite === 'STARTTLS') {
      dialogue.ecrire('STARTTLS');
      await dialogue.attendre(['220']);

      // La connexion est REMPLACÉE par sa version chiffrée : tout ce qui suit,
      // y compris le mot de passe, passe désormais dedans.
      const chiffre = tls.connect({ socket, servername: parametres.hote });
      await new Promise((r, j) => {
        chiffre.once('secureConnect', r);
        chiffre.once('error', j);
      });

      socket = chiffre;
      dialogue = new Conversation(chiffre);
      dialogue.ecrire(`EHLO ${parametres.expediteurEmail.split('@')[1] ?? 'synod'}`);
      await dialogue.attendre(['250']);
    }

    const motDePasse = process.env.SMTP_PASS;
    if (parametres.utilisateur && motDePasse) {
      dialogue.ecrire('AUTH LOGIN');
      await dialogue.attendre(['334']);
      dialogue.ecrire(Buffer.from(parametres.utilisateur).toString('base64'));
      await dialogue.attendre(['334']);
      dialogue.ecrire(Buffer.from(motDePasse).toString('base64'));
      await dialogue.attendre(['235']);
    } else if (parametres.utilisateur) {
      return {
        ok: false,
        message:
          'Un nom d’utilisateur est configuré, mais aucun mot de passe n’est posé sur le ' +
          'serveur (variable SMTP_PASS). L’authentification ne peut pas aboutir.',
      };
    }

    dialogue.ecrire(`MAIL FROM:<${parametres.expediteurEmail}>`);
    await dialogue.attendre(['250']);
    dialogue.ecrire(`RCPT TO:<${destinataire}>`);
    await dialogue.attendre(['250', '251']);
    dialogue.ecrire('DATA');
    await dialogue.attendre(['354']);

    /**
     * Le sujet est encodé en base64 selon la RFC 2047 : sans cela, un accent
     * dans « Réinitialisation » arrive en caractères illisibles chez la moitié
     * des clients de messagerie.
     */
    const sujetEncode = `=?UTF-8?B?${Buffer.from(sujet).toString('base64')}?=`;

    const entetes = [
      `From: ${expediteur(parametres)}`,
      `To: <${destinataire}>`,
      `Subject: ${sujetEncode}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      `Date: ${new Date().toUTCString()}`,
      '',
    ];

    // Une ligne réduite à un point termine le message : une ligne du CORPS qui
    // commencerait par un point couperait donc l'envoi. La doubler est la
    // parade prévue par la norme.
    const corps = corpsHtml.split(/\r?\n/).map((l) => (l.startsWith('.') ? `.${l}` : l));

    dialogue.ecrire([...entetes, ...corps, '.'].join('\r\n'));
    await dialogue.attendre(['250']);

    dialogue.ecrire('QUIT');

    return { ok: true, message: 'Message envoyé.' };
  } catch (erreur) {
    return {
      ok: false,
      message: erreur instanceof Error ? erreur.message : 'Échec de l’envoi.',
    };
  } finally {
    socket?.destroy();
  }
}
