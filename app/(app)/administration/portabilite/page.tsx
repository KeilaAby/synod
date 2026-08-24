import type { Metadata } from 'next';
import { Download, Database, HardDrive, CheckCircle2, Server, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { detient } from '@/lib/domain/permissions';
import { envServeur } from '@/lib/env';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Portabilité & Réversibilité — Administration' };

export default async function PortabilitePage() {
  const session = await getSession();
  if (!session) redirect('/connexion');

  // Réservé à l'administrateur
  if (!detient(session, 'settings.manage') && session.role !== 'SUPERADMIN') {
    redirect('/administration');
  }

  const env = envServeur();
  const stockageActif = env.STORAGE_PROVIDER === 's3' ? 'Stockage compatible S3' : 'Supabase Storage';

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/administration"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          <ArrowLeft className="size-3.5" />
          Retour à l’administration
        </Link>
        <PageHeader
          eyebrow="Administration"
          title="Portabilité & Réversibilité des données"
          description="Garantie d’indépendance technologique (ENF-POR-01 à 08) : export intégral, schéma PostgreSQL standard, stockage S3 et procédure de restauration."
        />
      </div>

      {/* Cartes de garanties de souveraineté */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-xl border border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Database className="size-4 text-emerald-600" />
              Base de Données
            </CardTitle>
            <CardDescription className="text-xs">PostgreSQL 15+ Standard</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-slate-600">
            <p className="flex items-center gap-1.5 text-emerald-700">
              <CheckCircle2 className="size-3.5 shrink-0" />
              100 % SQL standard (ENF-POR-01)
            </p>
            <p>
              Aucun type propriétaire. Extensions ouvertes utilisées : <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-[11px]">ltree</code>, <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-[11px]">pg_trgm</code>, <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-[11px]">pgcrypto</code>.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <HardDrive className="size-4 text-indigo-600" />
              Stockage de Fichiers
            </CardTitle>
            <CardDescription className="text-xs">Fournisseur : {stockageActif}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-slate-600">
            <p className="flex items-center gap-1.5 text-emerald-700">
              <CheckCircle2 className="size-3.5 shrink-0" />
              Clés relatives uniquement (ENF-POR-03)
            </p>
            <p>
              Aucune URL absolue stockée. Adaptateurs interchangeables : <strong>Supabase</strong> et <strong>S3 standard</strong> (AWS, MinIO, Scaleway, Cloudflare R2).
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Server className="size-4 text-blue-600" />
              Réversibilité & Audit
            </CardTitle>
            <CardDescription className="text-xs">Zéro verrouillage (ENF-POR-08)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-slate-600">
            <p className="flex items-center gap-1.5 text-emerald-700">
              <CheckCircle2 className="size-3.5 shrink-0" />
              Procédure documentée (RESTORE.md)
            </p>
            <p>
              Manifeste d’intégrité avec dénombrement par table et empreinte SHA-256 certifiant l’exactitude de chaque sauvegarde.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Action d'Export Intégral */}
      <Card className="rounded-xl border border-indigo-100 bg-indigo-50/30">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-indigo-950 flex items-center gap-2">
            <Download className="size-5 text-indigo-600" />
            Générer un Export Intégral (ENF-POR-06)
          </CardTitle>
          <CardDescription className="text-xs text-slate-600">
            Télécharge un package complet contenant le dump SQL de l’ensemble des tables, l’inventaire des fichiers stockés et le manifeste d’intégrité horodaté.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/api/administration/portabilite/export"
              download
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors shadow-sm"
            >
              <Download className="size-4" />
              Télécharger l’archive des données (JSON + SQL)
            </a>
          </div>
          <p className="text-xs text-slate-500">
            Ce fichier peut être restauré à tout moment selon la procédure décrite dans le guide <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-[11px]">RESTORE.md</code>.
          </p>
        </CardContent>
      </Card>

      {/* Guide de restauration résumé */}
      <Card className="rounded-xl border border-slate-200">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-900">
            Procédure de Restauration rapide (Ligne de commande)
          </CardTitle>
          <CardDescription className="text-xs">
            Commandes à exécuter pour restaurer une instance vierge chez un hébergeur tiers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 font-mono text-xs">
          <div className="bg-slate-950 text-slate-100 p-4 rounded-lg space-y-2 overflow-x-auto">
            <p className="text-slate-400"># 1. Exporter l’intégralité des données en local :</p>
            <p className="text-emerald-400">pnpm export:integral</p>
            <p className="text-slate-400 mt-3"># 2. Restaurer le schéma et les données sur PostgreSQL standard :</p>
            <p className="text-emerald-400">psql -h $HOTE_PG -U $USER -d synod_prod -f supabase/install.sql</p>
            <p className="text-emerald-400">psql -h $HOTE_PG -U $USER -d synod_prod -f database.sql</p>
            <p className="text-slate-400 mt-3"># 3. Synchroniser les fichiers vers le bucket S3 :</p>
            <p className="text-emerald-400">aws s3 sync ./storage s3://synod-prod/ --endpoint-url $S3_ENDPOINT</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
