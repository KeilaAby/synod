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
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Field } from '@/components/shared/field';
import { PermissionGate } from '@/components/shared/permission-gate';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { importerCroyants, type ResultatImport } from '@/lib/actions/import-croyants';
import { lireCsv, separerEntetes } from '@/lib/domain/csv';
import {
  type Correspondance,
  DESCRIPTION_CHAMPS,
  champsRequisManquants,
  deviner,
} from '@/lib/domain/import-croyants';
import { formatNombre } from '@/lib/utils/format';

/**
 * Import d'un lot de croyants — EF-CRO-11.
 *
 * TROIS TEMPS, dans cet ordre : on dépose, on dit à quoi correspondent les
 * colonnes, on lit le rapport. Rien n'est écrit avant le dernier.
 *
 * LA CORRESPONDANCE EST DEMANDÉE, PAS IMPOSÉE. Un modèle de fichier à
 * respecter obligerait à recopier dans nos colonnes un registre qui existe
 * déjà. On lit les entêtes, on propose une correspondance, et l'utilisateur la
 * corrige — une fois, pour tout le fichier.
 *
 * Le format est le CSV, qu'un tableur produit en deux clics. Le XLSX viendra
 * si les fichiers réels l'exigent : c'est un format compressé qui demande une
 * bibliothèque, et les deux candidates posent chacune un problème — l'une est
 * figée avec des vulnérabilités connues, l'autre pèse un mégaoctet pour un
 * besoin de lecture.
 */

type Etape = 'depot' | 'correspondance' | 'rapport';

export function ImportCroyantsDialog() {
  const router = useRouter();
  const champFichier = useRef<HTMLInputElement>(null);

  const [ouvert, setOuvert] = useState(false);
  const [etape, setEtape] = useState<Etape>('depot');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const [nomFichier, setNomFichier] = useState('');
  const [entetes, setEntetes] = useState<string[]>([]);
  const [donnees, setDonnees] = useState<string[][]>([]);
  const [correspondance, setCorrespondance] = useState<Correspondance>({});
  const [resultat, setResultat] = useState<ResultatImport | null>(null);

  const manquants = useMemo(
    () => champsRequisManquants(correspondance),
    [correspondance],
  );

  function fermer() {
    setOuvert(false);
    setEtape('depot');
    setErreur(null);
    setNomFichier('');
    setEntetes([]);
    setDonnees([]);
    setCorrespondance({});
    setResultat(null);
    if (champFichier.current) champFichier.current.value = '';
  }

  async function deposer(fichier: File) {
    setErreur(null);

    try {
      const texte = await fichier.text();
      const { entetes: e, donnees: d } = separerEntetes(lireCsv(texte));

      if (e.length === 0 || d.length === 0) {
        setErreur('Ce fichier ne contient aucune ligne exploitable.');
        return;
      }

      setNomFichier(fichier.name);
      setEntetes(e);
      setDonnees(d);
      // Une proposition, jamais une décision : elle se corrige à l'écran.
      setCorrespondance(deviner(e));
      setEtape('correspondance');
    } catch {
      setErreur("Ce fichier n'a pas pu être lu. Enregistrez-le au format CSV.");
    }
  }

  async function importer() {
    setEnCours(true);
    setErreur(null);

    const reponse = await importerCroyants({ correspondance, lignes: donnees });
    setEnCours(false);

    if (!reponse.ok) {
      setErreur(reponse.error);
      return;
    }

    setResultat(reponse.data);
    setEtape('rapport');

    if (reponse.data.importes > 0) {
      toast.success(
        `${formatNombre(reponse.data.importes)} croyant${reponse.data.importes > 1 ? 's' : ''} importé${reponse.data.importes > 1 ? 's' : ''}.`,
      );
      router.refresh();
    }
  }

  const refusees = (resultat?.erreurs.length ?? 0) + (resultat?.echecs.length ?? 0);

  return (
    <>
      <PermissionGate perm="croyant.create">
        <Button variant="outline" className="h-10" onClick={() => setOuvert(true)}>
          <Upload className="mr-2 size-4" aria-hidden />
          Importer
        </Button>
      </PermissionGate>

      <Dialog open={ouvert} onOpenChange={(v) => (v ? setOuvert(true) : fermer())}>
        <DialogContent className="max-h-[92vh] w-[min(96vw,72rem)] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Importer des croyants</DialogTitle>
            <DialogDescription>
              {etape === 'depot' &&
                'Déposez un fichier CSV : rien ne sera écrit avant votre confirmation.'}
              {etape === 'correspondance' &&
                `${nomFichier} — ${formatNombre(donnees.length)} ligne${donnees.length > 1 ? 's' : ''} lue${donnees.length > 1 ? 's' : ''}.`}
              {etape === 'rapport' && 'Résultat de l’import.'}
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
                      Choisir un fichier CSV
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      Depuis Excel : Fichier › Enregistrer sous › CSV UTF-8.
                    </span>
                  </span>
                  <input
                    ref={champFichier}
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(e) => {
                      const fichier = e.target.files?.[0];
                      if (fichier) void deposer(fichier);
                    }}
                  />
                </label>

                <Alert>
                  <Download className="size-4" aria-hidden />
                  <AlertTitle>Aucun modèle à respecter</AlertTitle>
                  <AlertDescription>
                    Vos colonnes peuvent être dans n’importe quel ordre et porter vos
                    propres intitulés : l’étape suivante vous demandera à quoi elles
                    correspondent. Les églises, grades et nationalités se reconnaissent
                    par leur nom ou par leur code.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* ---------- 2. Correspondance ---------- */}
            {etape === 'correspondance' && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {DESCRIPTION_CHAMPS.map((champ) => (
                    <Field
                      key={champ.cle}
                      label={champ.label}
                      required={champ.requis}
                      hint={champ.aide}
                    >
                      {(aria) => (
                        <Select
                          value={
                            correspondance[champ.cle] == null
                              ? 'aucune'
                              : String(correspondance[champ.cle])
                          }
                          onValueChange={(v) =>
                            setCorrespondance((c) => ({
                              ...c,
                              [champ.cle]: v === 'aucune' ? null : Number(v),
                            }))
                          }
                        >
                          <SelectTrigger {...aria} className="h-10 w-full">
                            <SelectValue placeholder="Non fournie" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="aucune">Non fournie</SelectItem>
                            {entetes.map((entete, i) => (
                              <SelectItem key={i} value={String(i)}>
                                {entete || `Colonne ${i + 1}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </Field>
                  ))}
                </div>

                {manquants.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="size-4" aria-hidden />
                    <AlertTitle>Colonnes obligatoires non désignées</AlertTitle>
                    <AlertDescription>
                      {manquants.map((m) => m.label).join(', ')}.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Un aperçu vaut mieux qu'une promesse : on voit tout de suite
                    si les colonnes ont été décalées d'un cran. */}
                <Apercu
                  entetes={entetes}
                  lignes={donnees.slice(0, 3)}
                  correspondance={correspondance}
                />
              </div>
            )}

            {/* ---------- 3. Rapport ---------- */}
            {etape === 'rapport' && resultat && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Card>
                    <CardContent className="flex items-center gap-4 p-6">
                      <CircleCheck
                        className="size-8 shrink-0 text-emerald-600"
                        aria-hidden
                      />
                      <div>
                        <p className="text-foreground font-mono text-2xl font-bold tabular-nums">
                          {formatNombre(resultat.importes)}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          croyant{resultat.importes > 1 ? 's' : ''} enregistré
                          {resultat.importes > 1 ? 's' : ''}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="flex items-center gap-4 p-6">
                      <AlertCircle
                        className={`size-8 shrink-0 ${refusees > 0 ? 'text-rose-600' : 'text-muted-foreground'}`}
                        aria-hidden
                      />
                      <div>
                        <p className="text-foreground font-mono text-2xl font-bold tabular-nums">
                          {formatNombre(refusees)}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          ligne{refusees > 1 ? 's' : ''} refusée{refusees > 1 ? 's' : ''}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {refusees > 0 && (
                  <section className="space-y-3">
                    <p className="eyebrow">Lignes refusées</p>
                    <p className="text-muted-foreground text-sm">
                      Les numéros renvoient aux lignes de données de votre fichier, entête
                      non comprise. Corrigez-les et réimportez : les croyants déjà
                      enregistrés ne seront pas dupliqués.
                    </p>

                    <Card>
                      <CardContent className="max-h-72 overflow-y-auto p-0">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="w-20">Ligne</TableHead>
                              <TableHead className="w-40">Champ</TableHead>
                              <TableHead>Motif</TableHead>
                              <TableHead>Valeur lue</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {resultat.erreurs.map((e, i) => (
                              <TableRow key={`a${i}`} className="h-10">
                                <TableCell className="font-mono tabular-nums">
                                  {e.ligne}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-xs">
                                  {e.champ ?? '—'}
                                </TableCell>
                                <TableCell className="text-sm">{e.message}</TableCell>
                                <TableCell className="text-muted-foreground max-w-40 truncate font-mono text-xs">
                                  {e.valeur}
                                </TableCell>
                              </TableRow>
                            ))}
                            {resultat.echecs.map((e, i) => (
                              <TableRow key={`b${i}`} className="h-10">
                                <TableCell className="font-mono tabular-nums">
                                  {e.ligne}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-xs">
                                  base
                                </TableCell>
                                <TableCell className="text-sm" colSpan={2}>
                                  {e.message}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </section>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" className="h-10" onClick={fermer} disabled={enCours}>
              {etape === 'rapport' ? 'Fermer' : 'Annuler'}
            </Button>

            {etape === 'correspondance' && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-10"
                  onClick={() => setEtape('depot')}
                  disabled={enCours}
                >
                  Changer de fichier
                </Button>
                <Button
                  className="h-10"
                  onClick={importer}
                  disabled={enCours || manquants.length > 0}
                >
                  {enCours && (
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  )}
                  Analyser et importer
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Les trois premières lignes, telles qu'elles seront comprises. */
function Apercu({
  entetes,
  lignes,
  correspondance,
}: {
  entetes: string[];
  lignes: string[][];
  correspondance: Correspondance;
}) {
  const designees = DESCRIPTION_CHAMPS.filter((c) => correspondance[c.cle] != null);

  if (designees.length === 0) return null;

  return (
    <section className="space-y-3">
      <p className="eyebrow">Aperçu des trois premières lignes</p>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {designees.map((c) => (
                  <TableHead key={c.cle} className="whitespace-nowrap">
                    {c.label}
                    <span className="text-muted-foreground ml-2 font-normal">
                      ← {entetes[correspondance[c.cle] as number] || '?'}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lignes.map((ligne, i) => (
                <TableRow key={i} className="h-10">
                  {designees.map((c) => (
                    <TableCell
                      key={c.cle}
                      className="max-w-40 truncate text-sm whitespace-nowrap"
                    >
                      {ligne[correspondance[c.cle] as number] ?? ''}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
