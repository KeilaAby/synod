import type { Metadata } from 'next';
import { WifiOff } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CertificatBaptemeBouton } from '@/components/baptemes/certificat-bapteme-bouton';
import { ModifierCroyantDialog } from '@/components/croyants/croyant-dialog';
import { HistoriqueCroyant } from '@/components/croyants/historique-croyant';
import { OngletsFiche } from '@/components/croyants/onglets-fiche';
import { PhotoUploader } from '@/components/croyants/photo-uploader';
import { VersementsCroyant } from '@/components/croyants/versements-croyant';
import { TransfertBouton } from '@/components/transferts/transfert-bouton';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge, TON_CROYANT } from '@/components/shared/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { getCroyant } from '@/lib/data/croyants';
import { getOptionsCroyant } from '@/lib/data/croyant-options';
import { getArbrePerimetre, cheminLisible, indexerParChemin } from '@/lib/data/entities';
import { chargerVersementsDuCroyant } from '@/lib/data/dimes';
import { signerPhotos } from '@/lib/data/photos';
import { getParametres } from '@/lib/data/settings';
import { fonctionsDuCroyant } from '@/lib/data/bureaux';
import { transfertsDuCroyant } from '@/lib/data/transferts';
import { historiqueGradesDuCroyant, promotionDuCroyant } from '@/lib/data/promotions';
import { construireHistorique } from '@/lib/domain/historique';
import {
  LIBELLES_SEXE,
  LIBELLES_STATUT_CROYANT,
  LIBELLES_STATUT_MARITAL,
  type StatutCroyant,
  type StatutMarital,
  calculerAge,
  estNouveauBaptise,
  nomComplet,
} from '@/lib/domain/croyant';
import { formatDateLongue } from '@/lib/utils/format';

type Params = { params: Promise<{ croyantId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { croyantId } = await params;
  const croyant = await getCroyant(croyantId);
  return {
    title: croyant ? nomComplet(croyant.nom, croyant.prenom) : 'Croyant',
  };
}

/** EF-CRO-06 — fiche complète du croyant. */
export default async function FicheCroyantPage({ params }: Params) {
  const { croyantId } = await params;

  const croyant = await getCroyant(croyantId);
  if (!croyant) notFound();

  // Sept lectures INDÉPENDANTES, donc une seule attente : ce qui coûte, c'est
  // le nombre d'allers-retours, pas leur durée (règle 28).
  const [
    arbre,
    options,
    photos,
    transferts,
    mandats,
    versements,
    parametres,
    grades,
    promotion,
  ] = await Promise.all([
    getArbrePerimetre(),
    getOptionsCroyant(),
    signerPhotos([croyant.photo_key]),
    // EF-TRF-08 — l'historique complet des transferts du croyant.
    transfertsDuCroyant(croyantId),
    // EF-BUR-10 — les fonctions occupees, toutes entites confondues.
    fonctionsDuCroyant(croyantId),
    // EF-FIN-35 — ses versements de dime, avec le numero d'enveloppe du jour.
    chargerVersementsDuCroyant(croyantId),
    getParametres(),
    // EF-CRO-12 — les changements de grade, avec leur operateur et leur
    // validateur. Une correction de saisie ne figure pas ici : elle n a
    // rien inscrit.
    historiqueGradesDuCroyant(croyantId),
    // EF-CRO-12 — sans elle, le circuit est incomprehensible : on change le
    // grade, on enregistre, et la fiche affiche toujours l'ancien.
    promotionDuCroyant(croyantId),
  ]);

  const evenements = construireHistorique(croyant, transferts, mandats, grades);
  const index = indexerParChemin(arbre);
  const eglise = arbre.find((e) => e.id === croyant.eglise_id);

  const age = calculerAge(new Date(croyant.date_naissance));
  // La date de bapteme est facultative : sans elle, la question ne se pose pas.
  const nouveauBaptise = estNouveauBaptise(
    croyant.date_bapteme ? new Date(croyant.date_bapteme) : null,
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={eglise ? cheminLisible(eglise, index) : 'Croyant'}
        title={nomComplet(croyant.nom, croyant.prenom)}
        description={`Matricule ${croyant.matricule}`}
        /*
          LE PORTRAIT ET LE NOM SE LISENT ENSEMBLE — 26 aout 2026.

          Ils vivaient dans deux blocs successifs : le nom en en-tete, la photo
          dans une bande en dessous, avec les badges. Il fallait donc regarder
          deux endroits pour savoir de qui parle la page — et sur un ecran
          etroit, le visage passait sous la ligne de flottaison.
        */
        visuel={
          /* EF-CRO-09 — l'avatar a initiales reste le repli. */
          <PhotoUploader
            croyantId={croyant.id}
            nom={croyant.nom}
            prenom={croyant.prenom}
            urlPhoto={croyant.photo_key ? (photos.get(croyant.photo_key) ?? null) : null}
            peutModifier={Boolean(eglise)}
          />
        }
        /*
          LES BADGES QUALIFIENT LE NOM, ils ne sont pas une section a part : un
          croyant transfere ou un nouveau baptise se lit AVEC son nom, pas trois
          centimetres plus bas.
        */
        sous={
          <>
            <StatusBadge tone={TON_CROYANT[croyant.statut] ?? 'neutral'}>
              {LIBELLES_STATUT_CROYANT[croyant.statut as StatutCroyant] ?? croyant.statut}
            </StatusBadge>

            {/* RG-30 — fenêtre paramétrable. */}
            {nouveauBaptise && <StatusBadge tone="accent">Nouveau baptisé</StatusBadge>}

            {eglise?.sans_acces_application && (
              <StatusBadge tone="warning">
                <WifiOff className="mr-1 size-3" aria-hidden />
                Église sans accès à l&apos;application
              </StatusBadge>
            )}
          </>
        }
        actions={
          eglise && (
            <>
              {/* EF-TRF-01 — en pop-up : la page /transferer n'a jamais existé,
                  le lien qui y menait était mort. */}
              <TransfertBouton
                scope={eglise.path}
                eglises={options.eglises.filter((e) => e.id !== croyant.eglise_id)}
                cellules={options.cellules}
                croyant={{
                  id: croyant.id,
                  nom: croyant.nom,
                  prenom: croyant.prenom,
                  matricule: croyant.matricule,
                  egliseId: croyant.eglise_id,
                  egliseNom: croyant.eglise?.nom ?? '—',
                  eglisePath: eglise.path,
                  celluleId: croyant.cellule_id,
                  celluleNom: croyant.cellule?.nom ?? null,
                }}
              />

              <ModifierCroyantDialog
                scope={eglise.path}
                options={options}
                urlPhoto={
                  croyant.photo_key ? (photos.get(croyant.photo_key) ?? null) : null
                }
                croyant={{
                  id: croyant.id,
                  matricule: croyant.matricule,
                  nom: croyant.nom,
                  prenom: croyant.prenom,
                  sexe: croyant.sexe,
                  statut_marital: croyant.statut_marital,
                  email: croyant.email,
                  telephone: croyant.telephone,
                  date_naissance: croyant.date_naissance,
                  date_bapteme: croyant.date_bapteme,
                  adresse: croyant.adresse,
                  eglise_id: croyant.eglise_id,
                  cellule_id: croyant.cellule_id,
                  grade_id: croyant.grade_id,
                  nationalite_id: croyant.nationalite_id,
                  statut: croyant.statut as StatutCroyant,
                  egliseNom: croyant.eglise?.nom ?? '—',
                  conjoint_id: croyant.conjoint_id,
                }}
              />
            </>
          )
        }
      />

      {/*
        LES CINQ CARTES S'EMPILAIENT — 26 aout 2026.

        Sur une fiche complete, la frise se trouvait a trois ecrans de
        defilement du nom, et l'on y descendait en passant devant tout le
        reste, a chaque fois. Ces sections NE SE COMPARENT PAS entre elles :
        on vient pour l'une d'elles, on sait laquelle en arrivant.

        Le portrait et le nom, eux, restent AU-DESSUS : ils ne se cachent
        jamais, quel que soit l'onglet ouvert.
      */}
      <OngletsFiche
        onglets={[
          {
            cle: 'fiche',
            libelle: 'Fiche',
            contenu: (
              <>
                <div className="grid gap-4 lg:grid-cols-3">
                  <Card>
                    <CardContent className="space-y-6 p-6">
                      <p className="eyebrow">Identité</p>
                      <dl className="space-y-4">
                        <Donnee
                          libelle="Nom"
                          valeur={croyant.nom.toLocaleUpperCase('fr')}
                        />
                        <Donnee libelle="Prénom" valeur={croyant.prenom} />
                        <Donnee libelle="Sexe" valeur={LIBELLES_SEXE[croyant.sexe]} />
                        <Donnee
                          libelle="Date de naissance"
                          valeur={`${formatDateLongue(croyant.date_naissance)} · ${age} ans`}
                        />
                        <Donnee
                          libelle="Statut marital"
                          valeur={
                            croyant.statut_marital
                              ? (LIBELLES_STATUT_MARITAL[
                                  croyant.statut_marital as StatutMarital
                                ] ?? croyant.statut_marital)
                              : 'Non renseigné'
                          }
                        />
                        <div className="space-y-1">
                          <dt className="text-muted-foreground text-xs">Conjoint</dt>
                          <dd className="text-foreground text-sm">
                            {/*
                          EF-CRO-14 — DEUX ABSENCES DIFFÉRENTES, DEUX MESSAGES.
                          `conjoint_id` nul : personne n'est renseigné, un état
                          normal (le conjoint peut ne pas être croyant). `conjoint_id`
                          posé mais `conjoint` absent : la RLS l'a masqué — hors du
                          périmètre de l'utilisateur, ce qui doit se DIRE (règle 15)
                          et non se confondre avec un blanc.
                        */}
                            {croyant.conjoint ? (
                              <Link
                                href={`/croyants/${croyant.conjoint.id}`}
                                className="text-indigo-700 transition-colors hover:text-indigo-800 hover:underline"
                              >
                                {croyant.conjoint.nom.toLocaleUpperCase('fr')}{' '}
                                {croyant.conjoint.prenom}
                              </Link>
                            ) : croyant.conjoint_id ? (
                              <span className="text-muted-foreground">
                                Conjoint hors de votre périmètre
                              </span>
                            ) : (
                              'Non renseigné'
                            )}
                          </dd>
                        </div>
                        <Donnee
                          libelle="Nationalité"
                          valeur={croyant.nationalite?.libelle ?? '—'}
                        />
                      </dl>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="space-y-6 p-6">
                      <p className="eyebrow">Coordonnées</p>
                      <dl className="space-y-4">
                        <Donnee libelle="Adresse" valeur={croyant.adresse} />
                        <Donnee
                          libelle="Téléphone"
                          valeur={croyant.telephone ?? 'Non renseigné'}
                          mono
                        />
                        <Donnee
                          libelle="Adresse e-mail"
                          valeur={croyant.email ?? 'Non renseignée'}
                        />
                      </dl>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="space-y-6 p-6">
                      <p className="eyebrow">Rattachement ecclésial</p>
                      <dl className="space-y-4">
                        <Donnee libelle="Église" valeur={croyant.eglise?.nom ?? '—'} />
                        <Donnee
                          libelle="Cellule de prière"
                          valeur={croyant.cellule?.nom ?? 'Aucune'}
                        />
                        <div className="space-y-1">
                          <dt className="text-muted-foreground text-xs">Grade</dt>
                          <dd className="text-foreground text-sm">
                            {croyant.grade?.libelle ?? '—'}
                            {/*
                          EF-CRO-12 — SANS CETTE LIGNE, LE CIRCUIT EST
                          INCOMPRÉHENSIBLE. On demande un changement de grade, on
                          enregistre, et la fiche affiche toujours l'ancien : sans
                          dire qu'une décision est attendue, on croit que
                          l'enregistrement a échoué, et on recommence.
                        */}
                            {promotion && (
                              <StatusBadge tone="warning" className="ml-2 align-middle">
                                → {promotion.gradeDemande?.libelle ?? '—'} en attente
                              </StatusBadge>
                            )}
                          </dd>
                        </div>
                        <div className="space-y-2">
                          <Donnee
                            libelle="Date de baptême"
                            valeur={
                              croyant.date_bapteme
                                ? formatDateLongue(croyant.date_bapteme)
                                : 'Non renseignée'
                            }
                          />
                          {croyant.date_bapteme && (
                            <CertificatBaptemeBouton
                              certificat={{
                                nom: croyant.nom,
                                prenom: croyant.prenom,
                                matricule: croyant.matricule,
                                dateNaissance: croyant.date_naissance,
                                eglise: croyant.eglise?.nom ?? 'Église Locale',
                                dateBapteme: croyant.date_bapteme,
                                celebrants: [],
                                organisation: parametres.nom_organisation,
                                logoUrl: null,
                              }}
                              className="mt-2 w-full"
                            />
                          )}
                        </div>
                        <Donnee libelle="Matricule" valeur={croyant.matricule} mono />
                      </dl>
                    </CardContent>
                  </Card>
                </div>
              </>
            ),
          },
          {
            cle: 'dimes',
            libelle: 'Versements de dîme',
            compte: versements.length,
            contenu: (
              <>
                {/*
              EF-FIN-35 — les versements de dîme, AVANT l'historique.

              C'est la réponse à « pouvez-vous retrouver ma dîme du mois dernier ? »,
              la question qu'on pose à un bureau. L'historique, lui, retrace ce qui
              est arrivé au croyant : deux lectures différentes, deux cartes.
            */}
                <Card>
                  <CardContent className="space-y-6 p-6">
                    <div className="space-y-1">
                      <p className="eyebrow">Versements de dîme</p>
                      <p className="text-muted-foreground text-sm">
                        Le numéro d&apos;enveloppe affiché est celui en vigueur le jour du
                        versement, pas celui d&apos;aujourd&apos;hui : c&apos;est le reçu
                        détenu par le croyant qui fait foi.
                      </p>
                    </div>

                    <VersementsCroyant
                      versements={versements}
                      croyant={{
                        nom: croyant.nom,
                        prenom: croyant.prenom,
                        matricule: croyant.matricule,
                      }}
                      devise={parametres.devise}
                    />
                  </CardContent>
                </Card>
              </>
            ),
          },
          {
            cle: 'historique',
            libelle: 'Historique',
            compte: evenements.length,
            contenu: (
              <>
                <Card>
                  <CardContent className="space-y-6 p-6">
                    <div className="space-y-1">
                      <p className="eyebrow">Historique</p>
                      <p className="text-muted-foreground text-sm">
                        Ce qui est arrivé au croyant, du plus récent au plus ancien. Les
                        corrections de saisie relèvent du journal d&apos;audit, pas
                        d&apos;ici.
                      </p>
                    </div>

                    <HistoriqueCroyant evenements={evenements} />

                    <p className="border-border text-muted-foreground border-t pt-4 text-xs">
                      Dernière modification de la fiche le{' '}
                      {formatDateLongue(croyant.updated_at)}.
                    </p>
                  </CardContent>
                </Card>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}

function Donnee({
  libelle,
  valeur,
  mono,
}: {
  libelle: string;
  valeur: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs">{libelle}</dt>
      <dd
        className={mono ? 'text-foreground font-mono text-sm' : 'text-foreground text-sm'}
      >
        {valeur}
      </dd>
    </div>
  );
}
