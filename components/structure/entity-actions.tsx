'use client';

import { Loader2, MoreHorizontal, Move, Pencil, Trash2, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useSession } from '@/components/shared/session-provider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  basculerAccesApplication,
  rattacherEntite,
  supprimerEntite,
} from '@/lib/actions/entities';
import { ENTITY_LABELS, type EntityType, typeParentDe } from '@/lib/domain/hierarchy';

import { EntityPicker, type OptionEntite } from './entity-picker';

/**
 * Actions sur une entite — EF-STR-07, EF-STR-08, EF-STR-10.
 *
 * `<PermissionGate>` masque ce qui n'est pas autorise, mais chaque action est
 * revalidee cote serveur : ce composant n'est qu'un confort d'affichage.
 */
export function EntityActions({
  entite,
  parentsValides,
}: {
  entite: {
    id: string;
    nom: string;
    type: EntityType;
    path: string;
    sans_acces_application: boolean;
    nbEnfants: number;
  };
  parentsValides: OptionEntite[];
}) {
  const router = useRouter();
  const { peut } = useSession();
  const [rattachementOuvert, setRattachementOuvert] = useState(false);
  const [nouveauParent, setNouveauParent] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const peutModifier = peut('entity.update', entite.path);
  if (!peutModifier) return null;

  const typeParent = typeParentDe(entite.type);

  function executer(action: () => Promise<{ ok: boolean; error?: string }>, succes: string) {
    demarrer(async () => {
      const resultat = await action();
      if (!resultat.ok) {
        toast.error(resultat.error ?? "L'operation a echoue.");
        return;
      }
      toast.success(succes);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="h-10" aria-label="Actions sur cette entite">
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem asChild>
            <Link href={`/structure/${entite.id}/modifier`}>
              <Pencil className="mr-2 size-4" aria-hidden />
              Modifier
            </Link>
          </DropdownMenuItem>

          {/* Le Siege est racine : il n'a pas de parent a changer (RG-03). */}
          {typeParent && (
            <DropdownMenuItem onSelect={() => setRattachementOuvert(true)}>
              <Move className="mr-2 size-4" aria-hidden />
              Rattacher a un autre {ENTITY_LABELS[typeParent].singulier.toLowerCase()}
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onSelect={() =>
              executer(
                () => basculerAccesApplication({ id: entite.id }),
                entite.sans_acces_application
                  ? "Acces a l'application retabli."
                  : 'Entite marquee sans acces : le Siege pourra saisir pour son compte.',
              )
            }
          >
            <WifiOff className="mr-2 size-4" aria-hidden />
            {entite.sans_acces_application
              ? "Retablir l'acces a l'application"
              : "Marquer sans acces a l'application"}
          </DropdownMenuItem>

          {entite.type !== 'SIEGE' && (
            <>
              <DropdownMenuSeparator />
              <ConfirmDialog
                trigger={
                  <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 size-4" aria-hidden />
                    Supprimer
                  </DropdownMenuItem>
                }
                // ENF-UTI-04 : la confirmation NOMME l'objet concerne.
                title={`Supprimer « ${entite.nom} » ?`}
                description={
                  entite.nbEnfants > 0
                    ? `Cette entite contient ${entite.nbEnfants} sous-entite(s). ` +
                      'La suppression sera refusee : deplacez-les ou desactivez cette entite.'
                    : "L'entite sera placee en corbeille et pourra etre restauree."
                }
                confirmLabel="Supprimer"
                onConfirm={async () => {
                  const resultat = await supprimerEntite({ id: entite.id });
                  if (!resultat.ok) {
                    toast.error(resultat.error);
                    return;
                  }
                  toast.success('Entite placee en corbeille.');
                  router.push('/structure');
                  router.refresh();
                }}
              />
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* --- Rattachement (EF-STR-07) --- */}
      <Dialog open={rattachementOuvert} onOpenChange={setRattachementOuvert}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rattacher « {entite.nom} »</DialogTitle>
            <DialogDescription>
              L&apos;ensemble du sous-arbre suivra. L&apos;operation est journalisee et
              reversible en rattachant de nouveau.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <EntityPicker
              options={parentsValides}
              value={nouveauParent}
              onChange={setNouveauParent}
              placeholder={
                typeParent
                  ? `Choisir un ${ENTITY_LABELS[typeParent].singulier.toLowerCase()}`
                  : 'Choisir une entite'
              }
              emptyMessage="Aucune destination valide dans votre perimetre."
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="h-10"
              onClick={() => setRattachementOuvert(false)}
              disabled={enCours}
            >
              Annuler
            </Button>
            <Button
              className="h-10"
              disabled={!nouveauParent || enCours}
              onClick={() =>
                demarrer(async () => {
                  const resultat = await rattacherEntite({
                    id: entite.id,
                    nouveauParentId: nouveauParent,
                  });
                  if (!resultat.ok) {
                    toast.error(resultat.error);
                    return;
                  }
                  toast.success('Entite rattachee. Le sous-arbre a suivi.');
                  setRattachementOuvert(false);
                  setNouveauParent(null);
                  router.refresh();
                })
              }
            >
              {enCours && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              Rattacher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
