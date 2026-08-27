'use client';

import { useState, useTransition } from 'react';
import { Trash2, UserPlus, Search } from 'lucide-react';
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
import type { CroyantCandidatVisite, EntiteOptionVisite } from '@/lib/data/visites-pastorales';
import { planifierVisitePastorale, modifierVisitePastorale } from '@/lib/actions/visites-pastorales';

interface VisiteFormProps {
  readonly visiteEnEdition: VisitePastorale | null;
  readonly dateInitiale?: string;
  readonly entites: readonly EntiteOptionVisite[];
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

  // Sélecteur de candidat
  const [searchCroyant, setSearchCroyant] = useState<string>('');
  const [showPicker, setShowPicker] = useState<boolean>(false);

  const handleAddDelegue = (candidat: CroyantCandidatVisite) => {
    if (delegues.some((d) => d.croyant_id === candidat.id)) {
      avertir('Ce serviteur fait déjà partie de la délégation');
      return;
    }

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
    setShowPicker(false);
    setSearchCroyant('');
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

  const candidatsFiltres = croyantsCandidats
    .filter((c) => {
      if (delegues.some((d) => d.croyant_id === c.id)) return false;
      if (!searchCroyant) return true;
      const q = searchCroyant.toLowerCase();
      return (
        c.nom_complet.toLowerCase().includes(q) ||
        c.matricule.toLowerCase().includes(q) ||
        c.grade.toLowerCase().includes(q)
      );
    })
    .slice(0, 8);

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      {/* Entité Initiatrice & Destination */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">
            Entité Initiatrice (Organisatrice) <span className="text-rose-500">*</span>
          </Label>
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={entiteInitiatriceId}
            onChange={(e) => setEntiteInitiatriceId(e.target.value)}
            disabled={Boolean(visiteEnEdition)}
          >
            {entites.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom} ({e.type})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">
            Église / Entité Destinataire (Visité) <span className="text-rose-500">*</span>
          </Label>
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={entiteCibleId}
            onChange={(e) => setEntiteCibleId(e.target.value)}
          >
            {entites.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom} ({e.type})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Date, Heure & Type de Culte (Saisie libre demandée) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">
            Date de la visite <span className="text-rose-500">*</span>
          </Label>
          <Input
            type="date"
            value={dateVisite}
            onChange={(e) => setDateVisite(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Heure</Label>
          <Input
            type="time"
            value={heureVisite}
            onChange={(e) => setHeureVisite(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">
            Type de culte (Saisie libre) <span className="text-rose-500">*</span>
          </Label>
          <Input
            type="text"
            placeholder="Ex: Culte dominical, Sainte-Cène, Réveil..."
            value={typeCulte}
            onChange={(e) => setTypeCulte(e.target.value)}
            required
          />
        </div>
      </div>

      {/* Délégation pastorale : Membres gradés avec Rôle en Saisie libre */}
      <div className="space-y-2 pt-2 border-t">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold uppercase tracking-wider text-foreground">
            Délégation Pastorale (Gradés désignés) <span className="text-rose-500">*</span>
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setShowPicker(!showPicker)}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Ajouter un missionnaire
          </Button>
        </div>

        {/* Popup / Tiroir de sélection d'un membre candidat */}
        {showPicker && (
          <div className="p-3 border rounded-lg bg-muted/40 space-y-2 animate-in fade-in-50">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom, matricule ou grade..."
                value={searchCroyant}
                onChange={(e) => setSearchCroyant(e.target.value)}
                className="pl-8 h-8 text-xs bg-background"
                autoFocus
              />
            </div>

            <div className="max-h-40 overflow-y-auto space-y-1">
              {candidatsFiltres.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-2">
                  Aucun croyant trouvé
                </div>
              ) : (
                candidatsFiltres.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleAddDelegue(c)}
                    className="flex items-center justify-between p-1.5 rounded-md bg-background hover:bg-muted cursor-pointer transition-colors border text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={c.photo_url || undefined} />
                        <AvatarFallback className="text-[10px]">
                          {c.nom_complet.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-semibold">{c.nom_complet}</span>
                      <span className="text-muted-foreground text-[11px]">
                        • {c.grade} ({c.matricule})
                      </span>
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">
                      Choisir
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Liste des délégués choisis */}
        <div className="space-y-2">
          {delegues.length === 0 ? (
            <div className="p-4 border border-dashed rounded-md text-center text-xs text-muted-foreground bg-muted/20">
              Aucun membre désigné. Cliquez sur « Ajouter un missionnaire » ci-dessus.
            </div>
          ) : (
            delegues.map((d) => (
              <div
                key={d.croyant_id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 border rounded-lg bg-card shadow-sm"
              >
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <Avatar className="w-8 h-8 border">
                    <AvatarImage src={d.photo_url || undefined} />
                    <AvatarFallback className="text-xs font-bold">
                      {(d.nom_complet || 'M').charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate text-foreground">
                      {d.nom_complet}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      <span className="bg-muted px-1.5 py-0.5 rounded font-medium">
                        {d.grade}
                      </span>{' '}
                      {d.matricule && `• ${d.matricule}`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    placeholder="Rôle (saisie libre)..."
                    value={d.role_mission}
                    onChange={(e) => handleRoleChange(d.croyant_id, e.target.value)}
                    className="h-8 text-xs w-48 bg-background"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                    onClick={() => handleRemoveDelegue(d.croyant_id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Thème & Instructions */}
      <div className="space-y-1.5 pt-2 border-t">
        <Label className="text-xs font-semibold">Thème du message / Objet de la mission</Label>
        <Input
          type="text"
          placeholder="Ex: « Fortifiez-vous dans le Seigneur » — Affermissement et réveil pastoral"
          value={themeMessage}
          onChange={(e) => setThemeMessage(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Instructions / Recommandations</Label>
        <Textarea
          rows={2}
          placeholder="Ex: Administration de la Sainte-Cène, tenue des registres, salutations fraternelles..."
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className="text-xs"
        />
      </div>

      <DialogFooter className="pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isPending}
        >
          Annuler
        </Button>
        <Button type="submit" disabled={isPending}>
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
  readonly entites: readonly EntiteOptionVisite[];
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight">
            {visiteEnEdition ? 'Modifier la Visite Pastorale' : 'Planifier une Visite Pastorale'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Désignation de la délégation, date de culte et émission de l’ordre de mission.
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
