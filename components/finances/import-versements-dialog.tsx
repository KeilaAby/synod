'use client';

import { AlertCircle, CircleCheck, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Field } from '@/components/shared/field';
import { avertir } from '@/components/shared/messages';
import { EntityPicker, type OptionEntite } from '@/components/structure/entity-picker';
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
import { Input } from '@/components/ui/input';
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
import {
  type ResultatImportVersements,
  importerVersementsDime,
} from '@/lib/actions/dimes';
import { lireCsv, separerEntetes } from '@/lib/domain/csv';
import { EVENEMENTS_DIME, LIBELLES_EVENEMENT } from '@/lib/domain/dime';
import {
  type CorrespondanceVersement,
  DESCRIPTION_VERSEMENT,
  champsVersementManquants,
  devinerVersement,
} from '@/lib/domain/import-dimes';
import { formatNombre } from '@/lib/utils/format';

/**
 * Import d'une feuille de versements — EF-FIN-34.
 *
 * TROIS TEMPS, dans cet ordre : on dépose, on dit à quoi correspondent les
 * colonnes, on lit le rapport. Rien n'est écrit avant le dernier.
 *
 * LA CORRESPONDANCE EST DEMANDÉE, PAS IMPOSÉE. Un modèle de fichier à respecter
 * obligerait à recopier dans nos colonnes un cahier de caisse qui existe déjà.
 * On lit les entêtes, on propose, l'utilisateur corrige — une fois, pour tout
 * le fichier.
 *
 * AUCUNE LIGNE PORTANT UN MONTANT N'EST REJETÉE. Elle représente de l'argent
 * déjà reçu : l'enveloppe est dans l'urne, elle ne disparaîtra pas parce que le
 * fichier est imparfait.
 */
type Etape = 'depot' | 'correspondance' | 'rapport';

export function ImportVersementsDialog({
  entites,
}: {
  entites: OptionEntite[];
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [etape, setEtape] = useState<Etape>('depot');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const [nomFichier, setNomFichier] = useState('');
  const [entetes, setEntetes] = useState<string[]>([]);
  const [donnees, setDonnees] = useState<string[][]>([]);
  const [correspondance, setCorrespondance] = useState<CorrespondanceVersement>({});
  const [rapport, setRapport] = useState<ResultatImportVersements | null>(null);

  // --- L'en-tête de la collecte : le fichier ne porte que des lignes ---
  const [entiteId, setEntiteId] = useState<string | null>(null);
  const [dateOperation, setDateOperation] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [evenement, setEvenement] = useState<string>('CULTE');
  const [libelle, setLibelle] = useState('');

  const manquants = useMemo(
    () => champsVersementManquants(correspondance),
    [correspondance],
  );

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
       * LE XLSX EST CHARGÉ À LA DEMANDE.
       *
       * C'est un lecteur d'archive ZIP : il n'a rien à faire dans le paquet de
       * ceux qui déposent un CSV — et le CSV reste le cas courant (règle 7).
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
      setCorrespondance(devinerVersement(e));
      setEtape('correspondance');
    } catch {
      setErreur(
        'Ce fichier n’a pas pu être lu. Attendus : CSV, ou XLSX à une seule feuille.',
      );
    }
  }

  async function importer() {
    if (!entiteId) {
      setErreur('Choisissez l’entité qui a collecté.');
      return;
    }

    setErreur(null);
    setEnCours(true);

    try {
      const resultat = await importerVersementsDime({
        entiteCollecteId: entiteId,
        dateOperation,
        evenement,
        libelle,
        reference: nomFichier,
        correspondance,
        lignes: donnees,
      });

      if (!resultat.ok) {
        setErreur(resultat.error);
        return;
      }

      setRapport(resultat.data);
      setEtape('rapport');
      toast.success(
        `${formatNombre(resultat.data.enregistrees)} versement${resultat.data.enregistrees > 1 ? 's' : ''} importé${resultat.data.enregistrees > 1 ? 's' : ''}.`,
      );

      /**
       * CE QUI RESTE À FAIRE SE DIT DANS UN POP-UP (règle 30).
       *
       * Des lignes à rapprocher ne sont pas une erreur — l'argent est compté —
       * mais un travail qui attend. Le taire les laisserait dormir.
       */
      if (resultat.data.aRapprocher > 0) {
        avertir(
          `${formatNombre(resultat.data.aRapprocher)} ligne${resultat.data.aRapprocher > 1 ? 's' : ''} porte${resultat.data.aRapprocher > 1 ? 'nt' : ''} un nom qu’aucune fiche ne reconnaît.\n\n` +
            'Les montants sont enregistrés — l’argent est reçu. Seuls les noms ' +
            'attendent d’être retrouvés, dans la page Croyants.',
          { ton: 'information', titre: 'Des noms restent à rapprocher' },
        );
      }
    } finally {
      setEnCours(false);
    }
  }

  return (
    <>
      <Button variant="outline" className="h-10" onClick={() => setOuvert(true)}>
        <Upload className="mr-2 size-4" aria-hidden />
        Importer une feuille
      </Button>

      <Dialog open={ouvert} onOpenChange={(v) => (v ? setOuvert(true) : fermer())}>
        {/*
          `sm:max-w-none` EST INDISPENSABLE, pas décoratif : `DialogContent`
          porte `sm:max-w-sm` en base, et un `max-width` l'emporte toujours sur
          une `width`. Sans lui, ce pop-up demandait 56 rem et s'affichait à 24.
        */}
        <DialogContent className="max-h-[92vh] w-[min(96vw,64rem)] overflow-x-hidden overflow-y-auto sm:max-w-none">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {etape === 'rapport' ? 'Rapport d’import' : 'Importer une feuille de versements'}
            </DialogTitle>
            <DialogDescription>
              {etape === 'depot' &&
                'Un CSV ou un XLSX. Vous direz ensuite à quoi correspondent ses colonnes.'}
              {etape === 'correspondance' &&
                'Seul le montant est obligatoire : une feuille peut ne porter que des versements anonymes.'}
              {etape === 'rapport' && 'Ce qui a été enregistré, et ce qui reste à faire.'}
            </DialogDescription>
          </DialogHeader>

          <div className="min-w-0 space-y-6 py-2">
            {erreur && (
              <Alert variant="destructive" role="alert">
                <AlertCircle className="size-4" aria-hidden />
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}

            {/* --- 1. Le dépôt --- */}
            {etape === 'depot' && (
              <Field
                label="Fichier"
                required
                hint="CSV, ou XLSX à une seule feuille. Rien n’est écrit à ce stade."
              >
                {(aria) => (
                  <Input
                    {...aria}
                    type="file"
                    accept=".csv,.xlsx,text/csv"
                    className="h-10"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void deposer(f);
                    }}
                  />
                )}
              </Field>
            )}

            {/* --- 2. La correspondance, et l'en-tête de la collecte --- */}
            {etape === 'correspondance' && (
              <>
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <FileSpreadsheet className="size-4" aria-hidden />
                  {nomFichier} — {formatNombre(donnees.length)} ligne
                  {donnees.length > 1 ? 's' : ''}
                </p>

                <div className="grid gap-6 md:grid-cols-2">
                  <Field label="Entité collectrice" required>
                    {(aria) => (
                      <EntityPicker
                        {...aria}
                        options={entites}
                        value={entiteId}
                        onChange={setEntiteId}
                        placeholder="Choisir une entité"
                        emptyMessage="Aucune entité dans votre périmètre."
                      />
                    )}
                  </Field>

                  <Field label="Date du culte" required>
                    {(aria) => (
                      <Input
                        {...aria}
                        type="date"
                        value={dateOperation}
                        onChange={(e) => setDateOperation(e.target.value)}
                        className="h-10 tabular-nums"
                      />
                    )}
                  </Field>

                  <Field label="Événement" required>
                    {(aria) => (
                      <Select value={evenement} onValueChange={setEvenement}>
                        <SelectTrigger {...aria} className="h-10 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EVENEMENTS_DIME.map((e) => (
                            <SelectItem key={e} value={e}>
                              {LIBELLES_EVENEMENT[e]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </Field>

                  <Field label="Libellé" hint="Facultatif.">
                    {(aria) => (
                      <Input
                        {...aria}
                        value={libelle}
                        onChange={(e) => setLibelle(e.target.value)}
                        placeholder="Culte du dimanche matin"
                        className="h-10"
                      />
                    )}
                  </Field>
                </div>

                <div className="space-y-2">
                  <p className="eyebrow">Correspondance des colonnes</p>

                  <div className="border-border min-w-0 rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Champ attendu</TableHead>
                          <TableHead>Colonne du fichier</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {DESCRIPTION_VERSEMENT.map((champ) => (
                          <TableRow
                            key={champ.cle}
                            className="hover:bg-transparent has-aria-expanded:bg-transparent"
                          >
                            <TableCell className="text-sm">
                              {champ.label}
                              {champ.requis && (
                                <span className="text-destructive ml-1">*</span>
                              )}
                              {champ.aide && (
                                <span className="text-muted-foreground block text-xs">
                                  {champ.aide}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
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
                                <SelectTrigger className="h-9 w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="aucune">— non fournie</SelectItem>
                                  {entetes.map((e, i) => (
                                    <SelectItem key={`${e}-${i}`} value={String(i)}>
                                      {e || `Colonne ${i + 1}`}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {manquants.length > 0 && (
                    <p className="text-destructive text-xs">
                      Il manque : {manquants.map((c) => c.label).join(', ')}.
                    </p>
                  )}
                </div>
              </>
            )}

            {/* --- 3. Le rapport --- */}
            {etape === 'rapport' && rapport && (
              <div className="space-y-4">
                <Alert>
                  <CircleCheck className="size-4" aria-hidden />
                  <AlertTitle>
                    {formatNombre(rapport.enregistrees)} versement
                    {rapport.enregistrees > 1 ? 's' : ''} enregistré
                    {rapport.enregistrees > 1 ? 's' : ''}
                  </AlertTitle>
                  <AlertDescription>
                    {formatNombre(rapport.recus)} reçu{rapport.recus > 1 ? 's' : ''}{' '}
                    attribué{rapport.recus > 1 ? 's' : ''} — un reçu n’est émis que
                    pour un versement nominatif.
                  </AlertDescription>
                </Alert>

                {rapport.aRapprocher > 0 && (
                  <Alert>
                    <AlertCircle className="size-4" aria-hidden />
                    <AlertTitle>
                      {formatNombre(rapport.aRapprocher)} nom
                      {rapport.aRapprocher > 1 ? 's' : ''} à rapprocher
                    </AlertTitle>
                    <AlertDescription>
                      Les montants sont comptés — l’argent est reçu. Ces lignes
                      portent un nom qu’aucune fiche ne reconnaît : elles vous
                      attendent dans la page Croyants.
                    </AlertDescription>
                  </Alert>
                )}

                {rapport.ecartees.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="size-4" aria-hidden />
                    <AlertTitle>
                      {formatNombre(rapport.ecartees.length)} ligne
                      {rapport.ecartees.length > 1 ? 's' : ''} écartée
                      {rapport.ecartees.length > 1 ? 's' : ''}
                    </AlertTitle>
                    <AlertDescription>
                      <ul className="mt-2 space-y-1">
                        {rapport.ecartees.slice(0, 20).map((e) => (
                          <li key={e.ligne} className="text-sm">
                            <span className="font-mono text-xs tabular-nums">
                              Ligne {e.ligne}
                            </span>
                            {' — '}
                            {e.motif}
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
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={fermer}
              disabled={enCours}
            >
              {etape === 'rapport' ? 'Fermer' : 'Annuler'}
            </Button>

            {etape === 'correspondance' && (
              <Button
                type="button"
                className="h-10"
                onClick={() => void importer()}
                disabled={enCours || manquants.length > 0 || !entiteId}
              >
                {enCours ? (
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                ) : (
                  <Upload className="mr-2 size-4" aria-hidden />
                )}
                Importer {formatNombre(donnees.length)} ligne
                {donnees.length > 1 ? 's' : ''}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
