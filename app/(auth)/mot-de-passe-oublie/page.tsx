import type { Metadata } from 'next';
import { ArrowLeft, UserCog } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getParametres } from '@/lib/data/settings';

import { DemandeForm } from './demande-form';

export const metadata: Metadata = { title: 'Mot de passe oublie' };

/**
 * EF-AUT-02, EF-ADM-13 — deux circuits, et c'est le Siege qui choisit.
 *
 * ACTIF — l'utilisateur demande lui-meme, un lien lui parvient par courriel.
 * INACTIF — il contacte le Siege ou l'administrateur de son entite, qui lui
 * remet un mot de passe provisoire.
 *
 * POURQUOI CE SECOND CIRCUIT EXISTE. Les comptes se creent sans invitation par
 * courriel : beaucoup d'adresses sont de convenance — saisies une fois, jamais
 * relevees. Un formulaire qui repond « un lien vous a ete envoye » sur une
 * boite que personne n'ouvre laisse l'utilisateur dehors ET convaincu que
 * l'application a fait ce qu'il fallait. Fermer le circuit est plus honnete que
 * de le laisser ouvert.
 *
 * LE REGLAGE SE LIT ICI, A CHAQUE RENDU (regle 21). Fige au chargement du
 * module, il ne prendrait effet qu'au redemarrage suivant.
 */
export default async function MotDePasseOubliePage() {
  const { reinitialisation_par_email } = await getParametres();

  if (reinitialisation_par_email) return <DemandeForm />;

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="flex size-12 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
          <UserCog className="size-6" strokeWidth={1.5} aria-hidden />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">
            La réinitialisation passe par un administrateur
          </h1>
          <p className="text-sm text-muted-foreground">
            Contactez le Siège ou l’administrateur de votre entité : il vous
            remettra un mot de passe provisoire, que vous changerez à la
            première connexion.
          </p>
        </div>

        {/*
          AUCUN NOM, AUCUNE ADRESSE. Qui contacter dépend de l'entité de
          l'utilisateur — que cet écran ne connaît pas, puisqu'il n'est pas
          connecté. Afficher un contact générique enverrait la moitié des
          demandes au mauvais endroit ; nommer les administrateurs publierait
          un annuaire à qui n'a pas de compte.
        */}
        <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          Si vous ne savez pas à qui vous adresser, votre responsable de bureau
          le sait : c’est lui qui a ouvert votre compte.
        </p>

        <Button asChild variant="outline" className="h-10 w-full">
          <Link href="/connexion">
            <ArrowLeft className="mr-2 size-4" aria-hidden />
            Retour à la connexion
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
