import type { Metadata } from 'next';
import {
  ScrollText,
  Trash2,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { type Permission, detient } from '@/lib/domain/permissions';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Administration' };

/**
 * Le hub d'administration — lot 7.
 *
 * IL NE LISTE QUE CE QUI EXISTE. Un menu qui mène à une 404 est pire qu'un menu
 * incomplet : il fait douter du reste. Chaque section s'ajoute ici en même
 * temps que son écran — même règle que les entrées de navigation, appliquée
 * depuis le 11 août.
 *
 * CHAQUE SECTION PORTE SON DROIT, et une section non habilitée DISPARAÎT plutôt
 * que de s'afficher grisée. Ce n'est pas la règle qu'on suit ailleurs — une
 * action impossible reste visible et expliquée —, mais ici il ne s'agit pas
 * d'une action : c'est un territoire entier. Annoncer « journal d'audit » à qui
 * ne le lira jamais ne lui apprend rien d'utile sur son propre travail.
 */
interface Section {
  readonly href: string;
  readonly titre: string;
  readonly description: string;
  readonly icone: LucideIcon;
  readonly permission: Permission;
}

const SECTIONS: readonly Section[] = [
  {
    href: '/administration/comptes',
    titre: 'Comptes',
    description:
      'Ouvrir un compte, réinitialiser un mot de passe, activer ou désactiver. Les identifiants se remettent en main propre — aucun courriel n’est envoyé.',
    icone: Users,
    permission: 'user.manage',
  },
  {
    href: '/administration/parametres',
    titre: 'Paramètres généraux',
    description:
      'Identité de l’organisation, devise, fuseau, workflows financiers, composition des rapports.',
    icone: SlidersHorizontal,
    permission: 'settings.manage',
  },
  {
    href: '/administration/audit',
    titre: 'Journal d’audit',
    description:
      'Qui a fait quoi, et quand. Le journal ne se modifie jamais — c’est ce qui lui donne sa valeur.',
    icone: ScrollText,
    permission: 'audit.read',
  },
  {
    href: '/administration/corbeille',
    titre: 'Corbeille',
    description:
      'Ce qui a été supprimé, et peut revenir. Rien n’est jamais effacé définitivement : l’historique doit rester juste.',
    icone: Trash2,
    permission: 'trash.restore',
  },
  {
    /**
     * EF-ADM-13 — LES RÉFÉRENTIELS NE SONT PAS RÉÉCRITS ICI.
     *
     * Grades, nationalités, fonctions et catégories ont leur CRUD complet
     * depuis le lot 1. Ce qui manquait n'était pas la fonctionnalité mais son
     * emplacement : rien ne les reliait à l'administration, et le SuperAdmin ne
     * savait pas qu'ils existaient. Un renvoi, donc — pas un second chemin
     * (règle 16).
     */
    href: '/referentiels',
    titre: 'Référentiels',
    description:
      'Grades, nationalités, fonctions, catégories financières. L’écran existe depuis le lot 1 ; cette carte ne fait que le relier.',
    icone: ShieldCheck,
    permission: 'referentiel.manage',
  },
];

export default async function AdministrationPage() {
  const session = await getSession();
  if (!session) redirect('/connexion');

  const visibles = SECTIONS.filter((s) => detient(session, s.permission));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Administration"
        description="Ce qui règle l’application elle-même, plutôt que les données qu’elle contient."
      />

      {visibles.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Aucune section d’administration ne vous est ouverte"
          description="L’administration se délègue droit par droit. Demandez celui qui correspond à ce que vous devez régler."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibles.map((section) => {
            const Icone = section.icone;

            return (
              <Card key={section.href} className="transition-shadow hover:shadow-md">
                <Link href={section.href} className="block">
                  <CardContent className="flex gap-4 p-6">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
                      <Icone className="size-5" strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="min-w-0 space-y-1">
                      <span className="block text-sm font-semibold text-foreground">
                        {section.titre}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {section.description}
                      </span>
                    </span>
                  </CardContent>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
