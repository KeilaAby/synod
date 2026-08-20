import { CalendarX } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { DeconnexionBouton } from '@/components/layout/deconnexion-bouton';
import { Card, CardContent } from '@/components/ui/card';
import { getSession } from '@/lib/session';
import { formatDate } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Mandat terminé' };

/**
 * RG-07 — l'ecran qu'on atteint quand tous ses mandats ont pris fin.
 *
 * IL EXPLIQUE, IL NE REFUSE PAS. Fermer l'acces en renvoyant vers la page de
 * connexion aurait donne « identifiants incorrects » a quelqu'un dont les
 * identifiants sont justes : il aurait tape le mot de passe trois fois, demande
 * une reinitialisation, et appele quand meme — apres avoir perdu vingt minutes.
 * Le compte n'est pas casse, il n'est plus en fonction : c'est cela qu'il faut
 * lire.
 *
 * IL VIT DANS LE GROUPE `(auth)`, hors du gabarit applicatif : la navigation y
 * proposerait les ecrans dont on vient d'etre ecarte, et le gabarit `(app)`
 * redirigeant ICI, en faire partie boucherait.
 *
 * LA DECONNEXION EST LA SEULE ACTION. Elle sert vraiment : sur un poste
 * partage, la personne suivante doit pouvoir ouvrir sa propre session.
 */
export default async function MandatEchuPage() {
  const session = await getSession();
  if (!session) redirect('/connexion');

  // Qui n'a rien a y faire en repart : sans le drapeau, on a tape l'adresse.
  if (!session.mandatEchu) redirect('/tableau-de-bord');

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="flex size-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <CalendarX className="size-6" strokeWidth={1.5} aria-hidden />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Votre mandat a pris fin</h1>
          <p className="text-muted-foreground text-sm">
            {session.nomComplet}, l’accès à SYNOD est réservé aux membres de bureau
            en exercice.{' '}
            {session.finDeMandat ? (
              <>
                Votre dernier mandat s’est terminé le{' '}
                <span className="text-foreground font-medium tabular-nums">
                  {formatDate(session.finDeMandat)}
                </span>
                .
              </>
            ) : (
              <>Aucun mandat en cours n’est enregistré à votre nom.</>
            )}
          </p>
        </div>

        {/*
          CE QUI SE PASSE ENSUITE, dit sans jargon. « Contactez votre
          administrateur » sans plus laisserait chercher QUI, et QUOI demander.
        */}
        <div className="border-border bg-muted/40 space-y-2 rounded-lg border p-4 text-sm">
          <p className="font-medium">Si c’est une erreur</p>
          <p className="text-muted-foreground">
            Votre mandat a peut-être été reconduit sans que la date de fin ait été
            mise à jour. Demandez au responsable de votre entité d’ouvrir le bureau
            dans SYNOD et de prolonger votre mandat : l’accès revient dès la
            prochaine connexion, sans nouveau mot de passe.
          </p>
        </div>

        <p className="text-muted-foreground text-xs">
          Vos données restent intactes. Rien n’a été supprimé : c’est l’accès qui
          est suspendu, pas la fiche ni l’historique.
        </p>

        <DeconnexionBouton />
      </CardContent>
    </Card>
  );
}
