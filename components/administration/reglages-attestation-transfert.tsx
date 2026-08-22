'use client';

import { Loader2, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Field, TextField } from '@/components/shared/field';
import { avertir } from '@/components/shared/messages';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  reglerAttestationTransfert,
  supprimerLogoAttestation,
  televerserLogoAttestation,
} from '@/lib/actions/attestation-transfert';
import type { ParametresAttestation } from '@/lib/data/attestation-transfert';
import { CONTRAINTES_FICHIER } from '@/lib/storage/types';
import { appelerAction } from '@/lib/utils/appeler-action';

/**
 * Le gabarit réglable de l'attestation de transfert — EF-TRF-08, migration
 * `0070`.
 *
 * UN SEUL ENREGISTREMENT POUR LE TEXTE, UN ENVOI IMMÉDIAT POUR LE LOGO — même
 * distinction que `PhotoUploader` : le logo n'a pas de brouillon à confirmer,
 * son fichier existe ou n'existe pas.
 *
 * TEXTE BRUT, PAS ENRICHI. Contrairement aux modèles de courriel
 * (`EditeurRiche`), ce texte s'imprime sur un document A4 rendu à la main
 * (`imprimer-attestation.ts`) : il n'accepte aucune balise, seuls les sauts de
 * ligne traversent jusqu'au papier.
 */
export function ReglagesAttestationTransfert({
  parametres,
  logoUrl,
}: {
  parametres: ParametresAttestation;
  /** URL signée courante, ou `null` : la base ne stocke que la clé (règle 11). */
  logoUrl: string | null;
}) {
  const router = useRouter();

  const [texteCorps, setTexteCorps] = useState(parametres.texte_corps);
  const [mentionsLegales, setMentionsLegales] = useState(parametres.mentions_legales ?? '');
  const [cartoucheSignature, setCartoucheSignature] = useState(parametres.cartouche_signature);
  const [enCours, setEnCours] = useState(false);

  const modifie =
    texteCorps !== parametres.texte_corps ||
    mentionsLegales !== (parametres.mentions_legales ?? '') ||
    cartoucheSignature !== parametres.cartouche_signature;

  async function enregistrer() {
    setEnCours(true);
    const resultat = await appelerAction(() =>
      reglerAttestationTransfert({ texteCorps, mentionsLegales, cartoucheSignature }),
    );
    setEnCours(false);

    if (!resultat.ok) {
      avertir(resultat.error);
      return;
    }
    toast.success('Gabarit enregistré.');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-6 p-6">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Attestation de transfert
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Ce qui figure sur l’attestation définitive (EF-TRF-08) — la pièce de
              dossier consultée avant décision garde son texte de mise en garde, fixe
              et non réglable.
            </p>
          </div>

          <LogoAttestation logoUrl={logoUrl} />

          <Field
            label="Texte du corps"
            hint="Le paragraphe qui atteste le transfert. Un texte simple, sans mise en forme : c’est ce qui s’imprime tel quel."
          >
            {(aria) => (
              <Textarea
                {...aria}
                value={texteCorps}
                onChange={(e) => setTexteCorps(e.target.value)}
                rows={5}
              />
            )}
          </Field>

          <Field
            label="Mentions légales"
            hint="Facultatif. Imprimé en petit, sous la signature."
          >
            {(aria) => (
              <Textarea
                {...aria}
                value={mentionsLegales}
                onChange={(e) => setMentionsLegales(e.target.value)}
                rows={3}
              />
            )}
          </Field>

          <TextField
            label="Cartouche de signature"
            hint="Le libellé au-dessus du nom de celui qui a décidé."
            value={cartoucheSignature}
            onChange={(e) => setCartoucheSignature(e.target.value)}
          />

          <div className="flex justify-end">
            <Button className="h-10" onClick={enregistrer} disabled={enCours || !modifie}>
              {enCours && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              Enregistrer le gabarit
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LogoAttestation({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter();
  const champ = useRef<HTMLInputElement>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyer(fichier: File) {
    setEnCours(true);
    try {
      const formulaire = new FormData();
      formulaire.set('logo', fichier);

      const resultat = await televerserLogoAttestation(formulaire);
      if (!resultat.ok) {
        avertir(resultat.error);
        return;
      }
      toast.success('Logo enregistré.');
      router.refresh();
    } finally {
      setEnCours(false);
      if (champ.current) champ.current.value = '';
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-md border border-border p-4">
      <div className="flex h-16 w-32 shrink-0 items-center justify-center rounded border border-dashed border-border bg-muted/30">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL signée, hors de tout domaine connu à l'avance.
          <img src={logoUrl} alt="" className="max-h-14 max-w-28 object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">Aucun logo</span>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            ref={champ}
            type="file"
            accept={CONTRAINTES_FICHIER.photo.types.join(',')}
            className="sr-only"
            aria-label="Choisir un logo"
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              if (fichier) void envoyer(fichier);
            }}
          />

          <Button
            type="button"
            variant="outline"
            className="h-9"
            disabled={enCours}
            onClick={() => champ.current?.click()}
          >
            {enCours ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="mr-2 size-4" aria-hidden />
            )}
            {logoUrl ? 'Changer le logo' : 'Ajouter un logo'}
          </Button>

          {logoUrl && (
            <ConfirmDialog
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 text-destructive hover:text-destructive"
                  disabled={enCours}
                >
                  <Trash2 className="mr-2 size-4" aria-hidden />
                  Retirer
                </Button>
              }
              title="Retirer le logo ?"
              description="L’attestation reprendra son en-tête sans image. Le fichier est définitivement supprimé du stockage."
              confirmLabel="Retirer"
              onConfirm={async () => {
                const resultat = await supprimerLogoAttestation();
                if (!resultat.ok) {
                  avertir(resultat.error);
                  return;
                }
                toast.success('Logo retiré.');
                router.refresh();
              }}
            />
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {CONTRAINTES_FICHIER.photo.libelle}. Imprimé en tête de l’attestation
          définitive, jamais sur la pièce de dossier.
        </p>
      </div>
    </div>
  );
}
