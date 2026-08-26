'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  Compass,
  Network,
  Users,
  ArrowLeftRight,
  Droplets,
  Briefcase,
  Wallet,
  Coins,
  LayoutDashboard,
  FileText,
  UserCheck,
  ShieldCheck,
  SlidersHorizontal,
  ScrollText,
  Trash2,
  Settings,
  Server,
  Search,
  Printer,
  Sparkles,
  Lightbulb,
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react';

import { DocumentationRechercheDialog } from './documentation-recherche-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  SECTIONS_UTILISATEUR,
  SECTIONS_ADMINISTRATION,
  type SectionDoc,
  type EspaceDocumentation,
} from '@/lib/domain/documentation';
import { cn } from '@/lib/utils';

const ICONES: Record<string, LucideIcon> = {
  Compass,
  Network,
  Users,
  ArrowLeftRight,
  Droplets,
  Briefcase,
  Wallet,
  Coins,
  LayoutDashboard,
  FileText,
  UserCheck,
  ShieldCheck,
  SlidersHorizontal,
  ScrollText,
  Trash2,
  Settings,
  Server,
};

export function DocumentationClient({
  estAdmin,
}: {
  readonly estAdmin: boolean;
}) {
  const [espace, setEspace] = useState<EspaceDocumentation>('utilisateur');
  const [sectionActiveId, setSectionActiveId] = useState<string>('premiers-pas');
  const [recherche, setRecherche] = useState('');
  const [dialogRechercheOuvert, setDialogRechercheOuvert] = useState(false);

  // Déclencheur global au clavier CTRL+K / CMD+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setDialogRechercheOuvert((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const sectionsActuelles = useMemo(() => {
    return espace === 'administration' ? SECTIONS_ADMINISTRATION : SECTIONS_UTILISATEUR;
  }, [espace]);

  // Filtrage instantané sur la recherche
  const sectionsFiltrees = useMemo(() => {
    if (!recherche.trim()) return sectionsActuelles;
    const q = recherche.toLowerCase();

    return sectionsActuelles
      .map((section) => {
        const matchTitre = section.titre.toLowerCase().includes(q);
        const matchDesc = section.descriptionCourte.toLowerCase().includes(q);
        const chapitresFiltres = section.chapitres.filter(
          (c) =>
            c.titre.toLowerCase().includes(q) ||
            c.description.toLowerCase().includes(q) ||
            c.etapes?.some((e) => e.titre.toLowerCase().includes(q) || e.texte.toLowerCase().includes(q)) ||
            c.astuces?.some((a) => a.toLowerCase().includes(q)) ||
            c.regles?.some((r) => r.toLowerCase().includes(q)) ||
            c.casPratiques?.some((cp) => cp.toLowerCase().includes(q)),
        );

        if (matchTitre || matchDesc || chapitresFiltres.length > 0) {
          return {
            ...section,
            chapitres: chapitresFiltres.length > 0 ? chapitresFiltres : section.chapitres,
          };
        }
        return null;
      })
      .filter((s): s is SectionDoc => s !== null);
  }, [sectionsActuelles, recherche]);

  // Section actuellement sélectionnée
  const sectionActive = useMemo(() => {
    const trouvee = sectionsFiltrees.find((s) => s.id === sectionActiveId);
    return trouvee ?? sectionsFiltrees[0] ?? sectionsActuelles[0];
  }, [sectionsFiltrees, sectionActiveId, sectionsActuelles]);

  const IconePrincipale = sectionActive ? ICONES[sectionActive.iconeNom] ?? BookOpen : BookOpen;

  const imprimer = () => {
    window.print();
  };

  const selectionnerSectionDepuisDialog = (
    nouvelEspace: EspaceDocumentation,
    sectionId: string,
    chapitreId?: string,
  ) => {
    setEspace(nouvelEspace);
    setSectionActiveId(sectionId);
    setRecherche('');

    if (chapitreId) {
      setTimeout(() => {
        const el = document.getElementById(chapitreId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  };

  return (
    <div className="space-y-6">
      {/* Palette de recherche rapide CTRL+K */}
      <DocumentationRechercheDialog
        ouvert={dialogRechercheOuvert}
        surChangerOuvert={setDialogRechercheOuvert}
        estAdmin={estAdmin}
        surSelectionner={selectionnerSectionDepuisDialog}
      />

      {/* En-tête principal & recherche — FIGÉ ET FIXÉ AU SCROLL (Fond blanc épuré) */}
      <div className="no-print sticky top-0 z-20 bg-white/95 backdrop-blur-md pt-2 pb-4 border-b border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <PageHeader
            eyebrow="Centre d’Aide & Documentation"
            title="Guide & Manuel d’utilisation"
            description="Tout comprendre de A à Z sur le fonctionnement de SYNOD."
          />

          <div className="flex flex-wrap items-center gap-3">
            {/* Bascule d'espace pour les administrateurs */}
            {estAdmin && (
              <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setEspace('utilisateur');
                    setSectionActiveId('premiers-pas');
                  }}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                    espace === 'utilisateur'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  Guide Utilisateur
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEspace('administration');
                    setSectionActiveId('admin-comptes');
                  }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                    espace === 'administration'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  <ShieldCheck className="size-3.5" />
                  Manuel Administration
                </button>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={imprimer}
              className="flex items-center gap-2 text-xs"
            >
              <Printer className="size-3.5" />
              Imprimer ce guide
            </Button>
          </div>
        </div>

        {/* Barre de recherche avec déclencheur direct CTRL+K */}
        <div className="relative flex items-center">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un sujet, un module, une règle (ex: baptême, transfert, solde, dîme, mot de passe...)"
            className="pl-9 pr-24 bg-white border-slate-200 text-sm shadow-sm h-10"
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {recherche && (
              <button
                type="button"
                onClick={() => setRecherche('')}
                className="text-xs text-slate-400 hover:text-slate-600 px-1"
              >
                Effacer
              </button>
            )}
            <button
              type="button"
              onClick={() => setDialogRechercheOuvert(true)}
              className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 rounded border border-slate-200 transition-colors"
              title="Ouvrir la recherche rapide (Ctrl+K)"
            >
              <kbd className="font-sans">Ctrl</kbd>
              <span>+</span>
              <kbd className="font-sans">K</kbd>
            </button>
          </div>
        </div>
      </div>

      {/* Disposition principale : Sidebar + Contenu */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Navigation latérale gauche — fixe au défilement sous le header */}
        <aside className="no-print lg:col-span-4 lg:sticky lg:top-40 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto space-y-2 pr-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-3 py-1 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-sm z-10">
            <span>{espace === 'administration' ? 'Manuel Administrateur' : 'Guide Utilisateur'}</span>
            <Badge variant="secondary" className="text-[10px] font-normal">
              {sectionsFiltrees.length} thèmes
            </Badge>
          </div>

          <div className="space-y-1">
            {sectionsFiltrees.map((section) => {
              const Icone = ICONES[section.iconeNom] ?? BookOpen;
              const estActive = section.id === sectionActive?.id;

              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setSectionActiveId(section.id)}
                  className={cn(
                    'w-full text-left flex items-start gap-3 p-3 rounded-xl transition-all border',
                    estActive
                      ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950 shadow-sm'
                      : 'bg-white border-slate-200/80 text-slate-700 hover:bg-slate-50 hover:border-slate-300',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-lg mt-0.5',
                      estActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    <Icone className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold leading-snug truncate">{section.titre}</p>
                    <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                      {section.descriptionCourte}
                    </p>
                  </div>
                </button>
              );
            })}

            {sectionsFiltrees.length === 0 && (
              <div className="p-6 text-center bg-white rounded-xl border border-dashed border-slate-200 text-slate-500 text-xs">
                Aucun sujet ne correspond à votre recherche.
              </div>
            )}
          </div>
        </aside>

        {/* Zone de contenu principale droite */}
        <main className="lg:col-span-8 space-y-6">
          {sectionActive ? (
            <div className="space-y-6">
              {/* En-tête de la section active avec Fil d'Ariane officiel */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                      <IconePrincipale className="size-5" />
                    </span>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">{sectionActive.titre}</h2>
                      <p className="text-xs font-medium text-indigo-700">{sectionActive.sousTitre}</p>
                    </div>
                  </div>

                  {sectionActive.filAriane && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                      <span className="font-semibold text-slate-400">Accès :</span>
                      {sectionActive.lienAcces ? (
                        <a
                          href={sectionActive.lienAcces}
                          className="font-medium text-indigo-700 hover:text-indigo-900 hover:underline transition-colors"
                          title={`Accéder directement au module ${sectionActive.titre}`}
                        >
                          {sectionActive.filAriane}
                        </a>
                      ) : (
                        <span className="font-medium text-slate-700">{sectionActive.filAriane}</span>
                      )}
                    </div>
                  )}
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {sectionActive.descriptionCourte}
                </p>
              </div>

              {/* Liste des chapitres */}
              <div className="space-y-6">
                {sectionActive.chapitres.map((chapitre, index) => (
                  <Card
                    key={chapitre.id}
                    id={chapitre.id}
                    className="scroll-mt-48 rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden transition-all duration-300"
                  >
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] font-mono text-slate-500 bg-white">
                          Section {index + 1}
                        </Badge>
                        <CardTitle className="text-sm font-semibold text-slate-900">
                          {chapitre.titre}
                        </CardTitle>
                      </div>
                      <CardDescription className="text-xs text-slate-600 mt-1">
                        {chapitre.description}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="p-6 space-y-5">
                      {/* Étapes pas à pas */}
                      {chapitre.etapes && chapitre.etapes.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                            <Sparkles className="size-3.5 text-indigo-600" />
                            Procédure étape par étape
                          </h4>
                          <div className="grid gap-2.5">
                            {chapitre.etapes.map((etape, eIdx) => (
                              <div
                                key={eIdx}
                                className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs"
                              >
                                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white mt-0.5">
                                  {eIdx + 1}
                                </span>
                                <div className="space-y-0.5">
                                  <p className="font-semibold text-slate-900">{etape.titre}</p>
                                  <p className="text-slate-600 leading-relaxed">{etape.texte}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Règles essentielles */}
                      {chapitre.regles && chapitre.regles.length > 0 && (
                        <div className="p-4 rounded-xl bg-rose-50/60 border border-rose-100 space-y-2">
                          <h4 className="text-xs font-semibold text-rose-900 flex items-center gap-1.5">
                            <AlertTriangle className="size-3.5 text-rose-600" />
                            Règles d’or & Principes stricts
                          </h4>
                          <ul className="space-y-1.5 text-xs text-rose-800 list-disc list-inside">
                            {chapitre.regles.map((regle, rIdx) => (
                              <li key={rIdx} className="leading-relaxed">
                                {regle}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Astuces & Conseils */}
                      {chapitre.astuces && chapitre.astuces.length > 0 && (
                        <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-100 space-y-2">
                          <h4 className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                            <Lightbulb className="size-3.5 text-amber-600" />
                            Conseils & Bonnes pratiques
                          </h4>
                          <ul className="space-y-1 text-xs text-amber-800">
                            {chapitre.astuces.map((astuce, aIdx) => (
                              <li key={aIdx} className="flex items-start gap-2 leading-relaxed">
                                <CheckCircle2 className="size-3.5 shrink-0 text-amber-600 mt-0.5" />
                                <span>{astuce}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Cas pratiques & Exemples */}
                      {chapitre.casPratiques && chapitre.casPratiques.length > 0 && (
                        <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100 space-y-2">
                          <h4 className="text-xs font-semibold text-blue-900 flex items-center gap-1.5">
                            <Bookmark className="size-3.5 text-blue-600" />
                            Cas concret illustré
                          </h4>
                          <div className="space-y-1.5 text-xs text-blue-800">
                            {chapitre.casPratiques.map((cas, cIdx) => (
                              <p key={cIdx} className="leading-relaxed">
                                {cas}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-500 text-xs">
              Sélectionnez une catégorie dans la colonne de gauche.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
