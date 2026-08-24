import { NextResponse } from 'next/server';
import { genererExportIntegral } from '@/lib/data/portabilite';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // Vérifier les habilitations de l'utilisateur (SuperAdmin ou organisation.manage)
    const { data: profil } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('auth_user_id', user.id)
      .single();

    if (!profil?.is_super_admin) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
    }

    const res = await genererExportIntegral();
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 500 });
    }

    return NextResponse.json(res.data, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="export-synod-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur interne export' },
      { status: 500 },
    );
  }
}
