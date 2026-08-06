import { redirect } from 'next/navigation';

/**
 * Racine : aucun contenu propre.
 * Le middleware oriente deja vers /connexion ou /tableau-de-bord selon la
 * session ; cette redirection couvre les acces qui le contourneraient.
 */
export default function Racine() {
  redirect('/tableau-de-bord');
}
