import { avertir } from '@/components/shared/messages';
import { formatDateLongue } from '@/lib/utils/format';
import type { VisitePastorale } from '@/lib/domain/visites-pastorales';

export interface DonneesOrdreMission {
  readonly visite: VisitePastorale;
  readonly organisation?: string | null;
  readonly logoUrl?: string | null;
}

function echapper(texte: string): string {
  return (texte || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function documentOrdreMissionHtml(d: DonneesOrdreMission): string {
  const v = d.visite;
  const organisation = d.organisation ? echapper(d.organisation) : 'ÉGLISE DU PLEIN ÉVANGILE';
  const entiteInitiatrice = echapper(v.entite_initiatrice_nom);
  const entiteCible = echapper(v.entite_cible_nom);
  const dateFormatee = formatDateLongue(v.date_visite);
  const typeCulte = echapper(v.type_culte);
  const theme = v.theme_message ? echapper(v.theme_message) : null;
  const reference = echapper(v.reference_ordre_mission || 'OM-SYNOD');

  const deleguesHtml = v.delegues
    .map((m) => {
      const avatarSrc = m.photo_url || '';
      const avatarHtml = avatarSrc
        ? `<img src="${avatarSrc}" alt="${echapper(m.nom_complet || '')}" class="delegate-img" />`
        : `<div class="delegate-avatar-placeholder">${echapper((m.nom_complet || 'M').charAt(0).toUpperCase())}</div>`;

      return `
        <div class="delegate-card">
          ${avatarHtml}
          <div class="delegate-info">
            <div class="delegate-name">${echapper(m.nom_complet || 'Membre')}</div>
            <div class="delegate-grade">Grade : ${echapper(m.grade || 'Membre')}</div>
            <div class="delegate-role">Rôle : <strong>${echapper(m.role_mission)}</strong></div>
            ${m.matricule ? `<div class="delegate-mat">Matricule : ${echapper(m.matricule)}</div>` : ''}
          </div>
        </div>
      `;
    })
    .join('');

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Ordre de Mission — ${reference}</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 18mm 16mm;
      }
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      body {
        font-family: 'Times New Roman', Times, Georgia, serif;
        color: #111827;
        background: #ffffff;
        padding: 20px;
        line-height: 1.5;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .frame-border {
        border: 2px solid #0f172a;
        padding: 28px 32px;
        position: relative;
        min-height: 94vh;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .header-area {
        text-align: center;
        border-bottom: 2px double #0f172a;
        padding-bottom: 16px;
        margin-bottom: 20px;
      }
      .org-name {
        font-size: 15pt;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #0f172a;
      }
      .org-sub {
        font-size: 10.5pt;
        font-style: italic;
        color: #475569;
        margin-top: 3px;
      }
      .doc-title {
        font-size: 16pt;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-top: 14px;
        text-decoration: underline;
      }
      .doc-ref {
        font-family: 'Courier New', Courier, monospace;
        font-size: 9pt;
        color: #64748b;
        margin-top: 4px;
        font-weight: bold;
      }
      .content-body {
        flex: 1;
        font-size: 11pt;
      }
      .intro-text {
        text-align: justify;
        margin-bottom: 16px;
      }
      .mission-details-box {
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        border-left: 4px solid #0f172a;
        padding: 12px 16px;
        margin: 16px 0;
        font-size: 10.5pt;
      }
      .mission-details-box div {
        margin-bottom: 4px;
      }
      .mission-details-box div:last-child {
        margin-bottom: 0;
      }
      .delegation-title {
        font-size: 11pt;
        font-weight: bold;
        margin: 16px 0 10px;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .delegates-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
        margin-bottom: 18px;
      }
      .delegate-card {
        border: 1px dashed #94a3b8;
        background: #fafafb;
        padding: 10px 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        border-radius: 4px;
      }
      .delegate-img {
        width: 52px;
        height: 52px;
        border-radius: 9999px;
        object-fit: cover;
        border: 1.5px solid #0f172a;
      }
      .delegate-avatar-placeholder {
        width: 52px;
        height: 52px;
        border-radius: 9999px;
        background: #e2e8f0;
        color: #0f172a;
        font-weight: bold;
        font-size: 16pt;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1.5px solid #0f172a;
      }
      .delegate-info {
        flex: 1;
        line-height: 1.35;
      }
      .delegate-name {
        font-size: 10pt;
        font-weight: bold;
        color: #0f172a;
      }
      .delegate-grade {
        font-size: 9pt;
        color: #475569;
      }
      .delegate-role {
        font-size: 9pt;
        color: #0f172a;
      }
      .delegate-mat {
        font-size: 8pt;
        color: #64748b;
        font-family: 'Courier New', Courier, monospace;
      }
      .bible-verse {
        font-style: italic;
        font-size: 9.5pt;
        color: #475569;
        text-align: center;
        margin: 20px 0 10px;
        padding: 8px 16px;
        border-top: 1px dashed #cbd5e1;
        border-bottom: 1px dashed #cbd5e1;
      }
      .signatures-section {
        margin-top: 24px;
        display: flex;
        justify-content: space-between;
        padding: 0 20px;
      }
      .sig-block {
        width: 220px;
        text-align: center;
      }
      .sig-title {
        font-size: 10pt;
        font-weight: bold;
      }
      .sig-space {
        height: 60px;
      }
      .sig-line {
        border-top: 1px solid #0f172a;
        font-size: 8.5pt;
        padding-top: 4px;
        font-style: italic;
        color: #475569;
      }
    </style>
  </head>
  <body>
    <div class="frame-border">
      <div class="header-area">
        <div class="org-name">${organisation}</div>
        <div class="org-sub">${entiteInitiatrice} • MINISTÈRE PASTORAL & MISSIONS</div>
        <div class="doc-title">ORDRE DE MISSION PASTORALE</div>
        <div class="doc-ref">RÉFÉRENCE OFFICIELLE : ${reference}</div>
      </div>

      <div class="content-body">
        <p class="intro-text">
          Il est attesté par la présente que les serviteurs et gradés désignés ci-dessous sont officiellement
          mandatés par <strong>${entiteInitiatrice}</strong> pour effectuer une <strong>Visite Pastorale Officielle</strong>
          auprès de la communauté ecclésiale accueillante.
        </p>

        <div class="mission-details-box">
          <div><strong>Église & Destination d'Accueil :</strong> ${entiteCible}</div>
          <div><strong>Date & Culte :</strong> ${dateFormatee} à ${echapper(v.heure_visite || '09:00')} (${typeCulte})</div>
          ${theme ? `<div><strong>Thème / Objet de mission :</strong> « ${theme} »</div>` : ''}
          ${v.instructions ? `<div><strong>Recommandations :</strong> ${echapper(v.instructions)}</div>` : ''}
        </div>

        <div class="delegation-title">Composition Officielle de la Délégation Pastorale :</div>
        <div class="delegates-grid">
          ${deleguesHtml}
        </div>

        <div class="bible-verse">
          « Recevez-les donc dans le Seigneur avec une joie entière, et ayez de l'estime pour de tels serviteurs. »
          <br />— Philippiens 2:29
        </div>
      </div>

      <div class="signatures-section">
        <div class="sig-block">
          <div class="sig-title">Le Secrétariat / Bureau</div>
          <div class="sig-space"></div>
          <div class="sig-line">Sceau Officiel de l'Église</div>
        </div>

        <div class="sig-block">
          <div class="sig-title">Le Responsable / Pasteur</div>
          <div class="sig-space"></div>
          <div class="sig-line">Signature autorisée</div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export function imprimerOrdreMission(donnees: DonneesOrdreMission): void {
  try {
    const html = documentOrdreMissionHtml(donnees);
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      const fenetre = window.open('', '_blank');
      if (!fenetre) {
        avertir('Veuillez autoriser les fenêtres pop-up pour lancer l’impression.');
        return;
      }
      fenetre.document.write(html);
      fenetre.document.close();
      fenetre.focus();
      fenetre.print();
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1500);
    }, 400);
  } catch (err) {
    console.error('Erreur lors de l’impression de l’ordre de mission', err);
    avertir('Une erreur est survenue lors du lancement de l’impression.');
  }
}
