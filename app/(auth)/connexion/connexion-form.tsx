'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { TextField } from '@/components/shared/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { connexion } from '@/lib/actions/auth';
import { type ConnexionInput, connexionSchema } from '@/lib/validation/auth';

export function ConnexionForm() {
  const parametres = useSearchParams();
  const suite = parametres.get('suite') ?? undefined;
  const [erreur, setErreur] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ConnexionInput>({
    resolver: zodResolver(connexionSchema),
    defaultValues: { email: '', motDePasse: '', suite },
  });

  async function envoyer(valeurs: ConnexionInput) {
    setErreur(null);
    // En cas de succes, l'action redirige : la promesse ne resout pas de valeur.
    const resultat = await connexion({ ...valeurs, suite });
    if (resultat && !resultat.ok) {
      setErreur(resultat.error);
    }
  }

  return (
    <form onSubmit={handleSubmit(envoyer)} className="space-y-6" noValidate>
      {erreur && (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}

      <TextField
        label="Adresse e-mail"
        type="email"
        autoComplete="email"
        autoFocus
        required
        placeholder="prenom.nom@exemple.org"
        error={errors.email?.message}
        {...register('email')}
      />

      <div className="space-y-2">
        <TextField
          label="Mot de passe"
          type="password"
          autoComplete="current-password"
          required
          error={errors.motDePasse?.message}
          {...register('motDePasse')}
        />
        <div className="flex justify-end">
          <Link
            href="/mot-de-passe-oublie"
            className="text-xs font-medium text-indigo-600 underline-offset-4 transition-colors hover:text-indigo-700 hover:underline"
          >
            Mot de passe oublie ?
          </Link>
        </div>
      </div>

      {/* UI-16 : le spinner signale une ACTION ponctuelle, pas un chargement de page. */}
      <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
        Se connecter
      </Button>
    </form>
  );
}
