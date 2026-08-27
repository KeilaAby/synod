'use client';

import { useState, useMemo } from 'react';
import {
  Calendar,
  CheckCircle,
  Clock,
  Users,
  PlusCircle,
  Printer,
  Search,
  CalendarDays,
  List,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { VisitePastorale } from '@/lib/domain/visites-pastorales';
import type { CroyantCandidatVisite, EntiteOptionVisite } from '@/lib/data/visites-pastorales';
import { CalendrierHorizontal } from '@/components/visites/calendrier-horizontal';
import { VisitesTable } from '@/components/visites/visites-table';
import { VisiteDialog } from '@/components/visites/visite-dialog';
import { OrdreMissionDialog } from '@/components/visites/ordre-mission-dialog';

export interface VisitesClientProps {
  readonly initialVisites: readonly VisitePastorale[];
  readonly entites: readonly EntiteOptionVisite[];
  readonly croyantsCandidats: readonly CroyantCandidatVisite[];
  readonly currentEntityId: string;
  readonly organisationNom?: string;
}

export function VisitesClient({
  initialVisites,
  entites,
  croyantsCandidats,
  currentEntityId,
  organisationNom,
}: VisitesClientProps) {
  const [vue, setVue] = useState<'calendar' | 'list'>('calendar');
  const [moisActif, setMoisActif] = useState<string>(() => {
    const ajd = new Date();
    const a = ajd.getFullYear();
    const m = String(ajd.getMonth() + 1).padStart(2, '0');
    return `${a}-${m}`;
  });

  // Filtres
  const [filtreEntite, setFiltreEntite] = useState<string>('all');
  const [filtreStatut, setFiltreStatut] = useState<string>('all');
  const [recherchePersonne, setRecherchePersonne] = useState<string>('');

  // Dialogues
  const [openPlanDialog, setOpenPlanDialog] = useState<boolean>(false);
  const [visiteEnEdition, setVisiteEnEdition] = useState<VisitePastorale | null>(null);
  const [dateSelectionnee, setDateSelectionnee] = useState<string | undefined>(undefined);

  const [openPrintDialog, setOpenPrintDialog] = useState<boolean>(false);
  const [visiteAImprimer, setVisiteAImprimer] = useState<VisitePastorale | null>(null);

  // Filtrage des visites
  const visitesFiltrees = useMemo(() => {
    return initialVisites.filter((v) => {
      const matchEntite =
        filtreEntite === 'all' ||
        v.entite_initiatrice_id === filtreEntite ||
        v.entite_cible_id === filtreEntite;

      const matchStatut = filtreStatut === 'all' || v.statut === filtreStatut;

      const q = recherchePersonne.toLowerCase().trim();
      const matchPersonne =
        !q ||
        v.entite_cible_nom.toLowerCase().includes(q) ||
        v.entite_initiatrice_nom.toLowerCase().includes(q) ||
        (v.type_culte && v.type_culte.toLowerCase().includes(q)) ||
        (v.theme_message && v.theme_message.toLowerCase().includes(q)) ||
        v.delegues.some((d) => (d.nom_complet || '').toLowerCase().includes(q));

      return matchEntite && matchStatut && matchPersonne;
    });
  }, [initialVisites, filtreEntite, filtreStatut, recherchePersonne]);

  // Indicateurs clés (KPI)
  const stats = useMemo(() => {
    const totalCeMois = initialVisites.filter((v) => v.date_visite.startsWith(moisActif)).length;
    const totalConfirmes = initialVisites.filter((v) => v.statut === 'CONFIRME').length;
    const totalPlanifies = initialVisites.filter((v) => v.statut === 'PLANIFIE').length;

    // Nombre unique de croyants mobilisés dans les délégations
    const setGrades = new Set<string>();
    for (const v of initialVisites) {
      for (const d of v.delegues) {
        setGrades.add(d.croyant_id);
      }
    }

    return {
      totalCeMois,
      totalConfirmes,
      totalPlanifies,
      gradesMobilises: setGrades.size,
    };
  }, [initialVisites, moisActif]);

  const handleNouvelleVisite = (datePrevue?: string) => {
    setVisiteEnEdition(null);
    setDateSelectionnee(datePrevue);
    setOpenPlanDialog(true);
  };

  const handleEditerVisite = (visite: VisitePastorale) => {
    setVisiteEnEdition(visite);
    setDateSelectionnee(visite.date_visite);
    setOpenPlanDialog(true);
  };

  const handleImprimerVisite = (visite: VisitePastorale) => {
    setVisiteAImprimer(visite);
    setOpenPrintDialog(true);
  };

  return (
    <div className="space-y-6">
      {/* En-tête de la page */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Missions & Ministère
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Planification des Visites Pastorales
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Organisation des délégations ecclésiales, calendrier des cultes et délivrance des ordres de mission.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-9 text-xs gap-1.5"
            onClick={() => {
              if (visitesFiltrees.length > 0) {
                handleImprimerVisite(visitesFiltrees[0]);
              }
            }}
          >
            <Printer className="w-3.5 h-3.5" />
            Ordres de Mission
          </Button>

          <Button className="h-9 text-xs gap-1.5" onClick={() => handleNouvelleVisite()}>
            <PlusCircle className="w-4 h-4" />
            Planifier une Visite
          </Button>
        </div>
      </div>

      {/* Cartes KPI synthétiques */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-foreground" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Visites ce mois
          </p>
          <p className="text-2xl font-extrabold text-foreground mt-1 tabular-nums">
            {stats.totalCeMois}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            Sur les cultes du mois
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Visites Confirmées
          </p>
          <p className="text-2xl font-extrabold text-foreground mt-1 tabular-nums">
            {stats.totalConfirmes}
          </p>
          <p className="text-[11px] text-emerald-700 mt-0.5 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" />
            Ordres de mission délivrés
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            En attente de validation
          </p>
          <p className="text-2xl font-extrabold text-foreground mt-1 tabular-nums">
            {stats.totalPlanifies}
          </p>
          <p className="text-[11px] text-amber-700 mt-0.5 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            Composition en cours
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-slate-400" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Gradés mobilisés
          </p>
          <p className="text-2xl font-extrabold text-foreground mt-1 tabular-nums">
            {stats.gradesMobilises}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            Pasteurs, Évangélistes, Diacres
          </p>
        </div>
      </div>

      {/* Barre de commandes et filtres */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* 1. Filtre Entité */}
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={filtreEntite}
            onChange={(e) => setFiltreEntite(e.target.value)}
          >
            <option value="all">Toutes les Entités</option>
            {entites.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom} ({e.type})
              </option>
            ))}
          </select>

          {/* 2. Filtre Statut */}
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={filtreStatut}
            onChange={(e) => setFiltreStatut(e.target.value)}
          >
            <option value="all">Tous les Statuts</option>
            <option value="PLANIFIE">Planifiées (En attente)</option>
            <option value="CONFIRME">Confirmées (Validées)</option>
            <option value="EFFECTUE">Effectuées (Passées)</option>
            <option value="ANNULE">Annulées</option>
          </select>

          {/* 3. Recherche textuelle en direct */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-muted-foreground" />
            <Input
              placeholder="Rechercher une personne, église ou thème..."
              value={recherchePersonne}
              onChange={(e) => setRecherchePersonne(e.target.value)}
              className="pl-8 h-9 text-xs w-64 bg-background"
            />
          </div>
        </div>

        {/* Bascule Calendrier / Liste */}
        <div className="inline-flex rounded-md bg-muted p-1 gap-1">
          <Button
            type="button"
            variant={vue === 'calendar' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setVue('calendar')}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Vue Calendrier
          </Button>
          <Button
            type="button"
            variant={vue === 'list' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setVue('list')}
          >
            <List className="w-3.5 h-3.5" />
            Vue Liste
          </Button>
        </div>
      </div>

      {/* Vue Calendrier Horizontal ou Vue Liste */}
      {vue === 'calendar' ? (
        <CalendrierHorizontal
          moisActif={moisActif}
          onChangerMois={setMoisActif}
          visites={visitesFiltrees}
          onNouvelleVisiteDate={(date) => handleNouvelleVisite(date)}
          onEditerVisite={handleEditerVisite}
          onImprimerVisite={handleImprimerVisite}
        />
      ) : (
        <VisitesTable
          visites={visitesFiltrees}
          onEditerVisite={handleEditerVisite}
          onImprimerVisite={handleImprimerVisite}
        />
      )}

      {/* Modale de Planification / Édition */}
      <VisiteDialog
        open={openPlanDialog}
        onOpenChange={setOpenPlanDialog}
        visiteEnEdition={visiteEnEdition}
        dateInitiale={dateSelectionnee}
        entites={entites}
        croyantsCandidats={croyantsCandidats}
        currentEntityId={currentEntityId}
      />

      {/* Modale d'Aperçu & Impression Ordre de Mission A4 */}
      <OrdreMissionDialog
        open={openPrintDialog}
        onOpenChange={setOpenPrintDialog}
        visite={visiteAImprimer}
        organisationNom={organisationNom}
      />
    </div>
  );
}
