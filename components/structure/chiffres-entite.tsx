import { Users, Wallet } from 'lucide-react';
import Link from 'next/link';

import { StatusBadge } from '@/components/shared/status-badge';
import type { ChiffresEntite } from '@/lib/data/entities';
import { type Solde, soldeConsolide, soldePropre } from '@/lib/domain/finance';
import { formatDateLongue, formatMontant, formatNombre } from '@/lib/utils/format';

/**
 * EF-STR-06 — ce que l'entite PÈSE : effectifs, bureau, solde.
 *
 * UN SEUL RENDU POUR DEUX ÉCRANS (règle 16). Le pop-up de l'organigramme et la
 * fiche pleine page montrent les mêmes chiffres ; deux rendus auraient divergé
 * à la première retouche, et le lecteur n'aurait pas su lequel croire.
 *
 * L'INDICATEUR NON HABILITÉ DISPARAÎT — il ne s'affiche pas à zéro. C'est la
 * doctrine du tableau de bord (règle 15), et elle compte doublement ici : la
 * RLS compte à zéro ce qu'on n'a pas le droit de lire, et ce zéro affiché se
 * lirait « cette église n'a personne » là où la vérité est « je n'ai pas le
 * droit de savoir ». Deux constats opposés, une seule apparence.
 *
 * Aucun composant n'est un composant client : ce fichier est rendu aussi bien
 * depuis la page (Server Component) que depuis le pop-up.
 */
export interface DroitsChiffres {
  readonly croyants: boolean;
  readonly bureau: boolean;
  readonly finances: boolean;
}

export function ChiffresEntiteBloc({
  entiteId,
  nom,
  chiffres,
  solde,
  devise,
  droits,
  /** La fiche pleine page a la place de respirer ; le pop-up, non. */
  colonnes = 3,
}: {
  entiteId: string;
  nom: string;
  chiffres: ChiffresEntite | null;
  solde: Solde | null;
  devise: string;
  droits: DroitsChiffres;
  colonnes?: 2 | 3;
}) {
  const rienDuTout = !droits.croyants && !droits.bureau && !droits.finances;

  if (rienDuTout) {
    return (
      <p className="text-muted-foreground text-sm">
        Vous n’êtes pas habilité à consulter les effectifs, le bureau ni les
        finances de cette entité.
      </p>
    );
  }

  return (
    <div
      className={`grid gap-4 ${colonnes === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}
    >
      {droits.croyants && (
        <Carte
          titre="Croyants"
          icone={<Users className="size-4" aria-hidden />}
          teinte="bg-indigo-50 text-indigo-600"
        >
          {chiffres ? (
            <>
              <p className="text-foreground text-3xl font-semibold tabular-nums">
                {formatNombre(chiffres.croyantsConsolides)}
              </p>
              {/*
                LE PROPRE N'A DE SENS QUE S'IL DIFFÈRE. Sur une église, les deux
                nombres sont égaux : les répéter ferait chercher la différence.
              */}
              <p className="text-muted-foreground text-xs">
                {chiffres.croyantsPropres === chiffres.croyantsConsolides
                  ? 'Rattachés à cette entité.'
                  : `dont ${formatNombre(chiffres.croyantsPropres)} en propre — le reste au périmètre.`}
              </p>
              <Lien href={`/croyants?entite=${entiteId}`}>Voir la liste</Lien>
            </>
          ) : (
            <Indisponible />
          )}
        </Carte>
      )}

      {droits.bureau && (
        <Carte
          titre="Bureau"
          icone={<Users className="size-4" aria-hidden />}
          teinte="bg-amber-50 text-amber-600"
        >
          {!chiffres ? (
            <Indisponible />
          ) : chiffres.bureau ? (
            <>
              <p className="text-foreground text-3xl font-semibold tabular-nums">
                {formatNombre(chiffres.bureau.membres)}
              </p>
              <p className="text-muted-foreground text-xs">
                {chiffres.bureau.membres > 1 ? 'fonctions occupées' : 'fonction occupée'}
                {chiffres.bureau.dateFin
                  ? ` — mandat jusqu’au ${formatDateLongue(chiffres.bureau.dateFin)}`
                  : ' — mandat sans terme fixé'}
              </p>
              <Lien href={`/bureaux/${chiffres.bureau.id}/organigramme`}>
                Ouvrir « {chiffres.bureau.libelle} »
              </Lien>
            </>
          ) : (
            <>
              {/*
                PAS DE BUREAU N'EST PAS UNE PANNE : c'est un état, et il se
                nomme. Une cellule n'en a jamais (RG-21) — l'annoncer comme un
                manque ferait chercher à le corriger.
              */}
              <StatusBadge tone="warning">Aucun bureau en cours</StatusBadge>
              <p className="text-muted-foreground text-xs">
                Aucun mandat actif n’est enregistré pour {nom}.
              </p>
              <Lien href={`/bureaux?entite=${entiteId}`}>Voir les bureaux</Lien>
            </>
          )}
        </Carte>
      )}

      {droits.finances && (
        <Carte
          titre="Solde disponible"
          icone={<Wallet className="size-4" aria-hidden />}
          teinte="bg-emerald-50 text-emerald-600"
        >
          {solde ? (
            <>
              <p
                className={`text-2xl font-semibold tabular-nums ${
                  soldeConsolide(solde) < 0 ? 'text-rose-700' : 'text-foreground'
                }`}
              >
                {formatMontant(soldeConsolide(solde), devise)}
              </p>
              {/*
                EF-FIN-12 — le PROPRE à côté du consolidé, et ce n'est pas
                cosmétique : une paroisse dont le consolidé est confortable peut
                n'avoir rien en propre. Confondre les deux fait engager l'argent
                de ses églises.
              */}
              <p className="text-muted-foreground text-xs tabular-nums">
                {soldePropre(solde) === soldeConsolide(solde)
                  ? 'Cette entité seule.'
                  : `dont ${formatMontant(soldePropre(solde), devise)} en propre`}
              </p>
              <Lien href={`/finances?entite=${entiteId}`}>Voir les mouvements</Lien>
            </>
          ) : (
            <Indisponible />
          )}
        </Carte>
      )}
    </div>
  );
}

function Carte({
  titre,
  icone,
  teinte,
  children,
}: {
  titre: string;
  icone: React.ReactNode;
  teinte: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border/70 space-y-2 rounded-lg border p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`flex size-8 items-center justify-center rounded-lg ${teinte}`}>
          {icone}
        </span>
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.08em] uppercase">
          {titre}
        </p>
      </div>
      {children}
    </div>
  );
}

function Lien({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-primary inline-block text-xs font-medium hover:underline"
    >
      {children}
    </Link>
  );
}

/**
 * Règle 15 — une lecture qui n'a pas abouti ne se déguise pas en zéro.
 *
 * Le bloc est demandé et l'habilitation est là : le montrer vide dirait « il
 * n'y a rien », quand la cause est que le chiffre n'est pas arrivé.
 */
function Indisponible() {
  return (
    <p className="text-muted-foreground text-sm">Ce chiffre n’a pas pu être chargé.</p>
  );
}
