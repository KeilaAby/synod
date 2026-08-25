import { avertir } from '@/components/shared/messages';
import { formatDateLongue } from '@/lib/utils/format';

/**
 * Certificat Officiel de Baptême d'Eau — SYNOD.
 *
 * Imprime un certificat solennel au format A4 avec en-tête de l'église,
 * verset biblique officiel, informations complètes du baptisé, célébrants,
 * et cartouches de signature.
 */

export interface DonneesCertificatBapteme {
  readonly nom: string;
  readonly prenom: string;
  readonly matricule: string;
  readonly dateNaissance?: string | null;
  readonly eglise: string;
  readonly dateBapteme: string;
  readonly lieu?: string | null;
  readonly sessionLibelle?: string | null;
  readonly celebrants: readonly string[];
  readonly organisation?: string | null;
  readonly logoUrl?: string | null;
}

function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function documentHtml(d: DonneesCertificatBapteme): string {
  const nomComplet = `${d.nom.toLocaleUpperCase('fr')} ${d.prenom}`.trim();
  const celebrantsTexte = d.celebrants.length > 0
    ? d.celebrants.map(echapper).join(', ')
    : 'Le corps pastoral';

  const lieuTexte = d.lieu ? echapper(d.lieu) : (d.sessionLibelle ? echapper(d.sessionLibelle) : echapper(d.eglise));
  const organisation = d.organisation ? echapper(d.organisation) : 'ÉGLISE DU PLEIN ÉVANGILE';
  const eglise = echapper(d.eglise);

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Certificat de Baptême — ${echapper(nomComplet)}</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 15mm;
      }

      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      body {
        font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #0f172a;
        background: #ffffff;
        padding: 20px;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .cadre-exterieur {
        border: 4px double #1e293b;
        padding: 8px;
        height: calc(100vh - 40px);
        min-height: 960px;
        display: flex;
        flex-direction: column;
      }

      .cadre-interieur {
        border: 1.5px solid #cbd5e1;
        padding: 40px 48px;
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        text-align: center;
        background: radial-gradient(circle at center, #ffffff 0%, #f8fafc 100%);
      }

      .en-tete {
        space-y: 8px;
      }

      .org-nom {
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: #334155;
      }

      .eglise-nom {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 1px;
        color: #64748b;
        margin-top: 4px;
        text-transform: uppercase;
      }

      .titre-certificat {
        margin: 24px 0 12px;
      }

      .titre-certificat h1 {
        font-size: 32px;
        font-weight: 800;
        letter-spacing: 3px;
        text-transform: uppercase;
        color: #0f172a;
        font-family: Georgia, 'Times New Roman', serif;
      }

      .verset {
        font-size: 11px;
        font-style: italic;
        color: #475569;
        max-width: 540px;
        margin: 12px auto 0;
        line-height: 1.6;
        border-top: 1px solid #e2e8f0;
        border-bottom: 1px solid #e2e8f0;
        padding: 10px 0;
      }

      .corps-texte {
        margin: 28px 0;
        font-size: 14px;
        line-height: 2;
        color: #1e293b;
      }

      .nom-baptise {
        font-size: 26px;
        font-weight: 800;
        color: #1e1b4b;
        font-family: Georgia, 'Times New Roman', serif;
        display: block;
        margin: 12px 0;
        letter-spacing: 1px;
      }

      .matricule-badge {
        display: inline-block;
        font-family: monospace;
        font-size: 11px;
        padding: 2px 10px;
        background: #f1f5f9;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        color: #475569;
        margin-bottom: 8px;
      }

      .details-grille {
        margin: 20px auto;
        max-width: 580px;
        text-align: left;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 16px 24px;
        font-size: 13px;
        line-height: 1.8;
      }

      .details-grille strong {
        color: #0f172a;
        font-weight: 600;
      }

      .signatures {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 40px;
        margin-top: 36px;
        padding-top: 20px;
      }

      .signature-bloc {
        text-align: center;
      }

      .signature-titre {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        color: #334155;
        letter-spacing: 1px;
        margin-bottom: 50px;
      }

      .signature-ligne {
        border-top: 1px dashed #64748b;
        width: 180px;
        margin: 0 auto 6px;
      }

      .signature-nom {
        font-size: 11px;
        color: #64748b;
      }

      .sceau-central {
        font-size: 10px;
        color: #94a3b8;
        letter-spacing: 1px;
        text-transform: uppercase;
        margin-top: 16px;
      }

      @media print {
        body {
          padding: 0;
        }
        .cadre-exterieur {
          height: 100vh;
        }
      }
    </style>
  </head>
  <body>
    <div class="cadre-exterieur">
      <div class="cadre-interieur">
        
        <!-- En-tête officiel -->
        <div class="en-tete">
          <div class="org-nom">${organisation}</div>
          <div class="eglise-nom">${eglise}</div>
        </div>

        <!-- Titre solennel -->
        <div class="titre-certificat">
          <h1>Certificat de Baptême</h1>
          <div class="verset">
            « Allez, faites de toutes les nations des disciples, les baptisant au nom du Père, du Fils et du Saint-Esprit. »
            <br />— Matthieu 28:19
          </div>
        </div>

        <!-- Corps du document -->
        <div class="corps-texte">
          Il est certifié par la présente que
          
          <span class="nom-baptise">${echapper(nomComplet)}</span>
          <span class="matricule-badge">Matricule : ${echapper(d.matricule)}</span>
          
          <div class="details-grille">
            <div>• <strong>Date du baptême :</strong> ${formatDateLongue(d.dateBapteme)}</div>
            <div>• <strong>Lieu de la cérémonie :</strong> ${lieuTexte}</div>
            <div>• <strong>Église de rattachement :</strong> ${eglise}</div>
            <div>• <strong>Ministre(s) officiant(s) :</strong> ${celebrantsTexte}</div>
          </div>

          a été baptisé(e) d'eau par immersion selon l'ordre du Seigneur Jésus-Christ,
          témoignant publiquement de son engagement de foi et de vie nouvelle.
        </div>

        <!-- Cartouches de signatures -->
        <div>
          <div class="signatures">
            <div class="signature-bloc">
              <div class="signature-titre">Le(s) Pasteur(s) Célébrant(s)</div>
              <div class="signature-ligne"></div>
              <div class="signature-nom">${celebrantsTexte}</div>
            </div>

            <div class="signature-bloc">
              <div class="signature-titre">Le Secrétariat / Sceau de l’Église</div>
              <div class="signature-ligne"></div>
              <div class="signature-nom">${eglise}</div>
            </div>
          </div>

          <div class="sceau-central">
            Document officiel délivré le ${formatDateLongue(new Date().toISOString())} — SYNOD
          </div>
        </div>

      </div>
    </div>
  </body>
</html>`;
}

/**
 * Déclenche l'impression directe du certificat de baptême dans une fenêtre dédiée.
 */
export function imprimerCertificatBapteme(donnees: DonneesCertificatBapteme): void {
  const fenetre = window.open('', '_blank', 'width=850,height=1100');
  if (!fenetre) {
    avertir(
      'L’ouverture de la fenêtre d’impression a été bloquée par votre navigateur. Autorisez les fenêtres pop-up pour SYNOD.',
    );
    return;
  }

  fenetre.document.open();
  fenetre.document.write(documentHtml(donnees));
  fenetre.document.close();

  fenetre.onload = () => {
    fenetre.focus();
    fenetre.print();
  };
}
