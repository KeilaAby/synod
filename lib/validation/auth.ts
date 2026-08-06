import { z } from 'zod';

import { MOT_DE_PASSE_LONGUEUR_MIN } from '@/lib/auth/types';

/**
 * Schemas d'authentification — plan.md §7.4.
 *
 * Le MEME schema alimente React Hook Form (`zodResolver`) et la Server Action :
 * un seul message d'erreur, une seule source de verite (ENF-MNT-02).
 */

export const connexionSchema = z.object({
  email: z.email('Adresse e-mail invalide.'),
  motDePasse: z.string().min(1, 'Le mot de passe est requis.'),
  /** Destination d'origine, restauree apres authentification. */
  suite: z.string().optional(),
});

export type ConnexionInput = z.infer<typeof connexionSchema>;

export const demandeReinitialisationSchema = z.object({
  email: z.email('Adresse e-mail invalide.'),
});

export type DemandeReinitialisationInput = z.infer<typeof demandeReinitialisationSchema>;

/** ENF-SEC-03 — politique de mot de passe, appliquee des la saisie. */
export const nouveauMotDePasseSchema = z
  .object({
    motDePasse: z
      .string()
      .min(
        MOT_DE_PASSE_LONGUEUR_MIN,
        `Le mot de passe doit comporter au moins ${MOT_DE_PASSE_LONGUEUR_MIN} caracteres.`,
      )
      .regex(/[a-z]/, 'Le mot de passe doit contenir une minuscule.')
      .regex(/[A-Z]/, 'Le mot de passe doit contenir une majuscule.')
      .regex(/[0-9]/, 'Le mot de passe doit contenir un chiffre.'),
    confirmation: z.string(),
  })
  .refine((d) => d.motDePasse === d.confirmation, {
    message: 'Les deux mots de passe ne correspondent pas.',
    path: ['confirmation'],
  });

export type NouveauMotDePasseInput = z.infer<typeof nouveauMotDePasseSchema>;
