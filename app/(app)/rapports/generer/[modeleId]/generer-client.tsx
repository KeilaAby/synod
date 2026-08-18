'use client';

import { AlertCircle, FileText, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Field, TextField } from '@/components/shared/field';
import { EmptyState } from '@/components/shared/empty-state';
import { EntityPicker, type OptionEntite } from '@/components/structure/entity-picker';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { genererRapport } from '@/lib/actions/rapports';
import { appelerAction } from '@/lib/utils/appeler-action';

/**
 * EF-RAP-12 — le formulaire de generation.
 *
 * LES PERIODES COURANTES SONT PROPOSEES. « Le mois dernier », « le trimestre
 * ecoule » : ce sont les trois quarts des rapports produits, et les saisir a la
 * main deux fois par mois est une occasion de se tromper d'un jour — un jour
 * qui, sur une borne de periode, deplace des mouvements d'un rapport a l'autre.
 * Les champs restent modifiables : le raccourci ne remplace pas le choix.
 */

/** Le premier et le dernier jour d'un mois, en `AAAA-MM-JJ`. */
function bornesDuMois(decalage: number): { debut: string; fin: string } {
  const aujourdhui = new Date();
  const premier = new Date(
    Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth() + decalage, 1),
  );
  // Le jour 0 du mois suivant EST le dernier jour du mois courant : c'est la
  // seule formulation qui ne se trompe ni en fevrier ni sur une annee bissextile.
  const dernier = new Date(Date.UTC(premier.getUTCFullYear(), premier.getUTCMonth() + 1, 0));

  return {
    debut: premier.toISOString().slice(0, 10),
    fin: dernier.toISOString().slice(0, 10),
  };
}

function bornesDuTrimestre(decalage: number): { debut: string; fin: string } {
  const aujourdhui = new Date();
  const trimestre = Math.floor(aujourdhui.getUTCMonth() / 3) + decalage;
  const premier = new Date(Date.UTC(aujourdhui.getUTCFullYear(), trimestre * 3, 1));
  const dernier = new Date(Date.UTC(premier.getUTCFullYear(), premier.getUTCMonth() + 3, 0));

  return {
    debut: premier.toISOString().slice(0, 10),
    fin: dernier.toISOString().slice(0, 10),
  };
}

const RACCOURCIS = [
  { libelle: 'Ce mois-ci', bornes: () => bornesDuMois(0) },
  { libelle: 'Le mois dernier', bornes: () => bornesDuMois(-1) },
  { libelle: 'Ce trimestre', bornes: () => bornesDuTrimestre(0) },
  { libelle: 'Le trimestre dernier', bornes: () => bornesDuTrimestre(-1) },
];

export function GenererClient({
  modeleId,
  modeleNom,
  entites,
  entiteParDefaut,
}: {
  modeleId: string;
  modeleNom: string;
  entites: OptionEntite[];
  entiteParDefaut: string | null;
}) {
  const router = useRouter();
  const depart = bornesDuMois(-1);

  const [entityId, setEntityId] = useState<string | null>(entiteParDefaut);
  const [debut, setDebut] = useState(depart.debut);
  const [fin, setFin] = useState(depart.fin);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  if (entites.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Aucune entité ne peut recevoir ce rapport"
        description={`« ${modeleNom} » ne s’applique à aucune entité de votre périmètre sur laquelle vous détenez le droit de générer. Le modèle déclare peut-être des niveaux qui ne vous concernent pas.`}
      />
    );
  }

  async function generer() {
    setEnCours(true);
    setErreur(null);

    const resultat = await appelerAction(() =>
      genererRapport({ modeleId, entityId, debut, fin }),
    );

    if (!resultat.ok) {
      setEnCours(false);
      setErreur(resultat.error);
      return;
    }

    /**
     * On ne relache PAS l'attente avant la navigation.
     *
     * Le rapport est écrit : rendre le bouton au repos pendant que la page
     * suivante se charge inviterait à recliquer, et une seconde génération
     * produirait un second rapport — identique, et impossible à distinguer.
     */
    router.push(`/rapports/generes/${resultat.data.id}`);
  }

  return (
    <Card className="max-w-2xl">
      <CardContent className="space-y-6 p-6">
        {erreur && (
          <Alert variant="destructive" role="alert">
            <AlertCircle className="size-4" aria-hidden />
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}

        <Field
          label="Entité"
          required
          hint="Le rapport portera sur cette entité et tout ce qu’elle contient."
        >
          {(aria) => (
            <EntityPicker
              {...aria}
              options={entites}
              value={entityId}
              onChange={setEntityId}
              placeholder="Choisir l'entité"
              emptyMessage="Aucune entité éligible."
            />
          )}
        </Field>

        <div className="flex flex-wrap gap-2">
          {RACCOURCIS.map((raccourci) => (
            <Button
              key={raccourci.libelle}
              variant="outline"
              className="h-10"
              onClick={() => {
                const bornes = raccourci.bornes();
                setDebut(bornes.debut);
                setFin(bornes.fin);
              }}
            >
              {raccourci.libelle}
            </Button>
          ))}
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <TextField
            label="Début de période"
            required
            type="date"
            className="tabular-nums"
            value={debut}
            onChange={(e) => setDebut(e.target.value)}
          />
          <TextField
            label="Fin de période"
            required
            type="date"
            className="tabular-nums"
            hint="Les deux bornes sont incluses."
            value={fin}
            onChange={(e) => setFin(e.target.value)}
          />
        </div>

        {/* Dire ce qui va se passer AVANT de le faire : un rapport généré ne se
            modifie plus (RG-27), il se régénère. */}
        <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          Les données seront <strong>figées</strong> au moment de la génération : le
          rapport restera identique même si les chiffres changent ensuite. Pour le mettre
          à jour, on en génère un nouveau.
        </p>

        <div className="flex justify-end">
          <Button
            className="h-10"
            onClick={generer}
            disabled={enCours || !entityId || fin < debut}
          >
            {enCours && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            Générer le rapport
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
