'use client';

import { useRef, useState, useTransition } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Locate,
  Plus,
  Pencil,
  FileText,
  CheckCircle,
  Clock,
  ArrowLeftRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { avertir } from '@/components/shared/messages';
import type { VisitePastorale } from '@/lib/domain/visites-pastorales';
import { peutDeplacerVisite } from '@/lib/domain/visites-pastorales';
import { reprogrammerVisitePastorale } from '@/lib/actions/visites-pastorales';

export interface CalendrierHorizontalProps {
  readonly moisActif: string; // 'YYYY-MM'
  readonly onChangerMois: (mois: string) => void;
  readonly visites: readonly VisitePastorale[];
  readonly onNouvelleVisiteDate: (date: string) => void;
  readonly onEditerVisite: (visite: VisitePastorale) => void;
  readonly onImprimerVisite: (visite: VisitePastorale) => void;
}

export function CalendrierHorizontal({
  moisActif,
  onChangerMois,
  visites,
  onNouvelleVisiteDate,
  onEditerVisite,
  onImprimerVisite,
}: CalendrierHorizontalProps) {
  const [_isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const [anneeStr, moisStr] = moisActif.split('-');
  const annee = parseInt(anneeStr, 10);
  const moisIndex = parseInt(moisStr, 10) - 1; // 0-indexed

  // Calcul du nombre de jours dans le mois
  const dateDebut = new Date(annee, moisIndex, 1);
  const nombreJours = new Date(annee, moisIndex + 1, 0).getDate();

  const jours = Array.from({ length: nombreJours }, (_, i) => {
    const numJour = i + 1;
    const dateObj = new Date(annee, moisIndex, numJour);
    const dateIso = `${anneeStr}-${String(moisIndex + 1).padStart(2, '0')}-${String(numJour).padStart(2, '0')}`;
    const jourSemaineIndex = dateObj.getDay(); // 0 = Dimanche, 6 = Samedi
    const nomJour = dateObj.toLocaleDateString('fr-FR', { weekday: 'long' });

    const aujourdhui = new Date().toISOString().split('T')[0];
    const estAujourdhui = dateIso === aujourdhui;
    const estPasse = dateIso < aujourdhui;
    const estDimanche = jourSemaineIndex === 0;

    const visitesDuJour = visites.filter((v) => v.date_visite === dateIso);

    return {
      numJour,
      dateIso,
      nomJour: nomJour.charAt(0).toUpperCase() + nomJour.slice(1),
      estAujourdhui,
      estPasse,
      estDimanche,
      visites: visitesDuJour,
    };
  });

  const scrollHorizontal = (offset: number) => {
    containerRef.current?.scrollBy({ left: offset, behavior: 'smooth' });
  };

  const scrollToAujourdhui = () => {
    const aujourdhuiElem = containerRef.current?.querySelector('[data-today="true"]');
    if (aujourdhuiElem) {
      aujourdhuiElem.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  };

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, visite: VisitePastorale) => {
    if (!peutDeplacerVisite(visite.statut)) {
      e.preventDefault();
      return;
    }
    setDraggedId(visite.id);
    e.dataTransfer.setData('text/plain', visite.id);
  };

  const handleDragOver = (e: React.DragEvent, dateIso: string) => {
    e.preventDefault();
    setDragOverDate(dateIso);
  };

  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  const handleDrop = (e: React.DragEvent, dateCible: string) => {
    e.preventDefault();
    setDragOverDate(null);

    if (!draggedId) return;

    const visite = visites.find((v) => v.id === draggedId);
    if (!visite) return;

    if (visite.date_visite === dateCible) return;

    if (!peutDeplacerVisite(visite.statut)) {
      avertir('Impossible de déplacer une visite déjà effectuée ou annulée');
      return;
    }

    startTransition(async () => {
      const res = await reprogrammerVisitePastorale({
        id: visite.id,
        date_visite: dateCible,
      });

      if (res.ok) {
        const dateFormatee = new Date(dateCible).toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        toast.success(`Visite reprogrammée au ${dateFormatee}`);
      } else {
        avertir(res.error || 'Échec du déplacement');
      }
    });

    setDraggedId(null);
  };

  const nomMoisTexte = dateDebut.toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden mb-6">
      {/* En-tête du calendrier */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-foreground" />
          <h2 className="text-base font-bold capitalize">{nomMoisTexte}</h2>
        </div>

        {/* Contrôles de navigation rapide */}
        <div className="flex items-center gap-2 flex-wrap">
          <label htmlFor="mois-select" className="text-xs font-medium text-muted-foreground">
            Changer de mois :
          </label>
          <input
            id="mois-select"
            type="month"
            value={moisActif}
            onChange={(e) => onChangerMois(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />

          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={scrollToAujourdhui}
          >
            <Locate className="w-3.5 h-3.5" />
            Aujourd’hui
          </Button>

          <div className="inline-flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => scrollHorizontal(-350)}
              title="Défiler vers la gauche"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => scrollHorizontal(350)}
              title="Défiler vers la droite"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Frise chronologique horizontale défilable */}
      <div
        ref={containerRef}
        className="flex overflow-x-auto overflow-y-hidden scroll-smooth p-4 gap-3 bg-muted/10 min-h-[480px]"
      >
        {jours.map((j) => {
          const isOver = dragOverDate === j.dateIso;

          return (
            <div
              key={j.dateIso}
              data-today={j.estAujourdhui}
              onDragOver={(e) => handleDragOver(e, j.dateIso)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, j.dateIso)}
              className={`flex-none w-[260px] min-w-[260px] rounded-lg border bg-card shadow-sm flex flex-col transition-all duration-150 ${
                j.estAujourdhui ? 'ring-2 ring-foreground/80' : ''
              } ${isOver ? 'ring-2 ring-primary border-primary bg-primary/5 scale-[1.01]' : ''}`}
            >
              {/* En-tête du jour avec bouton discret '+' */}
              <div className="flex items-center justify-between p-2.5 border-b bg-card rounded-t-lg">
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {j.nomJour}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-base font-extrabold text-foreground">{j.numJour}</span>
                    {j.estAujourdhui && (
                      <span className="bg-foreground text-background text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">
                        Aujourd’hui
                      </span>
                    )}
                    {j.estDimanche && (
                      <span className="bg-muted text-foreground border text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">
                        Culte
                      </span>
                    )}
                  </div>
                </div>

                {/* Bouton discret '+' pour créer une visite pour ce jour */}
                <button
                  type="button"
                  onClick={() => onNouvelleVisiteDate(j.dateIso)}
                  className="w-7 h-7 rounded-md border bg-background hover:bg-foreground hover:text-background text-muted-foreground flex items-center justify-center transition-colors"
                  title={`Planifier une visite le ${j.numJour} ${nomMoisTexte}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Corps de la colonne de jour : Cartes de visites pastorales */}
              <div className="flex-1 p-2.5 flex flex-col gap-2.5">
                {j.visites.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center border border-dashed rounded-md p-4 text-center text-xs text-muted-foreground/60">
                    Aucune visite
                  </div>
                ) : (
                  j.visites.map((v) => {
                    const peutGlisser = peutDeplacerVisite(v.statut);
                    const estEnCoursDeGlissement = draggedId === v.id;

                    const bordureStatut =
                      v.statut === 'CONFIRME'
                        ? 'border-l-emerald-500'
                        : v.statut === 'PLANIFIE'
                          ? 'border-l-amber-500'
                          : 'border-l-slate-400 bg-muted/30';

                    return (
                      <div
                        key={v.id}
                        draggable={peutGlisser}
                        onDragStart={(e) => handleDragStart(e, v)}
                        className={`group relative flex flex-col gap-2 p-2.5 rounded-md border border-l-4 bg-card shadow-sm hover:shadow-md transition-all ${bordureStatut} ${
                          peutGlisser ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                        } ${estEnCoursDeGlissement ? 'opacity-30 scale-95' : ''}`}
                      >
                        {/* Barre supérieure : heure, statut et bouton crayon discret */}
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-muted-foreground text-[11px]">
                            {v.heure_visite || '09:00'}
                          </span>

                          <div className="flex items-center gap-1.5">
                            {v.statut === 'CONFIRME' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                <CheckCircle className="w-3 h-3" /> Confirmé
                              </span>
                            )}
                            {v.statut === 'PLANIFIE' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                                <Clock className="w-3 h-3" /> Planifié
                              </span>
                            )}
                            {v.statut === 'EFFECTUE' && (
                              <span className="text-[10px] font-medium text-slate-500">
                                Passé
                              </span>
                            )}

                            {/* Bouton Crayon (Pencil) discret uniquement pour Planifié et Confirmé */}
                            {peutGlisser && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditerVisite(v);
                                }}
                                className="w-5 h-5 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                                title="Modifier cette visite pastorale"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Église de destination */}
                        <div className="text-xs font-bold leading-snug text-foreground">
                          {v.entite_cible_nom}
                        </div>

                        {/* Type de culte / Thème */}
                        <div className="text-[11px] text-muted-foreground italic border-l-2 pl-1.5 line-clamp-2">
                          {v.type_culte}
                          {v.theme_message && ` • « ${v.theme_message} »`}
                        </div>

                        {/* Délégation : Portraits miniatures & nom du prédicateur */}
                        <div className="flex items-center justify-between pt-1.5 border-t border-dashed text-[11px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="flex items-center -space-x-2">
                              {v.delegues.slice(0, 3).map((d) => (
                                <Avatar key={d.croyant_id} className="w-5 h-5 border-2 border-background">
                                  <AvatarImage src={d.photo_url || undefined} />
                                  <AvatarFallback className="text-[9px]">
                                    {(d.nom_complet || 'M').charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                              ))}
                            </div>
                            <span className="font-medium truncate text-foreground text-[11px]">
                              {v.delegues[0]?.nom_complet || 'Délégation'}
                              {v.delegues.length > 1 && ` +${v.delegues.length - 1}`}
                            </span>
                          </div>

                          {/* Bouton ordre de mission A4 */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onImprimerVisite(v);
                            }}
                            className="text-muted-foreground hover:text-foreground p-1"
                            title="Imprimer l’Ordre de Mission A4"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Barre d'aide au défilement en bas */}
      <div className="flex items-center justify-between p-3 border-t bg-muted/20 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <ArrowLeftRight className="w-3.5 h-3.5 text-foreground" />
          <span>Faites défiler horizontalement pour parcourir les 31 jours du mois.</span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => scrollHorizontal(-400)}>
            <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Jours passés
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => scrollHorizontal(400)}>
            Jours à venir <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
