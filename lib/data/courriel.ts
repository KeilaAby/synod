import 'server-only';

import { createClient } from '@/lib/supabase/server';

/**
 * Configuration d'envoi et modeles de message — EF-ADM-13.
 *
 * RIEN N'ENVOIE ENCORE. Ces lectures servent a SAISIR et VERIFIER la
 * configuration avant qu'un envoi n'en depende : decouvrir un port faux le jour
 * ou l'on active les notifications, c'est decouvrir que personne n'a rien recu.
 *
 * LES DEUX TABLES SONT RESERVEES A `settings.manage` par leur RLS (migration
 * 0047), contrairement aux parametres generaux que tout compte lit. Un hote
 * SMTP et un nom d'utilisateur decrivent l'infrastructure : ils ne servent a
 * personne d'autre qu'a l'administration.
 */

export interface ConfigurationCourriel {
  actif: boolean;
  hote: string | null;
  port: number | null;
  securite: 'AUCUNE' | 'STARTTLS' | 'TLS';
  utilisateur: string | null;
  expediteur_nom: string | null;
  expediteur_email: string | null;
}

const REPLI: ConfigurationCourriel = {
  // Une lecture qui echoue ne doit pas laisser croire que l'envoi fonctionne.
  actif: false,
  hote: null,
  port: 587,
  securite: 'STARTTLS',
  utilisateur: null,
  expediteur_nom: null,
  expediteur_email: null,
};

export async function chargerConfigurationCourriel(): Promise<ConfigurationCourriel> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('email_settings')
    .select('actif, hote, port, securite, utilisateur, expediteur_nom, expediteur_email')
    .eq('id', 1)
    .maybeSingle<ConfigurationCourriel>();

  // Sans `settings.manage`, la RLS ne rend rien : le repli tient lieu de
  // reponse, et l'ecran n'est de toute facon pas propose (regle 15 — l'ecran
  // ne conclut pas d'un vide qu'il n'y a rien, il n'y a simplement pas acces).
  return error || !data ? REPLI : data;
}

export interface ModeleCourriel {
  cle: string;
  libelle: string;
  description: string | null;
  sujet: string;
  corps: string;
  actif: boolean;
}

export async function chargerModelesCourriel(): Promise<ModeleCourriel[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from('email_templates')
    .select('cle, libelle, description, sujet, corps, actif')
    .order('libelle')
    .returns<ModeleCourriel[]>();

  return error ? [] : (data ?? []);
}
