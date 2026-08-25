import { describe, it, expect } from 'vitest';
import {
  SECTIONS_UTILISATEUR,
  SECTIONS_ADMINISTRATION,
} from '@/lib/domain/documentation';

describe('Centre de Documentation SYNOD', () => {
  it('contient 10 sections complètes pour le Guide Utilisateur', () => {
    expect(SECTIONS_UTILISATEUR).toHaveLength(10);

    for (const section of SECTIONS_UTILISATEUR) {
      expect(section.id).toBeTruthy();
      expect(section.titre).toBeTruthy();
      expect(section.sousTitre).toBeTruthy();
      expect(section.iconeNom).toBeTruthy();
      expect(section.descriptionCourte).toBeTruthy();
      expect(section.chapitres.length).toBeGreaterThan(0);

      for (const chapitre of section.chapitres) {
        expect(chapitre.id).toBeTruthy();
        expect(chapitre.titre).toBeTruthy();
        expect(chapitre.description).toBeTruthy();
      }
    }
  });

  it('contient 7 sections complètes pour le Manuel d’Administration', () => {
    expect(SECTIONS_ADMINISTRATION).toHaveLength(7);

    for (const section of SECTIONS_ADMINISTRATION) {
      expect(section.id).toBeTruthy();
      expect(section.titre).toBeTruthy();
      expect(section.sousTitre).toBeTruthy();
      expect(section.iconeNom).toBeTruthy();
      expect(section.descriptionCourte).toBeTruthy();
      expect(section.chapitres.length).toBeGreaterThan(0);

      for (const chapitre of section.chapitres) {
        expect(chapitre.id).toBeTruthy();
        expect(chapitre.titre).toBeTruthy();
        expect(chapitre.description).toBeTruthy();
      }
    }
  });

  it('ne comporte aucun doublon d’identifiant entre chapitres au sein d’une même section', () => {
    for (const section of [...SECTIONS_UTILISATEUR, ...SECTIONS_ADMINISTRATION]) {
      const ids = section.chapitres.map((c) => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    }
  });

  it('couvre tous les modules clés sans jargon technique', () => {
    const titresUtilisateur = SECTIONS_UTILISATEUR.map((s) => s.titre);
    expect(titresUtilisateur).toContain('Premiers pas & Découverte');
    expect(titresUtilisateur).toContain('Structure Ecclésiale');
    expect(titresUtilisateur).toContain('Gestion des Croyants');
    expect(titresUtilisateur).toContain('Transferts & Mutations');
    expect(titresUtilisateur).toContain('Cérémonies de Baptême');
    expect(titresUtilisateur).toContain('Bureaux & Organigrammes');
    expect(titresUtilisateur).toContain('Finances Générales');
    expect(titresUtilisateur).toContain('Gestion des Dîmes');
    expect(titresUtilisateur).toContain('Tableaux de Bord');
    expect(titresUtilisateur).toContain('Générateur de Rapports');

    const titresAdmin = SECTIONS_ADMINISTRATION.map((s) => s.titre);
    expect(titresAdmin).toContain('Gestion des Comptes & Accès');
    expect(titresAdmin).toContain('Habilitations Fines & Délégation');
    expect(titresAdmin).toContain('Administration des Référentiels');
    expect(titresAdmin).toContain('Journal d’Audit & Sécurité');
    expect(titresAdmin).toContain('Corbeille & Rétention');
    expect(titresAdmin).toContain('Paramètres Généraux & Courriels');
    expect(titresAdmin).toContain('Portabilité, Sauvegardes & S3');
  });
});
