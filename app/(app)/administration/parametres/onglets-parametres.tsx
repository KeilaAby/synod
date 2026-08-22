'use client';

import { useState } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Les familles de réglages — EF-ADM-13.
 *
 * POURQUOI UN COMPOSANT CLIENT SI MINCE. Les deux panneaux sont rendus par le
 * SERVEUR et arrivent ici en `children` : seul l'onglet courant est un état, et
 * il n'a aucune raison de traverser la frontière. Faire de la page entière un
 * composant client aurait ramené les lectures et la configuration SMTP dans le
 * navigateur — ce qu'on ne veut ni pour la charge, ni pour la confidentialité.
 *
 * Un onglet **par famille**, et non par type de contrôle : on vient changer
 * « le workflow financier » ou « le serveur d'envoi », jamais « les cases à
 * cocher ».
 */
export function OngletsParametres({
  general,
  profils,
  courriel,
  attestation,
}: {
  general: React.ReactNode;
  profils: React.ReactNode;
  courriel: React.ReactNode;
  attestation: React.ReactNode;
}) {
  const [onglet, setOnglet] = useState('general');

  return (
    <Tabs value={onglet} onValueChange={setOnglet} className="space-y-6">
      <TabsList>
        <TabsTrigger value="general">Organisation</TabsTrigger>
        <TabsTrigger value="profils">Profils de privileges</TabsTrigger>
        <TabsTrigger value="courriel">Courriel</TabsTrigger>
        <TabsTrigger value="attestation">Attestation</TabsTrigger>
      </TabsList>

      <TabsContent value="general">{general}</TabsContent>
      <TabsContent value="profils">{profils}</TabsContent>
      <TabsContent value="courriel">{courriel}</TabsContent>
      <TabsContent value="attestation">{attestation}</TabsContent>
    </Tabs>
  );
}
