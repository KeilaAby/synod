'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, KeyRound, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { TextField } from '@/components/shared/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { choisirMotDePasse } from '@/lib/actions/comptes';
import { appelerAction } from '@/lib/utils/appeler-action';
import {
  type NouveauMotDePasseInput,
  nouveauMotDePasseSchema,
} from '@/lib/validation/auth';

/**
 * EF-ADM-01, EF-ADM-08 — choisir son mot de passe, une fois pour toutes.
 *
 * AUCUN BOUTON POUR PASSER. C'est la seule chose que cet écran refuse : tant
 * que le mot de passe provisoire tient, le compte est connu de deux personnes.
 * « Plus tard » signifierait « jamais » pour la plupart, et l'administrateur
 * garderait indéfiniment la clef d'un compte qui n'est pas le sien.
 *
 * LE MOT DE PASSE ACTUEL N'EST PAS REDEMANDÉ. L'utilisateur vient de s'en
 * servir pour arriver ici — le redemander vérifierait ce qui est déjà établi,
 * et ferait retaper une chaîne dictée au téléphone, qu'on saisit mal une fois
 * sur trois.
 */
export function ChangementForm({ nomComplet }: { nomComplet: string }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NouveauMotDePasseInput>({
    resolver: zodResolver(nouveauMotDePasseSchema),
    defaultValues: { motDePasse: '', confirmation: '' },
  });

  async function envoyer(valeurs: NouveauMotDePasseInput) {
    setErreur(null);

    const resultat = await appelerAction(() => choisirMotDePasse(valeurs));
    if (!resultat.ok) {
      setErreur(resultat.error);
      return;
    }

    /**
     * `refresh` avant `push` : la session porte encore le drapeau, et le
     * gabarit applicatif renverrait ici même. Le rafraîchissement relit le
     * profil — sans lui, on repartirait en boucle sur cet écran.
     */
    router.refresh();
    router.push('/tableau-de-bord');
  }

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="flex size-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <KeyRound className="size-6" strokeWidth={1.5} aria-hidden />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">
            Choisissez votre mot de passe
          </h1>
          <p className="text-sm text-muted-foreground">
            Bonjour {nomComplet}. Celui qui vous a été communiqué est{' '}
            <strong>provisoire</strong> : une autre personne le connaît. Le
            remplacer est la première chose à faire.
          </p>
        </div>

        <form onSubmit={handleSubmit(envoyer)} className="space-y-6" noValidate>
          {erreur && (
            <Alert variant="destructive" role="alert">
              <AlertCircle className="size-4" aria-hidden />
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}

          <TextField
            label="Nouveau mot de passe"
            type="password"
            autoComplete="new-password"
            autoFocus
            required
            hint="Douze caractères au moins, avec une majuscule, une minuscule et un chiffre."
            error={errors.motDePasse?.message}
            {...register('motDePasse')}
          />

          <TextField
            label="Confirmation"
            type="password"
            autoComplete="new-password"
            required
            error={errors.confirmation?.message}
            {...register('confirmation')}
          />

          <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            Enregistrer et continuer
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
