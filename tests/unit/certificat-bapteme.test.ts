import { describe, expect, it } from 'vitest';
import { type DonneesCertificatBapteme } from '@/components/baptemes/imprimer-certificat-bapteme';

describe('Certificat de Baptême', () => {
  it('contient les données obligatoires d’un baptisé', () => {
    const donnees: DonneesCertificatBapteme = {
      nom: 'Kouassi',
      prenom: 'Jean-Baptiste',
      matricule: 'CRO-2026-00042',
      dateNaissance: '1995-04-12',
      eglise: 'Église Centrale de Béthel',
      dateBapteme: '2026-08-20',
      lieu: 'Bassin baptismal Béthel',
      sessionLibelle: 'Session d’Août 2026',
      celebrants: ['Pasteur Paul Yao', 'Pasteur Émile Koffi'],
      organisation: 'UNION DES ÉGLISES ÉVANGÉLIQUES',
    };

    expect(donnees.nom).toBe('Kouassi');
    expect(donnees.prenom).toBe('Jean-Baptiste');
    expect(donnees.matricule).toBe('CRO-2026-00042');
    expect(donnees.celebrants).toHaveLength(2);
    expect(donnees.eglise).toContain('Béthel');
  });
});
