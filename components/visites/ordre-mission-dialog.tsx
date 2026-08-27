'use client';

import { useTransition } from 'react';
import { Printer, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDateLongue } from '@/lib/utils/format';
import type { VisitePastorale } from '@/lib/domain/visites-pastorales';
import { imprimerOrdreMission } from './imprimer-ordre-mission';
import { validerVisitePastorale, annulerVisitePastorale } from '@/lib/actions/visites-pastorales';
import { PermissionGate } from '@/components/shared/permission-gate';
import { toast } from 'sonner';
import { avertir } from '@/components/shared/messages';

export interface OrdreMissionDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly visite: VisitePastorale | null;
  readonly organisationNom?: string;
}

export function OrdreMissionDialog({
  open,
  onOpenChange,
  visite,
  organisationNom,
}: OrdreMissionDialogProps) {
  const [isPending, startTransition] = useTransition();

  if (!visite) return null;

  const handlePrint = () => {
    imprimerOrdreMission({
      visite,
      organisation: organisationNom,
    });
  };

  const handleValider = () => {
    startTransition(async () => {
      const res = await validerVisitePastorale(visite.id);
      if (res.ok) {
        toast.success('Visite pastorale confirmée et validée avec succès');
        onOpenChange(false);
      } else {
        avertir(res.error || 'Erreur lors de la validation');
      }
    });
  };

  const handleAnnuler = () => {
    if (!confirm('Êtes-vous sûr de vouloir annuler cette visite pastorale ?')) return;

    startTransition(async () => {
      const res = await annulerVisitePastorale(visite.id);
      if (res.ok) {
        toast.success('Visite pastorale annulée');
        onOpenChange(false);
      } else {
        avertir(res.error || 'Erreur lors de l’annulation');
      }
    });
  };

  const estPlanifie = visite.statut === 'PLANIFIE';
  const estConfirme = visite.statut === 'CONFIRME';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(96vw,52rem)] overflow-y-auto sm:max-w-none">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <div>
              <DialogTitle className="text-lg font-bold">
                Document Officiel — Ordre de Mission Pastorale
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Attestation solennelle et lettre de mission à remettre à l’église accueillante.
              </DialogDescription>
            </div>

            {estPlanifie && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full shrink-0">
                Planifiée (En attente de validation)
              </span>
            )}
            {estConfirme && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full shrink-0">
                <CheckCircle className="w-3.5 h-3.5" /> Validée & Confirmée
              </span>
            )}
          </div>
        </DialogHeader>

        {/* Aperçu du document A4 */}
        <div className="p-6 border-2 border-foreground/90 rounded-md bg-card text-foreground font-serif space-y-5 my-2 shadow-sm">
          {/* En-tête officiel */}
          <div className="text-center border-b-2 border-double border-foreground/90 pb-3">
            <div className="text-base font-extrabold uppercase tracking-wider">
              {organisationNom || 'ÉGLISE DU PLEIN ÉVANGILE'}
            </div>
            <div className="text-xs italic text-muted-foreground mt-0.5">
              {visite.entite_initiatrice_nom} • MINISTÈRE PASTORAL & MISSIONS
            </div>
            <div className="text-base font-black uppercase tracking-widest mt-2 underline">
              ORDRE DE MISSION PASTORALE
            </div>
            <div className="text-[11px] font-mono text-muted-foreground mt-1 font-bold">
              RÉF : {visite.reference_ordre_mission || 'OM-SYNOD'}
            </div>
          </div>

          {/* Corps de mission */}
          <div className="text-xs leading-relaxed space-y-3">
            <p className="text-justify">
              Il est attesté par la présente que les serviteurs et gradés désignés ci-après sont officiellement
              mandatés par <strong>{visite.entite_initiatrice_nom}</strong> pour effectuer une{' '}
              <strong>Visite Pastorale Officielle</strong> :
            </p>

            <div className="p-3 bg-muted/40 border border-border border-l-4 border-l-foreground rounded text-xs space-y-1">
              <div>
                <strong>Église & Destination d’Accueil :</strong> {visite.entite_cible_nom}
              </div>
              <div>
                <strong>Date & Culte :</strong> {formatDateLongue(visite.date_visite)} à{' '}
                {visite.heure_visite || '09:00'} ({visite.type_culte})
              </div>
              {visite.theme_message && (
                <div>
                  <strong>Objet du mandat :</strong> « {visite.theme_message} »
                </div>
              )}
            </div>

            <div className="font-bold uppercase tracking-wider text-xs pt-1">
              Composition officielle de la délégation mandatée :
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {visite.delegues.map((d) => (
                <div
                  key={d.croyant_id}
                  className="flex items-center gap-3 p-2 border border-dashed rounded bg-muted/20"
                >
                  <Avatar className="w-10 h-10 border border-foreground/80">
                    <AvatarImage src={d.photo_url || undefined} />
                    <AvatarFallback className="text-xs font-bold">
                      {(d.nom_complet || 'M').charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-xs">
                    <div className="font-bold text-foreground">{d.nom_complet}</div>
                    <div className="text-muted-foreground text-[11px]">Grade : {d.grade}</div>
                    <div className="text-[11px]">
                      Rôle : <strong>{d.role_mission}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center italic text-[11px] text-muted-foreground py-2 border-y border-dashed mt-3">
              « Recevez-les donc dans le Seigneur avec une joie entière, et ayez de l&apos;estime pour de tels serviteurs. »
              <br />— Philippiens 2:29
            </div>

            {/* Blocs signatures */}
            <div className="flex justify-between pt-6 px-4">
              <div className="w-36 text-center">
                <div className="font-bold text-xs">Le Secrétariat</div>
                <div className="h-10"></div>
                <div className="border-t border-foreground text-[10px] italic pt-1 text-muted-foreground">
                  Sceau officiel
                </div>
              </div>

              <div className="w-36 text-center">
                <div className="font-bold text-xs">Le Responsable</div>
                <div className="h-10"></div>
                <div className="border-t border-foreground text-[10px] italic pt-1 text-muted-foreground">
                  Signature autorisée
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
          <div className="flex items-center gap-2">
            {(estPlanifie || estConfirme) && (
              <PermissionGate perm="visite.delete">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAnnuler}
                  disabled={isPending}
                  className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-xs gap-1"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Annuler la visite
                </Button>
              </PermissionGate>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="text-xs"
            >
              Fermer
            </Button>

            {estPlanifie && (
              <PermissionGate perm="visite.validate">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleValider}
                  disabled={isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 font-bold"
                >
                  {isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5" />
                  )}
                  Valider et délivrer l’Ordre de Mission
                </Button>
              </PermissionGate>
            )}

            <PermissionGate perm="visite.print">
              <Button
                type="button"
                size="sm"
                onClick={handlePrint}
                disabled={isPending}
                className="text-xs gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimer l’Ordre de Mission A4
              </Button>
            </PermissionGate>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
