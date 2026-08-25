'use client';

import {
  BookOpen,
  Calendar,
  Clock,
  Coins,
  CreditCard,
  Droplets,
  FileText,
  HelpCircle,
  History,
  LayoutDashboard,
  Lock,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Command as CommandPrimitive } from 'cmdk';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  type EspaceDocumentation,
  SECTIONS_ADMINISTRATION,
  SECTIONS_UTILISATEUR,
  type SectionDoc,
} from '@/lib/domain/documentation';
import { normaliserRecherche } from '@/lib/domain/croyant';

const ICONES: Record<string, typeof BookOpen> = {
  HelpCircle,
  Workflow,
  Users,
  ArrowLeftRight: Workflow,
  Droplets,
  Network: Workflow,
  CreditCard,
  Coins,
  LayoutDashboard,
  FileText,
  KeyRound: Lock,
  Shield,
  Sliders: Settings,
  History,
  Trash2,
  Settings,
  Database: Settings,
  ShieldCheck,
  Calendar,
};

const SUGGESTIONS_POPULAIRES = [
  {
    titre: 'Enregistrer un baptême & Certificat',
    espace: 'utilisateur' as const,
    sectionId: 'baptemes-ceremonies',
    chapitreId: 'saisie-lot-baptemes',
    icone: Droplets,
    description: 'Saisie collective en lot et certificat de baptême A4 officiel',
  },
  {
    titre: 'Demander ou approuver une mutation',
    espace: 'utilisateur' as const,
    sectionId: 'transferts-mobilite',
    chapitreId: 'demande-transfert',
    icone: Workflow,
    description: 'Circuit de mutation ecclésiale et lettre d’attestation officielle',
  },
  {
    titre: 'Fiche croyant, matricule & photo',
    espace: 'utilisateur' as const,
    sectionId: 'gestion-croyants',
    chapitreId: 'nouvelle-fiche-croyant',
    icone: Users,
    description: 'Matricule automatique, mariage et impression des listes filtrées',
  },
  {
    titre: 'Dîmes, enveloppes & remises au Siège',
    espace: 'utilisateur' as const,
    sectionId: 'dimes-remises',
    chapitreId: 'collecte-recus',
    icone: Coins,
    description: 'Collectes nominatives, reçus individuels et versement au Siège',
  },
  {
    titre: 'Organigramme interactif & Adjoints',
    espace: 'utilisateur' as const,
    sectionId: 'bureaux-organigrammes',
    chapitreId: 'organigramme-interactif',
    icone: Workflow,
    description: 'Composition du bureau, liaisons de boîtes et export SVG/PDF',
  },
  {
    titre: 'Rapports, omission confidentielle RG-26 & Gel RG-27',
    espace: 'utilisateur' as const,
    sectionId: 'generateur-rapports',
    chapitreId: 'regles-confidentialite',
    icone: FileText,
    description: 'Générateur de rapports, masquage de données et gel des archives',
  },
  {
    titre: 'Habilitations, délégation & matrice des droits',
    espace: 'administration' as const,
    sectionId: 'admin-habilitations',
    chapitreId: 'principe-droit-portee',
    icone: Shield,
    description: 'Gestion des rôles, portées hiérarchiques et profils réutilisables',
  },
  {
    titre: 'Sauvegarde intégrale & Restauration S3 / Postgres',
    espace: 'administration' as const,
    sectionId: 'admin-portabilite',
    chapitreId: 'garantie-souverainete',
    icone: Settings,
    description: 'Export complet, schéma PostgreSQL standard et reprise d’activité',
  },
];

const RECHERCHES_DEFAUT = ['Baptême', 'Transfert', 'Dîmes', 'Organigramme', 'Matricule'];
const CLE_STOCKAGE_RECENTS = 'synod_doc_recherches_recentes';

interface Props {
  readonly ouvert: boolean;
  readonly surChangerOuvert: (ouvert: boolean) => void;
  readonly estAdmin: boolean;
  readonly surSelectionner: (
    espace: EspaceDocumentation,
    sectionId: string,
    chapitreId?: string,
  ) => void;
}

export function DocumentationRechercheDialog({
  ouvert,
  surChangerOuvert,
  estAdmin,
  surSelectionner,
}: Props) {
  const [recherche, setRecherche] = useState('');
  const [recents, setRecents] = useState<string[]>(RECHERCHES_DEFAUT);

  // Chargement des recherches récentes depuis le localStorage
  useEffect(() => {
    try {
      const brut = localStorage.getItem(CLE_STOCKAGE_RECENTS);
      if (brut) {
        const parse = JSON.parse(brut);
        if (Array.isArray(parse) && parse.length > 0) {
          setRecents(parse.slice(0, 6));
          return;
        }
      }
      setRecents(RECHERCHES_DEFAUT);
    } catch {
      setRecents(RECHERCHES_DEFAUT);
    }
  }, [ouvert]);

  const enregistrerRecent = (terme: string) => {
    if (!terme.trim()) return;
    try {
      const nouveau = [
        terme.trim(),
        ...recents.filter((t) => t.toLowerCase() !== terme.trim().toLowerCase()),
      ].slice(0, 6);
      setRecents(nouveau);
      localStorage.setItem(CLE_STOCKAGE_RECENTS, JSON.stringify(nouveau));
    } catch {
      // Ignorer
    }
  };

  const effacerRecents = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      localStorage.removeItem(CLE_STOCKAGE_RECENTS);
      setRecents([]);
    } catch {
      // Ignorer
    }
  };

  const choisirElement = (
    espace: EspaceDocumentation,
    sectionId: string,
    chapitreId?: string,
    termeRecherche?: string,
  ) => {
    if (termeRecherche) {
      enregistrerRecent(termeRecherche);
    }
    surSelectionner(espace, sectionId, chapitreId);
    surChangerOuvert(false);
    setRecherche('');
  };

  // Filtrage des sections et chapitres
  const resultats = useMemo(() => {
    if (!recherche.trim()) return null;
    const terme = normaliserRecherche(recherche);

    const filtrerSections = (sections: readonly SectionDoc[], espace: EspaceDocumentation) => {
      const items: {
        espace: EspaceDocumentation;
        sectionId: string;
        chapitreId?: string;
        titre: string;
        sousTitre: string;
        iconeNom: string;
        matchChapitre?: string;
      }[] = [];

      for (const s of sections) {
        const texteSection = normaliserRecherche(`${s.titre} ${s.sousTitre} ${s.descriptionCourte}`);
        if (terme.split(' ').every((mot) => texteSection.includes(mot))) {
          items.push({
            espace,
            sectionId: s.id,
            titre: s.titre,
            sousTitre: s.descriptionCourte,
            iconeNom: s.iconeNom,
          });
        }

        // Recherche dans les chapitres internes
        for (const c of s.chapitres) {
          const texteChapitre = normaliserRecherche(
            `${c.titre} ${c.description} ${(c.etapes ?? []).map((e) => `${e.titre} ${e.texte}`).join(' ')} ${(c.astuces ?? []).join(' ')} ${(c.regles ?? []).join(' ')}`,
          );
          if (terme.split(' ').every((mot) => texteChapitre.includes(mot))) {
            items.push({
              espace,
              sectionId: s.id,
              chapitreId: c.id,
              titre: `${s.titre} → ${c.titre}`,
              sousTitre: c.description,
              iconeNom: s.iconeNom,
              matchChapitre: c.titre,
            });
          }
        }
      }

      return items;
    };

    return {
      utilisateur: filtrerSections(SECTIONS_UTILISATEUR, 'utilisateur'),
      administration: estAdmin
        ? filtrerSections(SECTIONS_ADMINISTRATION, 'administration')
        : [],
    };
  }, [recherche, estAdmin]);

  return (
    <Dialog open={ouvert} onOpenChange={surChangerOuvert}>
      <DialogContent className="p-0 overflow-hidden sm:max-w-3xl w-[95vw] rounded-2xl border border-slate-200 shadow-2xl bg-white top-[15%] translate-y-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Recherche rapide dans la documentation</DialogTitle>
          <DialogDescription>Tapez un mot-clé pour accéder instantanément à un chapitre</DialogDescription>
        </DialogHeader>

        <Command className="rounded-2xl bg-white" shouldFilter={false}>
          {/* Zone de recherche : capsule arrondie (rounded-full) avec bordure grise douce sans contour noir au focus */}
          <div className="p-4 pb-3 border-b border-slate-100 bg-white">
            <div className="flex items-center rounded-full border border-slate-200 bg-slate-50/60 px-4 h-12 transition-all hover:border-slate-300 focus-within:border-slate-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-slate-100">
              <Search className="mr-3 size-4.5 shrink-0 text-slate-400" />
              <CommandPrimitive.Input
                value={recherche}
                onValueChange={setRecherche}
                placeholder="Rechercher un sujet, un module, une règle (ex: baptême, transfert, solde, dîme, mot de passe...)"
                className="h-full w-full border-0 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:outline-none focus:ring-0 ring-0 focus-visible:ring-0 focus-visible:outline-none"
                autoFocus
              />
              {recherche && (
                <button
                  type="button"
                  onClick={() => setRecherche('')}
                  className="text-xs text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-200/60 transition-colors"
                  title="Effacer la saisie"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>

          <CommandList className="max-h-[440px] p-3 overflow-y-auto">
            {/* Aucun résultat */}
            <CommandEmpty className="py-10 text-center text-xs text-slate-500">
              Aucun sujet ne correspond à « <span className="font-semibold text-slate-700">{recherche}</span> ».
            </CommandEmpty>

            {/* Sans recherche : Recherches récentes en puces & Suggestions populaires */}
            {!recherche.trim() && (
              <div className="space-y-4">
                {/* Dernières recherches récentes */}
                {recents.length > 0 && (
                  <div className="px-2 pt-1 pb-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                        <Clock className="size-3.5 text-slate-400" />
                        Dernières recherches récentes
                      </span>
                      <button
                        type="button"
                        onClick={effacerRecents}
                        className="text-[11px] text-slate-400 hover:text-rose-600 font-normal transition-colors"
                      >
                        Effacer
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {recents.map((terme) => (
                        <button
                          key={terme}
                          type="button"
                          onClick={() => setRecherche(terme)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 rounded-full border border-slate-200/80 transition-all cursor-pointer"
                        >
                          <History className="size-3 text-slate-400" />
                          <span>{terme}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {recents.length > 0 && <CommandSeparator className="my-1" />}

                {/* Suggestions & Thèmes fréquents */}
                <CommandGroup
                  heading={
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1 px-1">
                      <Sparkles className="size-3.5 text-amber-500" />
                      Sujets fréquents & Raccourcis clés
                    </span>
                  }
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                    {SUGGESTIONS_POPULAIRES.filter(
                      (s) => s.espace === 'utilisateur' || estAdmin,
                    ).map((s) => {
                      const Icone = s.icone;
                      return (
                        <CommandItem
                          key={s.sectionId}
                          value={s.titre}
                          onSelect={() =>
                            choisirElement(s.espace, s.sectionId, s.chapitreId, s.titre)
                          }
                          onClick={() =>
                            choisirElement(s.espace, s.sectionId, s.chapitreId, s.titre)
                          }
                          className="flex items-start gap-3 p-3 rounded-xl cursor-pointer border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/60 transition-all"
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 mt-0.5 border border-indigo-100">
                            <Icone className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-semibold text-slate-900 leading-snug">
                                {s.titre}
                              </p>
                              {s.espace === 'administration' && (
                                <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded font-medium shrink-0">
                                  Admin
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                              {s.description}
                            </p>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </div>
                </CommandGroup>
              </div>
            )}

            {/* Résultats de recherche active */}
            {resultats && (
              <div className="space-y-3">
                {resultats.utilisateur.length > 0 && (
                  <CommandGroup
                    heading={
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 px-1">
                        <BookOpen className="size-3.5 text-indigo-600" />
                        Guide Utilisateur ({resultats.utilisateur.length})
                      </span>
                    }
                  >
                    <div className="space-y-1.5 mt-1">
                      {resultats.utilisateur.map((r, i) => {
                        const Icone = ICONES[r.iconeNom] ?? BookOpen;
                        return (
                          <CommandItem
                            key={`${r.sectionId}-${r.chapitreId ?? i}`}
                            value={`${r.titre} ${r.sousTitre}`}
                            onSelect={() =>
                              choisirElement(
                                'utilisateur',
                                r.sectionId,
                                r.chapitreId,
                                recherche,
                              )
                            }
                            onClick={() =>
                              choisirElement(
                                'utilisateur',
                                r.sectionId,
                                r.chapitreId,
                                recherche,
                              )
                            }
                            className="flex items-start gap-3 p-3 rounded-xl cursor-pointer hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-all"
                          >
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 mt-0.5">
                              <Icone className="size-3.5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-slate-900 leading-snug">
                                {r.titre}
                              </p>
                              <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                                {r.sousTitre}
                              </p>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </div>
                  </CommandGroup>
                )}

                {resultats.administration.length > 0 && (
                  <>
                    {resultats.utilisateur.length > 0 && (
                      <CommandSeparator className="my-2" />
                    )}
                    <CommandGroup
                      heading={
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 px-1">
                          <ShieldCheck className="size-3.5 text-indigo-600" />
                          Manuel Administration ({resultats.administration.length})
                        </span>
                      }
                    >
                      <div className="space-y-1.5 mt-1">
                        {resultats.administration.map((r, i) => {
                          const Icone = ICONES[r.iconeNom] ?? ShieldCheck;
                          return (
                            <CommandItem
                              key={`${r.sectionId}-${r.chapitreId ?? i}`}
                              value={`${r.titre} ${r.sousTitre}`}
                              onSelect={() =>
                                choisirElement(
                                  'administration',
                                  r.sectionId,
                                  r.chapitreId,
                                  recherche,
                                )
                              }
                              onClick={() =>
                                choisirElement(
                                  'administration',
                                  r.sectionId,
                                  r.chapitreId,
                                  recherche,
                                )
                              }
                              className="flex items-start gap-3 p-3 rounded-xl cursor-pointer hover:bg-indigo-50/60 border border-transparent hover:border-indigo-200 transition-all"
                            >
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 mt-0.5 border border-indigo-100">
                                <Icone className="size-3.5" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-slate-900 leading-snug">
                                  {r.titre}
                                </p>
                                <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                                  {r.sousTitre}
                                </p>
                              </div>
                            </CommandItem>
                          );
                        })}
                      </div>
                    </CommandGroup>
                  </>
                )}
              </div>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
