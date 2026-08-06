'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { TextField } from '@/components/shared/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { definirNouveauMotDePasse } from '@/lib/actions/auth';
import { MOT_DE_PASSE_LONGUEUR_MIN } from '@/lib/auth/types';
import {
  type NouveauMotDePasseInput,
  nouveauMotDePasseSchema,
} from '@/lib/validation/auth';

/**
 * EF-AUT-02 — definition d'un nouveau mot de passe.
 *
 * Cet ecran n'est atteignable qu'avec la session de recuperation ouverte par le
 * lien recu par e-mail. Sans elle, l'action serveur echoue et l'utilisateur est
 * invite a redemander un lien.
 */
export default function ReinitialiserPage() {
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
    const resultat = await definirNouveauMotDePasse(valeurs);

    if (!resultat.ok) {
      setErreur(resultat.error);
      return;
    }

    toast.success('Mot de passe mis a jour.');
    router.replace('/tableau-de-bord');
  }

  return (
    <Card>
      <CardContent className="space-y-8 p-6 sm:p-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Nouveau mot de passe
          </h1>
          <p className="text-sm text-muted-foreground">
            Au moins {MOT_DE_PASSE_LONGUEUR_MIN} caracteres, avec une majuscule, une minuscule
            et un chiffre.
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
            error={errors.motDePasse?.message}
            {...register('motDePasse')}
          />

          <TextField
            label="Confirmez le mot de passe"
            type="password"
            autoComplete="new-password"
            required
            error={errors.confirmation?.message}
            {...register('confirmation')}
          />

          <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            Enregistrer le mot de passe
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
