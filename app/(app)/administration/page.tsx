import type { Metadata } from 'next';
import {
  BookOpen,
  ScrollText,
  Server,
  Shield,
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
    titre: 'Comptes d’accès',
    description:
      'Gérer les comptes utilisateurs, délivrer les accès provisoires, suspendre ou réinitialiser les mots de passe.',
    icone: Users,
    permission: 'user.manage',
  },
  {
    href: '/administration/profils',
    titre: 'Profils de privilèges',
    description:
      'Composer et gérer les modèles d’habilitations réutilisables pour faciliter l’attribution des accès au sein de votre entité.',
    icone: Shield,
    permission: 'permission.delegate',
  },
  {
    href: '/administration/parametres',
    titre: 'Paramètres généraux',
    description:
      'Identité visuelle de l’organisation, devise, fuseau horaire, délais de correction, notifications et modèles d’attestation.',
    icone: SlidersHorizontal,
    permission: 'settings.manage',
  },
  {
    href: '/administration/audit',
    titre: 'Journal d’audit',
    description:
      'Consulter l’historique horodaté et inaltérable des connexions, modifications et opérations effectuées.',
    icone: ScrollText,
    permission: 'audit.read',
  },
  {
    href: '/administration/corbeille',
    titre: 'Corbeille',
    description:
      'Retrouver les croyants et entités supprimés, restaurer les éléments ou effectuer une purge définitive.',
    icone: Trash2,
    permission: 'trash.restore',
  },
  {
    href: '/referentiels',
    titre: 'Référentiels',
    description:
      'Administrer les nomenclatures officielles : grades, fonctions ecclésiales, nationalités, catégories financières et événements de dîmes.',
    icone: ShieldCheck,
    permission: 'referentiel.manage',
  },
  {
    href: '/administration/portabilite',
    titre: 'Portabilité & Réversibilité',
    description:
      'Exporter l’intégralité des données (SQL + fichiers + manifeste) et consulter la procédure de restauration souveraine.',
    icone: Server,
    permission: 'settings.manage',
  },
  {
    href: '/documentation',
    titre: 'Manuel d’Administration & Guide',
    description:
      'Consulter le manuel complet d’administration, la gouvernance des accès, la portabilité et le guide utilisateur.',
    icone: BookOpen,
    permission: 'settings.manage',
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
