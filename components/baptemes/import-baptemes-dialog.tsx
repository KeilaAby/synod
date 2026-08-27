'use client';

import {
  AlertCircle,
  CircleCheck,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ChampDate } from '@/components/shared/champ-date';
import { Field, TextField } from '@/components/shared/field';
import { avertir } from '@/components/shared/messages';
import { TelechargerCanevas } from '@/components/shared/telecharger-canevas';
import type { OptionEntite } from '@/components/structure/entity-picker';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type ResultatLot, saisirBaptisesEnLot } from '@/lib/actions/baptemes';
import { CANEVAS_BAPTEMES } from '@/lib/domain/canevas-import';
import { lireCsv, separerEntetes } from '@/lib/domain/csv';
import { egliseImplicite } from '@/lib/domain/bapteme-lot';
import {
  type CorrespondanceBapteme,
  type RapportImportBaptemes,
  DESCRIPTION_BAPTEME,
  analyserBaptemes,
  champsBaptemeManquants,
  devinerBapteme,
} from '@/lib/domain/import-baptemes';
import { normaliser } from '@/lib/domain/import-croyants';
import { LIGNES_LOT_MAX } from '@/lib/validation/bapteme';
import { formatNombre } from '@/lib/utils/format';

import type {
  CelluleOption,
  OptionReferentiel,
} from '@/components/croyants/croyant-form';

/**
 * Import d'une feuille de nouveaux baptisés — EF-BAP-07.
 *
 * LE FICHIER NE PORTE QUE DES PERSONNES. La cérémonie — date, lieu, session,
 * célébrants — se choisit ici, une fois : elle est commune à tout le lot par
 * nature, et la répéter sur trente lignes offrirait trente occasions de la
 * contredire. Trois dates différentes dans un fichier, et plus personne ne sait
 * laquelle fait foi.
 *
 * C'EST LA SAISIE EN LOT QUI ÉCRIT, pas une action nouvelle. Les lignes lues
 * ont exactement la forme que `saisirBaptisesEnLot` attend, et toutes les
 * règles vivent déjà là-bas : RG-28, RG-30, la résolution du grade, la
 * détection des doublons. Un second chemin d'écriture aurait fini par diverger
 * sur l'une d'elles (règle 16).
 *
 * TROIS TEMPS, dans cet ordre : on dépose, on dit à quoi correspondent les
 * colonnes et quelle cérémonie c'est, on lit le rapport. Rien n'est écrit avant
 * le dernier.
 */

type Etape = 'depot' | 'correspondance' | 'rapport';

export function ImportBaptemesDialog({
  eglises,
  cellules,
  nationalites,
  celebrants,
}: {
  eglises: OptionEntite[];
  cellules: CelluleOption[];
  nationalites: OptionReferentiel[];
  celebrants: { id: string; nom: string; prenom: string; grade: string }[];
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [etape, setEtape] = useState<Etape>('depot');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const [nomFichier, setNomFichier] = useState('');
  const [entetes, setEntetes] = useState<string[]>([]);
  const [donnees, setDonnees] = useState<string[][]>([]);
  const [correspondance, setCorrespondance] = useState<CorrespondanceBapteme>({});
  const [rapport, setRapport] = useState<ResultatLot | null>(null);

  // --- La cérémonie : le fichier ne porte que des lignes ---
  const [dateBapteme, setDateBapteme] = useState(new Date().toISOString().slice(0, 10));
  const [lieu, setLieu] = useState('');
  const [sessionLibelle, setSessionLibelle] = useState('');
  const [celebrantIds, setCelebrantIds] = useState<string[]>([]);

  const implicite = useMemo(() => egliseImplicite(eglises), [eglises]);

  /**
   * LES RÉFÉRENTIELS, INDEXÉS PAR NOM **ET** PAR CODE.
   *
   * Un fichier de reprise contient « AMBOHIPO » ou « EGL-0007 », jamais un
   * identifiant : les deux se rencontrent, et n'en accepter qu'un ferait
   * refuser des fichiers parfaitement justes.
   */
  const referentiels = useMemo(() => {
    const index = (
      entrees: readonly { id: string; libelle: string; code?: string | null }[],
    ) => {
      const table = new Map<string, string>();
      for (const e of entrees) {
        for (const cle of [e.libelle, e.code ?? '']) {
          const propre = normaliser(cle);
          if (propre) table.set(propre, e.id);
        }
      }
      return table;
    };

    return {
      eglises: index(eglises.map((e) => ({ id: e.id, libelle: e.nom, code: e.code }))),
      cellules: index(cellules.map((c) => ({ id: c.id, libelle: c.nom }))),
      nationalites: index(nationalites),
      egliseDeLaCellule: new Map(cellules.map((c) => [c.id, c.egliseId])),
      egliseImplicite: implicite,
    };
  }, [eglises, cellules, nationalites, implicite]);

  const manquants = useMemo(
    () => champsBaptemeManquants(correspondance),
    [correspondance],
  );

  /**
   * L'ANALYSE EST RECALCULÉE À CHAQUE CHANGEMENT, et c'est voulu : elle est
   * PURE et porte sur quelques dizaines de lignes. L'utilisateur voit donc le
   * nombre de lignes retenues bouger pendant qu'il corrige la correspondance,
   * au lieu de le découvrir après avoir cliqué.
   */
  const analyse: RapportImportBaptemes = useMemo(
    () =>
      manquants.length > 0 || donnees.length === 0
        ? { valides: [], erreurs: [] }
        : analyserBaptemes(donnees, correspondance, referentiels, dateBapteme),
    [donnees, correspondance, referentiels, dateBapteme, manquants.length],
  );

  const tropDeLignes = analyse.valides.length > LIGNES_LOT_MAX;

  function reinitialiser() {
    setEtape('depot');
    setNomFichier('');
    setEntetes([]);
    setDonnees([]);
    setCorrespondance({});
    setRapport(null);
    setErreur(null);
  }

  function fermer() {
    reinitialiser();
    setOuvert(false);
    if (rapport) router.refresh();
  }

  async function deposer(fichier: File) {
    setErreur(null);

    try {
      /**
       * LE XLSX EST CHARGÉ À LA DEMANDE (règle 7) : c'est un lecteur d'archive
       * ZIP, et il n'a rien à faire dans le paquet de ceux qui déposent un CSV.
       */
      const brut = fichier.name.toLowerCase().endsWith('.xlsx')
        ? await (await import('@/lib/domain/xlsx')).lireXlsx(await fichier.arrayBuffer())
        : lireCsv(await fichier.text());

      const { entetes: e, donnees: lignes } = separerEntetes(brut);

      if (lignes.length === 0) {
        setErreur('Ce fichier ne contient aucune ligne de données.');
        return;
      }

      setNomFichier(fichier.name);
      setEntetes(e);
      setDonnees(lignes);
      // Une proposition, jamais une décision : elle se corrige à l'écran.
      setCorrespondance(devinerBapteme(e));
      setEtape('correspondance');
    } catch (e) {
      setErreur(
        e instanceof Error && e.name === 'ErreurXlsx'
          ? e.message
          : 'Ce fichier n’a pas pu être lu. Attendus : CSV, ou XLSX.',
      );
    }
  }

  async function importer() {
    setErreur(null);
    setEnCours(true);

    try {
      const resultat = await saisirBaptisesEnLot({
        dateBapteme,
        lieu,
        sessionLibelle,
        celebrantIds,
        lignes: analyse.valides.map((l) => ({
          nom: l.nom,
          prenom: l.prenom,
          sexe: l.sexe,
          dateNaissance: l.dateNaissance,
          adresse: l.adresse,
          telephone: l.telephone,
          // L'église est omise quand le périmètre n'en compte qu'une : le
          // serveur la déduit, exactement comme pour la saisie manuelle.
          egliseId: implicite && l.egliseId === implicite ? undefined : l.egliseId,
          celluleId: l.celluleId,
          nationaliteId: l.nationaliteId,
        })),
      });

      if (!resultat.ok) {
        setErreur(resultat.error);
        return;
      }

      setRapport(resultat.data);
      setEtape('rapport');

      if (resultat.data.enregistres.length > 0) {
        toast.success(
          `${formatNombre(resultat.data.enregistres.length)} baptisé${resultat.data.enregistres.length > 1 ? 's' : ''} enregistré${resultat.data.enregistres.length > 1 ? 's' : ''}.`,
        );
      }

      /**
       * UN DEMI-SUCCÈS SE DIT (règle 30). Une fiche créée sans sa cérémonie
       * reste un croyant correct — il compte dans les indicateurs — mais le
       * baptême n'a ni lieu ni célébrant. Le taire laisserait croire à un
       * import complet.
       */
      if (resultat.data.ceremoniesManquantes > 0) {
        avertir(
          `${formatNombre(resultat.data.ceremoniesManquantes)} fiche${resultat.data.ceremoniesManquantes > 1 ? 's ont' : ' a'} été créée${resultat.data.ceremoniesManquantes > 1 ? 's' : ''} sans le détail de la cérémonie.\n\n` +
            'Les croyants existent et comptent parmi les nouveaux baptisés ; seuls ' +
            'le lieu et les célébrants manquent, et se complètent depuis chaque fiche.',
          { ton: 'information', titre: 'Enregistré, avec une réserve' },
        );
      }
    } finally {
      setEnCours(false);
    }
  }

  const pret =
    manquants.length === 0 && analyse.valides.length > 0 && !tropDeLignes && !enCours;

  return (
    <>
      <Button variant="outline" className="h-10" onClick={() => setOuvert(true)}>
        <Upload className="mr-2 size-4" aria-hidden />
        Importer une liste
      </Button>

      <Dialog open={ouvert} onOpenChange={(v) => (v ? setOuvert(true) : fermer())}>
        {/*
          `sm:max-w-none` EST INDISPENSABLE, pas décoratif : `DialogContent`
          porte `sm:max-w-sm` en base, et un `max-width` l'emporte toujours sur
          une `width`.
        */}
        <DialogContent className="max-h-[92vh] w-[min(96vw,64rem)] overflow-x-hidden overflow-y-auto sm:max-w-none">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {etape === 'rapport' ? 'Rapport d’import' : 'Importer des baptisés'}
            </DialogTitle>
            <DialogDescription>
              {etape === 'depot' &&
                'Un CSV ou un XLSX. Vous direz ensuite à quoi correspondent ses colonnes.'}
              {etape === 'correspondance' &&
                `${nomFichier} — ${formatNombre(donnees.length)} ligne${donnees.length > 1 ? 's' : ''} lue${donnees.length > 1 ? 's' : ''}.`}
              {etape === 'rapport' &&
                'Ce qui a été enregistré, et ce qui ne l’a pas été.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {erreur && (
              <Alert variant="destructive" role="alert">
                <AlertCircle className="size-4" aria-hidden />
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}

            {/* ---------- 1. Dépôt ---------- */}
            {etape === 'depot' && (
              <div className="space-y-6">
                <label className="border-border flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors hover:border-slate-300 hover:bg-slate-50">
                  <FileSpreadsheet className="text-muted-foreground size-8" aria-hidden />
                  <span className="space-y-1">
                    <span className="text-foreground block text-sm font-medium">
                      Choisir un fichier Excel ou CSV
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      .xlsx, .csv — la première feuille du classeur est lue.
                    </span>
                  </span>
                  <input
                    type="file"
                    accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void deposer(f);
                    }}
                  />
                </label>

                {/*
                  LE CANEVAS EST UNE AMORCE, PAS UNE CONTRAINTE — et l'ordre du
                  texte le dit : « aucun modèle à respecter » d'abord, le
                  fichier ensuite. L'inverse ferait croire à un format imposé, et
                  quelqu'un qui tient déjà sa liste la recopierait colonne par
                  colonne — le travail exact que cet import lui épargne.
                */}
                <Alert>
                  <Download className="size-4" aria-hidden />
                  <AlertTitle>Aucun modèle à respecter</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <span className="block">
                      Vos colonnes peuvent être dans n’importe quel ordre et porter vos
                      propres intitulés : l’étape suivante vous demandera à quoi elles
                      correspondent. La <strong>date du baptême ne s’y trouve pas</strong>{' '}
                      — elle vaut pour toute la cérémonie et se choisit à l’écran.
                    </span>

                    <span className="block">
                      <TelechargerCanevas canevas={CANEVAS_BAPTEMES} />
                      <span className="text-muted-foreground mt-2 block text-xs">
                        Si vous partez de zéro : les colonnes attendues, les obligatoires
                        marquées d’une étoile, deux lignes d’exemple et un guide de
                        remplissage.
                      </span>
                    </span>
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* ---------- 2. Correspondance et cérémonie ---------- */}
            {etape === 'correspondance' && (
              <>
                <section className="space-y-4">
                  <p className="eyebrow">La cérémonie</p>
                  <p className="text-muted-foreground text-sm">
                    Commune à tout le lot. Elle ne figure pas dans le fichier : l’y
                    répéter offrirait autant d’occasions de la contredire.
                  </p>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <Field label="Date du baptême" required>
                      {(aria) => (
                        <ChampDate
                          {...aria}
                          value={dateBapteme}
                          onChange={setDateBapteme}
                        />
                      )}
                    </Field>

                    <TextField
                      label="Lieu"
                      value={lieu}
                      onChange={(e) => setLieu(e.target.value)}
                      hint="Facultatif — rivière, temple, piscine…"
                    />

                    <TextField
                      label="Session"
                      value={sessionLibelle}
                      onChange={(e) => setSessionLibelle(e.target.value)}
                      hint="Facultatif — « Session de Pâques », par exemple."
                    />

                    <Field
                      label="Célébrant"
                      hint="Facultatif — un seul ici ; la fiche en accepte plusieurs."
                    >
                      {(aria) => (
                        <Select
                          value={celebrantIds[0] ?? 'aucun'}
                          onValueChange={(v) => setCelebrantIds(v === 'aucun' ? [] : [v])}
                        >
                          <SelectTrigger {...aria} className="h-10 w-full">
                            <SelectValue placeholder="Choisir" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="aucun">Aucun</SelectItem>
                            {celebrants.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.nom} {c.prenom} — {c.grade}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </Field>
                  </div>
                </section>

                <section className="space-y-4">
                  <p className="eyebrow">Vos colonnes</p>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-1/3">Champ attendu</TableHead>
                        <TableHead>Votre colonne</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {DESCRIPTION_BAPTEME.map((champ) => (
                        <TableRow key={champ.cle}>
                          <TableCell className="align-top">
                            <p className="text-sm font-medium">
                              {champ.label}
                              {champ.requis && (
                                <span className="text-destructive ml-1">*</span>
                              )}
                            </p>
                            {champ.aide && (
                              <p className="text-muted-foreground text-xs whitespace-normal">
                                {champ.aide}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={String(correspondance[champ.cle] ?? 'aucune')}
                              onValueChange={(v) =>
                                setCorrespondance((c) => ({
                                  ...c,
                                  [champ.cle]: v === 'aucune' ? null : Number(v),
                                }))
                              }
                            >
                              <SelectTrigger
                                className="h-9 w-full"
                                aria-label={`Colonne pour ${champ.label}`}
                              >
                                <SelectValue placeholder="Aucune" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="aucune">Aucune</SelectItem>
                                {entetes.map((entete, i) => (
                                  <SelectItem key={`${entete}-${i}`} value={String(i)}>
                                    {entete || `Colonne ${i + 1}`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </section>

                {/*
                  CE QUI SERA ÉCRIT, DIT AVANT DE L'ÉCRIRE. Le compte bouge
                  pendant qu'on corrige la correspondance : c'est ce qui permet
                  de voir qu'une colonne mal désignée fait chuter le nombre de
                  lignes retenues, au lieu de le découvrir après coup.
                */}
                {manquants.length > 0 ? (
                  <Alert variant="destructive">
                    <AlertCircle className="size-4" aria-hidden />
                    <AlertTitle>Colonnes obligatoires manquantes</AlertTitle>
                    <AlertDescription>
                      Désignez une colonne pour :{' '}
                      {manquants.map((c) => c.label).join(', ')}.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert>
                    <CircleCheck className="size-4" aria-hidden />
                    <AlertTitle>
                      {formatNombre(analyse.valides.length)} ligne
                      {analyse.valides.length > 1 ? 's' : ''} prête
                      {analyse.valides.length > 1 ? 's' : ''}
                      {analyse.erreurs.length > 0 &&
                        ` · ${formatNombre(analyse.erreurs.length)} écartée${analyse.erreurs.length > 1 ? 's' : ''}`}
                    </AlertTitle>
                    <AlertDescription>
                      {tropDeLignes ? (
                        <span className="text-destructive">
                          Un lot porte sur {LIGNES_LOT_MAX} baptisés au plus — c’est une
                          cérémonie, pas un registre. Scindez le fichier.
                        </span>
                      ) : (
                        'Rien ne sera écrit avant votre confirmation.'
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                {/*
                  LES LIGNES ÉCARTÉES SE NOMMENT, avec leur numéro DANS LE
                  TABLEUR : un compte global (« 28 sur 30 ») laisserait chercher
                  les deux manquantes dans une liste de trente noms.
                */}
                {analyse.erreurs.length > 0 && (
                  <section className="space-y-2">
                    <p className="eyebrow">Lignes écartées</p>
                    <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                      {analyse.erreurs.map((e, i) => (
                        <li
                          key={`${e.ligne}-${e.champ}-${i}`}
                          className="text-muted-foreground"
                        >
                          <span className="font-mono tabular-nums">Ligne {e.ligne}</span>{' '}
                          — {e.message}
                          {e.valeur && (
                            <span className="text-foreground"> « {e.valeur} »</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}

            {/* ---------- 3. Rapport ---------- */}
            {etape === 'rapport' && rapport && (
              <div className="space-y-6">
                {rapport.enregistres.length > 0 && (
                  <Alert>
                    <CircleCheck className="size-4" aria-hidden />
                    <AlertTitle>
                      {formatNombre(rapport.enregistres.length)} baptisé
                      {rapport.enregistres.length > 1 ? 's' : ''} enregistré
                      {rapport.enregistres.length > 1 ? 's' : ''}
                    </AlertTitle>
                    <AlertDescription>
                      <ul className="mt-2 space-y-1">
                        {rapport.enregistres.map((e) => (
                          <li key={e.matricule} className="text-sm">
                            <span className="font-mono text-xs">{e.matricule}</span> —{' '}
                            {e.nom}
                          </li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {rapport.refuses.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="size-4" aria-hidden />
                    <AlertTitle>
                      {formatNombre(rapport.refuses.length)} ligne
                      {rapport.refuses.length > 1 ? 's' : ''} refusée
                      {rapport.refuses.length > 1 ? 's' : ''}
                    </AlertTitle>
                    <AlertDescription>
                      <ul className="mt-2 space-y-1">
                        {rapport.refuses.map((r) => (
                          <li key={r.ligne} className="text-sm">
                            <span className="font-mono text-xs">Ligne {r.ligne}</span> —{' '}
                            {r.message}
                          </li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" className="h-10" onClick={fermer} disabled={enCours}>
              {etape === 'rapport' ? 'Fermer' : 'Annuler'}
            </Button>

            {etape === 'correspondance' && (
              <Button className="h-10" disabled={!pret} onClick={() => void importer()}>
                {enCours && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
                Enregistrer {formatNombre(analyse.valides.length)} baptisé
                {analyse.valides.length > 1 ? 's' : ''}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
