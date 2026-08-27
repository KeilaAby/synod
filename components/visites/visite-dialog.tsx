'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { avertir } from '@/components/shared/messages';
import type { VisitePastorale, VisiteDelegue } from '@/lib/domain/visites-pastorales';
import type { CroyantCandidatVisite } from '@/lib/data/visites-pastorales';
import { EntityPicker, type OptionEntite } from '@/components/structure/entity-picker';
import { CroyantPicker } from '@/components/croyants/croyant-picker';
import { planifierVisitePastorale, modifierVisitePastorale } from '@/lib/actions/visites-pastorales';

interface VisiteFormProps {
  readonly visiteEnEdition: VisitePastorale | null;
  readonly dateInitiale?: string;
  readonly entites: readonly OptionEntite[];
  readonly croyantsCandidats: readonly CroyantCandidatVisite[];
  readonly currentEntityId: string;
  readonly onClose: () => void;
}

function VisiteForm({
  visiteEnEdition,
  dateInitiale,
  entites,
  croyantsCandidats,
  currentEntityId,
  onClose,
}: VisiteFormProps) {
  const [isPending, startTransition] = useTransition();

  const [entiteInitiatriceId, setEntiteInitiatriceId] = useState<string>(() => {
    return (
      visiteEnEdition?.entite_initiatrice_id ?? (currentEntityId || entites[0]?.id || '')
    );
  });
  const [entiteCibleId, setEntiteCibleId] = useState<string>(() => {
    return (
      visiteEnEdition?.entite_cible_id ??
      (entites.find((e) => e.id !== currentEntityId)?.id || entites[1]?.id || '')
    );
  });
  const [dateVisite, setDateVisite] = useState<string>(() => {
    return (
      visiteEnEdition?.date_visite ?? (dateInitiale || new Date().toISOString().split('T')[0])
    );
  });
  const [heureVisite, setHeureVisite] = useState<string>(() => {
    return visiteEnEdition?.heure_visite || '09:00';
  });
  const [typeCulte, setTypeCulte] = useState<string>(() => {
    return visiteEnEdition?.type_culte || 'Culte dominical du matin';
  });
  const [themeMessage, setThemeMessage] = useState<string>(() => {
    return visiteEnEdition?.theme_message || '';
  });
  const [instructions, setInstructions] = useState<string>(() => {
    return visiteEnEdition?.instructions || '';
  });
  const [delegues, setDelegues] = useState<VisiteDelegue[]>(() => {
    if (visiteEnEdition) {
      return [...visiteEnEdition.delegues];
    }
    if (croyantsCandidats.length > 0) {
      const premier = croyantsCandidats[0];
      return [
        {
          croyant_id: premier.id,
          nom_complet: premier.nom_complet,
          matricule: premier.matricule,
          grade: premier.grade,
          role_mission: 'Prédicateur Principal',
          photo_url: premier.photo_url,
          ordre: 1,
        },
      ];
    }
    return [];
  });

  const [croyantSelectionneId, setCroyantSelectionneId] = useState<string>('');

  const handleAjouterMissionnaire = (croyantId: string) => {
    if (!croyantId) return;

    if (delegues.some((d) => d.croyant_id === croyantId)) {
      avertir('Ce serviteur fait déjà partie de la délégation');
      setCroyantSelectionneId('');
      return;
    }

    const candidat = croyantsCandidats.find((c) => c.id === croyantId);
    if (!candidat) return;

    const nouveauDelegue: VisiteDelegue = {
      croyant_id: candidat.id,
      nom_complet: candidat.nom_complet,
      matricule: candidat.matricule,
      grade: candidat.grade,
      role_mission: delegues.length === 0 ? 'Prédicateur Principal' : 'Accompagnateur',
      photo_url: candidat.photo_url,
      ordre: delegues.length + 1,
    };

    setDelegues([...delegues, nouveauDelegue]);
    setCroyantSelectionneId('');
    toast.success(`${candidat.nom_complet} ajouté à la délégation`);
  };

  const handleRemoveDelegue = (croyantId: string) => {
    setDelegues(delegues.filter((d) => d.croyant_id !== croyantId));
  };

  const handleRoleChange = (croyantId: string, role: string) => {
    setDelegues(
      delegues.map((d) => (d.croyant_id === croyantId ? { ...d, role_mission: role } : d)),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!entiteInitiatriceId) {
      avertir('Veuillez sélectionner l’entité organisatrice');
      return;
    }
    if (!entiteCibleId) {
      avertir('Veuillez sélectionner l’église destinataire');
      return;
    }
    if (!dateVisite) {
      avertir('Veuillez renseigner la date de la visite');
      return;
    }
    if (!typeCulte.trim()) {
      avertir('Le type de culte ou célébration est requis');
      return;
    }
    if (delegues.length === 0) {
      avertir('Veuillez désigner au moins un membre dans la délégation pastorale');
      return;
    }

    startTransition(async () => {
      if (visiteEnEdition) {
        const res = await modifierVisitePastorale({
          id: visiteEnEdition.id,
          entite_initiatrice_id: entiteInitiatriceId,
          entite_cible_id: entiteCibleId,
          date_visite: dateVisite,
          heure_visite: heureVisite,
          type_culte: typeCulte.trim(),
          theme_message: themeMessage.trim() || undefined,
          instructions: instructions.trim() || undefined,
          delegues: delegues.map((d, index) => ({
            croyant_id: d.croyant_id,
            role_mission: d.role_mission.trim(),
            ordre: index + 1,
          })),
        });

        if (res.ok) {
          toast.success('Visite pastorale modifiée avec succès');
          onClose();
        } else {
          avertir(res.error || 'Erreur lors de la modification');
        }
      } else {
        const res = await planifierVisitePastorale({
          entite_initiatrice_id: entiteInitiatriceId,
          entite_cible_id: entiteCibleId,
          date_visite: dateVisite,
          heure_visite: heureVisite,
          type_culte: typeCulte.trim(),
          theme_message: themeMessage.trim() || undefined,
          instructions: instructions.trim() || undefined,
          delegues: delegues.map((d, index) => ({
            croyant_id: d.croyant_id,
            role_mission: d.role_mission.trim(),
            ordre: index + 1,
          })),
        });

        if (res.ok) {
          toast.success('Visite pastorale planifiée avec succès');
          onClose();
        } else {
          avertir(res.error || 'Erreur lors de la planification');
        }
      }
    });
  };

  // Filtrer les croyants disponibles qui ne sont pas encore dans la délégation
  const croyantsDisponibles = croyantsCandidats.filter(
    (c) => !delegues.some((d) => d.croyant_id === c.id),
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pt-2">
      {/* 1. Entité Initiatrice & Destination (avec EntityPicker hiérarchique) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-foreground">
            Entité Initiatrice (Organisatrice) <span className="text-rose-500">*</span>
          </Label>
          <EntityPicker
            options={[...entites]}
            value={entiteInitiatriceId}
            onChange={(val) => setEntiteInitiatriceId(val || '')}
            disabled={Boolean(visiteEnEdition)}
            placeholder="Sélectionner l’entité organisatrice..."
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-foreground">
            Église / Entité Destinataire (Visité) <span className="text-rose-500">*</span>
          </Label>
          <EntityPicker
            options={[...entites]}
            value={entiteCibleId}
            onChange={(val) => setEntiteCibleId(val || '')}
            placeholder="Sélectionner l’église accueillante..."
          />
        </div>
      </div>

      {/* 2. Date, Heure & Type de Culte (Saisie libre demandée) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-foreground">
            Date de la visite <span className="text-rose-500">*</span>
          </Label>
          <Input
            type="date"
            value={dateVisite}
            onChange={(e) => setDateVisite(e.target.value)}
            className="h-9 bg-background"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-foreground">Heure</Label>
          <Input
            type="time"
            value={heureVisite}
            onChange={(e) => setHeureVisite(e.target.value)}
            className="h-9 bg-background"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-foreground">
            Type de culte (Saisie libre) <span className="text-rose-500">*</span>
          </Label>
          <Input
            type="text"
            placeholder="Ex: Culte dominical, Sainte-Cène, Réveil..."
            value={typeCulte}
            onChange={(e) => setTypeCulte(e.target.value)}
            className="h-9 bg-background"
            required
          />
        </div>
      </div>

      {/* 3. Délégation pastorale : Sélecteur officiel CroyantPicker + Rôle en Saisie libre */}
      <div className="space-y-3 pt-3 border-t">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <Label className="text-xs font-extrabold uppercase tracking-wider text-foreground">
              Délégation Pastorale (Gradés désignés) <span className="text-rose-500">*</span>
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Choisissez les serviteurs à mandater et attribuez leur rôle au culte.
            </p>
          </div>
        </div>

        {/* CroyantPicker officiel avec recherche et portraits */}
        <div className="p-3.5 rounded-xl border bg-muted/20 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">
              Ajouter un membre à la délégation :
            </Label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <CroyantPicker
                  options={croyantsDisponibles}
                  value={croyantSelectionneId}
                  onChange={(val) => {
                    if (val) handleAjouterMissionnaire(val);
                  }}
                  placeholder="Rechercher un croyant par nom, matricule ou grade..."
                />
              </div>
            </div>
          </div>

          {/* Liste des délégués désignés */}
          <div className="space-y-2 pt-1">
            {delegues.length === 0 ? (
              <div className="p-4 border border-dashed rounded-lg text-center text-xs text-muted-foreground bg-background">
                Aucun serviteur désigné pour le moment. Utilisez la liste déroulante ci-dessus.
              </div>
            ) : (
              delegues.map((d, index) => (
                <div
                  key={d.croyant_id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border rounded-lg bg-card shadow-sm hover:border-foreground/30 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                      {index + 1}
                    </span>
                    <Avatar className="w-9 h-9 border">
                      <AvatarImage src={d.photo_url || undefined} />
                      <AvatarFallback className="text-xs font-bold">
                        {(d.nom_complet || 'M').charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate text-foreground">
                        {d.nom_complet}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <span className="bg-muted px-1.5 py-0.5 rounded font-medium text-foreground">
                          {d.grade}
                        </span>
                        {d.matricule && <span>• {d.matricule}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      placeholder="Rôle dans la mission (saisie libre)..."
                      value={d.role_mission}
                      onChange={(e) => handleRoleChange(d.croyant_id, e.target.value)}
                      className="h-8 text-xs w-56 bg-background font-medium"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                      onClick={() => handleRemoveDelegue(d.croyant_id)}
                      title="Retirer de la délégation"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 4. Thème & Instructions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-foreground">
            Thème du message / Objet de la mission
          </Label>
          <Input
            type="text"
            placeholder="Ex: « Fortifiez-vous dans le Seigneur » — Affermissement"
            value={themeMessage}
            onChange={(e) => setThemeMessage(e.target.value)}
            className="h-9 bg-background text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-foreground">
            Instructions / Recommandations
          </Label>
          <Textarea
            rows={2}
            placeholder="Ex: Administration de la Sainte-Cène, tenue des registres..."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            className="text-xs bg-background resize-none"
          />
        </div>
      </div>

      <DialogFooter className="pt-3 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isPending}
        >
          Annuler
        </Button>
        <Button type="submit" disabled={isPending} className="gap-1.5">
          {isPending
            ? 'Enregistrement...'
            : visiteEnEdition
              ? 'Mettre à jour la visite'
              : 'Confirmer la Planification'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export interface VisiteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly visiteEnEdition: VisitePastorale | null;
  readonly dateInitiale?: string;
  readonly entites: readonly OptionEntite[];
  readonly croyantsCandidats: readonly CroyantCandidatVisite[];
  readonly currentEntityId: string;
}

export function VisiteDialog({
  open,
  onOpenChange,
  visiteEnEdition,
  dateInitiale,
  entites,
  croyantsCandidats,
  currentEntityId,
}: VisiteDialogProps) {
  const formKey = visiteEnEdition?.id ?? dateInitiale ?? 'nouvelle-visite';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(96vw,56rem)] overflow-y-auto sm:max-w-none">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold tracking-tight">
            {visiteEnEdition ? 'Modifier la Visite Pastorale' : 'Planifier une Visite Pastorale'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Désignation de la délégation pastorale, culte de rattachement et délivrance de l’ordre de mission.
          </DialogDescription>
        </DialogHeader>

        {open && (
          <VisiteForm
            key={formKey}
            visiteEnEdition={visiteEnEdition}
            dateInitiale={dateInitiale}
            entites={entites}
            croyantsCandidats={croyantsCandidats}
            currentEntityId={currentEntityId}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
