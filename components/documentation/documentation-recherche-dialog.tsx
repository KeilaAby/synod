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

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
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
import { cn } from '@/lib/utils';

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
    sectionId: 'baptemes',
    icone: Droplets,
    description: 'Saisie collective en lot et certificat de baptême A4',
  },
  {
    titre: 'Demander ou approuver une mutation',
    espace: 'utilisateur' as const,
    sectionId: 'transferts',
    icone: Workflow,
    description: 'Circuit de mutation ecclésiale et attestation officielle',
  },
  {
    titre: 'Fiche croyant, matricule & photo',
    espace: 'utilisateur' as const,
    sectionId: 'croyants',
    icone: Users,
    description: 'Matricule automatique, mariage et impression de liste',
  },
  {
    titre: 'Dîmes, enveloppes & remises au Siège',
    espace: 'utilisateur' as const,
    sectionId: 'dimes',
    icone: Coins,
    description: 'Collectes, reçus individuels et versement au Siège',
  },
  {
    titre: 'Organigramme interactif & Adjoints',
    espace: 'utilisateur' as const,
    sectionId: 'bureaux',
    icone: Workflow,
    description: 'Composition, liaisons de boîtes et export SVG/PDF',
  },
  {
    titre: 'Rapports, omission confidentielle RG-26 & Gel RG-27',
    espace: 'utilisateur' as const,
    sectionId: 'rapports',
    icone: FileText,
    description: 'Générateur de rapports, masquage de données et gel d’archives',
  },
  {
    titre: 'Habilitations, délégation & matrice des droits',
    espace: 'administration' as const,
    sectionId: 'admin-habilitations',
    icone: Shield,
    description: 'Gestion des rôles, portées et profils réutilisables',
  },
  {
    titre: 'Sauvegarde intégrale & Restauration S3 / Postgres',
    espace: 'administration' as const,
    sectionId: 'admin-portabilite',
    icone: Settings,
    description: 'Export complet, schéma PostgreSQL standard et reprise d’activité',
  },
];

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
  const [recents, setRecents] = useState<string[]>([]);

  // Chargement des recherches récentes depuis le localStorage
  useEffect(() => {
    try {
      const brut = localStorage.getItem(CLE_STOCKAGE_RECENTS);
      if (brut) {
        const parse = JSON.parse(brut);
        if (Array.isArray(parse)) {
          setRecents(parse.slice(0, 5));
        }
      }
    } catch {
      // Ignorer si localStorage non disponible
    }
  }, [ouvert]);

  const enregistrerRecent = (terme: string) => {
    if (!terme.trim()) return;
    try {
      const nouveau = [terme.trim(), ...recents.filter((t) => t.toLowerCase() !== terme.trim().toLowerCase())].slice(0, 5);
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
    <CommandDialog
      open={ouvert}
      onOpenChange={surChangerOuvert}
      title="Recherche rapide dans la documentation"
      description="Tapez un mot-clé pour accéder instantanément à n'importe quel chapitre ou règle"
    >
      <div className="flex items-center border-b px-3">
        <Search className="mr-2.5 size-4 shrink-0 text-slate-400" />
        <CommandInput
          value={recherche}
          onValueChange={setRecherche}
          placeholder="Rechercher (ex: baptême, transfert, solde, dîme, mot de passe...)"
          className="h-12 border-0 focus:ring-0 text-sm"
        />
        {recherche && (
          <button
            type="button"
            onClick={() => setRecherche('')}
            className="text-xs text-slate-400 hover:text-slate-600 px-1"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <CommandList className="max-h-[380px] p-2">
        {/* Aucun résultat */}
        <CommandEmpty className="py-6 text-center text-xs text-slate-500">
          Aucun sujet ne correspond à « <span className="font-semibold text-slate-700">{recherche}</span> ».
        </CommandEmpty>

        {/* Sans recherche : Recherches récentes & Suggestions */}
        {!recherche.trim() && (
          <>
            {recents.length > 0 && (
              <CommandGroup
                heading={
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-3 text-slate-400" />
                      Recherches récentes
                    </span>
                    <button
                      type="button"
                      onClick={effacerRecents}
                      className="text-[10px] text-slate-400 hover:text-rose-600 font-normal transition-colors"
                    >
                      Effacer l’historique
                    </button>
                  </div>
                }
              >
                {recents.map((terme) => (
                  <CommandItem
                    key={terme}
                    value={terme}
                    onSelect={() => setRecherche(terme)}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-slate-700 rounded-lg cursor-pointer hover:bg-slate-100"
                  >
                    <History className="size-3.5 text-slate-400 shrink-0" />
                    <span>{terme}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {recents.length > 0 && <CommandSeparator className="my-2" />}

            <CommandGroup
              heading={
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <Sparkles className="size-3 text-amber-500" />
                  Sujets fréquents & Raccourcis
                </span>
              }
            >
              {SUGGESTIONS_POPULAIRES.filter(
                (s) => s.espace === 'utilisateur' || estAdmin,
              ).map((s) => {
                const Icone = s.icone;
                return (
                  <CommandItem
                    key={s.sectionId}
                    value={s.titre}
                    onSelect={() =>
                      choisirElement(s.espace, s.sectionId, undefined, s.titre)
                    }
                    className="flex items-start gap-3 p-2.5 rounded-lg cursor-pointer hover:bg-indigo-50/70"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600 mt-0.5 border border-indigo-100">
                      <Icone className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-slate-900 leading-tight">
                          {s.titre}
                        </p>
                        {s.espace === 'administration' && (
                          <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded font-medium">
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
            </CommandGroup>
          </>
        )}

        {/* Résultats de recherche */}
        {resultats && (
          <>
            {resultats.utilisateur.length > 0 && (
              <CommandGroup
                heading={
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <BookOpen className="size-3 text-indigo-600" />
                    Guide Utilisateur ({resultats.utilisateur.length})
                  </span>
                }
              >
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
                      className="flex items-start gap-3 p-2.5 rounded-lg cursor-pointer hover:bg-slate-100"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-600 mt-0.5">
                        <Icone className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-900 leading-tight">
                          {r.titre}
                        </p>
                        <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                          {r.sousTitre}
                        </p>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {resultats.administration.length > 0 && (
              <>
                {resultats.utilisateur.length > 0 && (
                  <CommandSeparator className="my-2" />
                )}
                <CommandGroup
                  heading={
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700">
                      <ShieldCheck className="size-3 text-indigo-600" />
                      Manuel Administration ({resultats.administration.length})
                    </span>
                  }
                >
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
                        className="flex items-start gap-3 p-2.5 rounded-lg cursor-pointer hover:bg-indigo-50/60"
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded bg-indigo-50 text-indigo-600 mt-0.5 border border-indigo-100">
                          <Icone className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-900 leading-tight">
                            {r.titre}
                          </p>
                          <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                            {r.sousTitre}
                          </p>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
