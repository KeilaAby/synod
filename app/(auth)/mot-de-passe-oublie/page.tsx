'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { TextField } from '@/components/shared/field';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { demanderReinitialisation } from '@/lib/actions/auth';
import {
  type DemandeReinitialisationInput,
  demandeReinitialisationSchema,
} from '@/lib/validation/auth';

/**
 * EF-AUT-02 — demande de reinitialisation.
 *
 * L'ecran de confirmation est volontairement identique que l'adresse existe ou
 * non : reveler qu'un compte existe reviendrait a offrir un enumerateur de
 * comptes a quiconque dispose du formulaire.
 */
export default function MotDePasseOubliePage() {
  const [envoye, setEnvoye] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<DemandeReinitialisationInput>({
    resolver: zodResolver(demandeReinitialisationSchema),
    defaultValues: { email: '' },
  });

  async function envoyer(valeurs: DemandeReinitialisationInput) {
    await demanderReinitialisation(valeurs);
    setEnvoye(true);
  }

  if (envoye) {
    return (
      <Card>
        <CardContent className="space-y-6 p-6 text-center sm:p-8">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <MailCheck className="size-6" strokeWidth={1.5} aria-hidden />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Verifiez votre messagerie
            </h1>
            <p className="text-sm text-muted-foreground">
              Si un compte est associe a <strong>{getValues('email')}</strong>, un lien de
              reinitialisation vient d&apos;etre envoye. Il est valable 60 minutes et ne peut
              servir qu&apos;une fois.
            </p>
          </div>

          <Button asChild variant="outline" className="h-10 w-full">
            <Link href="/connexion">
              <ArrowLeft className="mr-2 size-4" aria-hidden />
              Retour a la connexion
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-8 p-6 sm:p-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Mot de passe oublie
          </h1>
          <p className="text-sm text-muted-foreground">
            Indiquez votre adresse : nous vous enverrons un lien de reinitialisation.
          </p>
        </div>

        <form onSubmit={handleSubmit(envoyer)} className="space-y-6" noValidate>
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

          <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            Envoyer le lien
          </Button>

          <Button asChild variant="ghost" className="h-10 w-full">
            <Link href="/connexion">
              <ArrowLeft className="mr-2 size-4" aria-hidden />
              Retour a la connexion
            </Link>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
