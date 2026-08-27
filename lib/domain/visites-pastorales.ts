import { z } from 'zod';

/**
 * Domaine Visites Pastorales — Missions, planification et ordres de mission.
 */

export const STATUTS_VISITE = ['PLANIFIE', 'CONFIRME', 'EFFECTUE', 'ANNULE'] as const;
export type StatutVisite = (typeof STATUTS_VISITE)[number];

export interface VisiteDelegue {
  readonly id?: string;
  readonly croyant_id: string;
  readonly nom_complet?: string;
  readonly matricule?: string;
  readonly grade?: string;
  readonly role_mission: string;
  readonly photo_url?: string | null;
  readonly ordre: number;
}

export interface VisitePastorale {
  readonly id: string;
  readonly entite_initiatrice_id: string;
  readonly entite_initiatrice_nom: string;
  readonly entite_cible_id: string;
  readonly entite_cible_nom: string;
  readonly date_visite: string; // 'YYYY-MM-DD'
  readonly heure_visite: string;
  readonly type_culte: string;
  readonly theme_message: string | null;
  readonly instructions: string | null;
  readonly statut: StatutVisite;
  readonly reference_ordre_mission: string;
  readonly cree_par: string | null;
  readonly valide_par: string | null;
  readonly valide_le: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly delegues: readonly VisiteDelegue[];
}

export const DelegueInputSchema = z.object({
  croyant_id: z.string().uuid({ message: 'Identifiant croyant invalide' }),
  role_mission: z
    .string()
    .trim()
    .min(1, { message: 'Le rôle dans la mission est requis' })
    .max(100, { message: 'Le rôle ne peut dépasser 100 caractères' }),
  ordre: z.number().int().min(1).default(1),
});

export const CreerVisiteSchema = z.object({
  entite_initiatrice_id: z.string().uuid({ message: 'Entité initiatrice requise' }),
  entite_cible_id: z.string().uuid({ message: 'Église destinataire requise' }),
  date_visite: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'La date doit être au format AAAA-MM-JJ' }),
  heure_visite: z.string().default('09:00'),
  type_culte: z
    .string()
    .trim()
    .min(2, { message: 'Le type de culte ou célébration est requis' })
    .max(120, { message: 'Le type de culte ne peut dépasser 120 caractères' }),
  theme_message: z.string().trim().max(300).optional().nullable(),
  instructions: z.string().trim().max(1000).optional().nullable(),
  delegues: z
    .array(DelegueInputSchema)
    .min(1, { message: 'Veuillez désigner au moins un membre de délégation' }),
});

export type CreerVisiteInput = z.infer<typeof CreerVisiteSchema>;

export const ModifierVisiteSchema = CreerVisiteSchema.extend({
  id: z.string().uuid({ message: 'Identifiant de visite requis' }),
});

export type ModifierVisiteInput = z.infer<typeof ModifierVisiteSchema>;

export const ReprogrammerVisiteSchema = z.object({
  id: z.string().uuid({ message: 'Identifiant de visite requis' }),
  date_visite: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'La date doit être au format AAAA-MM-JJ' }),
});

export type ReprogrammerVisiteInput = z.infer<typeof ReprogrammerVisiteSchema>;

/**
 * Vérifie si une visite pastorale peut être déplacée ou reprogrammée (Drag & Drop).
 * Seules les visites en statut PLANIFIE et CONFIRME sont modifiables.
 */
export function peutDeplacerVisite(statut: StatutVisite): boolean {
  return statut === 'PLANIFIE' || statut === 'CONFIRME';
}

/**
 * Formate la référence d'ordre de mission officiel
 */
export function formaterRefOrdreMission(dateIso: string, numero: number): string {
  const [annee, mois] = dateIso.split('-');
  const numPad = String(numero).padStart(3, '0');
  return `OM-SYNOD-${annee}-${mois}/${numPad}`;
}
