import { z } from 'zod';

import { MOT_DE_PASSE_LONGUEUR_MIN } from '@/lib/auth/types';

/**
 * Schemas d'authentification — plan.md §7.4.
 *
 * Le MEME schema alimente React Hook Form (`zodResolver`) et la Server Action :
 * un seul message d'erreur, une seule source de verite (ENF-MNT-02).
 */

/**
 * EF-AUT-01 — ON SE CONNECTE PAR COURRIEL **OU** PAR MATRICULE.
 *
 * Le champ ne s'appelle donc plus `email` : il accepte les deux, et c'est le
 * serveur qui tranche. La raison est de terrain — un croyant connait son
 * matricule, il l'a sur sa carte ; son adresse, il l'a parfois donnee une fois
 * a l'inscription et ne s'en sert jamais.
 *
 * AUCUNE VALIDATION DE FORME ICI, et c'est deliberé. `z.email()` refuserait un
 * matricule, et une regex qui accepterait « l'un ou l'autre » n'apprendrait
 * rien de plus que « non vide » : les deux formats sont trop differents pour
 * qu'un message d'erreur commun soit utile. Le serveur repond « identifiant ou
 * mot de passe incorrect » dans tous les cas — dire « ce matricule n'existe
 * pas » renseignerait sur les comptes enregistres (meme principe qu'EF-AUT-02).
 */
export const connexionSchema = z.object({
  identifiant: z
    .string()
    .trim()
    .min(1, 'Saisissez votre adresse e-mail ou votre matricule.')
    .max(160),
  motDePasse: z.string().min(1, 'Le mot de passe est requis.'),
  /** Destination d'origine, restauree apres authentification. */
  suite: z.string().optional(),
});

export type ConnexionInput = z.infer<typeof connexionSchema>;

/** Un identifiant qui contient une arobase est une adresse ; sinon, un matricule. */
export function estAdresse(identifiant: string): boolean {
  return identifiant.includes('@');
}

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
