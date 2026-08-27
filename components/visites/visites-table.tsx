'use client';

import { useTransition } from 'react';
import { FileText, Pencil, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDateLongue } from '@/lib/utils/format';
import type { VisitePastorale } from '@/lib/domain/visites-pastorales';
import { peutDeplacerVisite } from '@/lib/domain/visites-pastorales';
import { validerVisitePastorale } from '@/lib/actions/visites-pastorales';
import { PermissionGate } from '@/components/shared/permission-gate';
import { toast } from 'sonner';
import { avertir } from '@/components/shared/messages';

export interface VisitesTableProps {
  readonly visites: readonly VisitePastorale[];
  readonly onEditerVisite: (visite: VisitePastorale) => void;
  readonly onImprimerVisite: (visite: VisitePastorale) => void;
}

export function VisitesTable({
  visites,
  onEditerVisite,
  onImprimerVisite,
}: VisitesTableProps) {
  const [isPending, startTransition] = useTransition();

  const handleValiderRapide = (id: string) => {
    startTransition(async () => {
      const res = await validerVisitePastorale(id);
      if (res.ok) {
        toast.success('Visite pastorale confirmée');
      } else {
        avertir(res.error || 'Erreur lors de la validation');
      }
    });
  };

  if (visites.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground shadow-sm">
        Aucune visite pastorale ne correspond aux filtres sélectionnés.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden mb-6">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="p-3.5 pl-4">Date & Culte</th>
              <th className="p-3.5">Entité Initiatrice</th>
              <th className="p-3.5">Église Destination</th>
              <th className="p-3.5">Délégation (Gradés)</th>
              <th className="p-3.5">Statut</th>
              <th className="p-3.5 pr-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y text-xs">
            {visites.map((v) => {
              const peutModifier = peutDeplacerVisite(v.statut);
              const estPlanifie = v.statut === 'PLANIFIE';
              const premier = v.delegues[0];

              return (
                <tr key={v.id} className="hover:bg-muted/20 transition-colors">
                  {/* Date & Culte */}
                  <td className="p-3.5 pl-4">
                    <div className="font-bold text-foreground">{formatDateLongue(v.date_visite)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {v.heure_visite || '09:00'} — {v.type_culte}
                    </div>
                  </td>

                  {/* Entité Initiatrice */}
                  <td className="p-3.5">
                    <div className="font-semibold text-foreground">{v.entite_initiatrice_nom}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {v.reference_ordre_mission}
                    </div>
                  </td>

                  {/* Destination */}
                  <td className="p-3.5">
                    <div className="font-bold text-foreground">{v.entite_cible_nom}</div>
                    {v.theme_message && (
                      <div className="text-[11px] text-muted-foreground italic truncate max-w-xs">
                        « {v.theme_message} »
                      </div>
                    )}
                  </td>

                  {/* Délégation */}
                  <td className="p-3.5">
                    {premier ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="w-7 h-7 border">
                          <AvatarImage src={premier.photo_url || undefined} />
                          <AvatarFallback className="text-[10px] font-bold">
                            {(premier.nom_complet || 'M').charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-semibold text-foreground">
                            {premier.nom_complet}
                            {v.delegues.length > 1 && (
                              <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                                (+{v.delegues.length - 1})
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {premier.grade} • {premier.role_mission}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground italic">Aucun délégué</span>
                    )}
                  </td>

                  {/* Statut */}
                  <td className="p-3.5">
                    {v.statut === 'CONFIRME' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        <CheckCircle className="w-3 h-3" /> Confirmée
                      </span>
                    )}
                    {v.statut === 'PLANIFIE' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                        <Clock className="w-3 h-3" /> Planifiée
                      </span>
                    )}
                    {v.statut === 'EFFECTUE' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                        Effectuée
                      </span>
                    )}
                    {v.statut === 'ANNULE' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
                        Annulée
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="p-3.5 pr-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {estPlanifie && (
                        <PermissionGate perm="visite.validate">
                          <Button
                            variant="default"
                            size="sm"
                            disabled={isPending}
                            className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            onClick={() => handleValiderRapide(v.id)}
                            title="Valider et confirmer la visite"
                          >
                            {isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <CheckCircle className="w-3 h-3" />
                            )}
                            Valider
                          </Button>
                        </PermissionGate>
                      )}

                      {peutModifier && (
                        <PermissionGate perm="visite.update">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => onEditerVisite(v)}
                          >
                            <Pencil className="w-3 h-3" /> Modifier
                          </Button>
                        </PermissionGate>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => onImprimerVisite(v)}
                      >
                        <FileText className="w-3 h-3" /> Ordre de mission
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
