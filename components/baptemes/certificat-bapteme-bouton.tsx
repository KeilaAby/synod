'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  imprimerCertificatBapteme,
  type DonneesCertificatBapteme,
} from './imprimer-certificat-bapteme';

interface Props {
  readonly certificat: DonneesCertificatBapteme;
  readonly variant?: 'outline' | 'default' | 'ghost';
  readonly size?: 'default' | 'sm' | 'lg' | 'icon';
  readonly className?: string;
}

export function CertificatBaptemeBouton({
  certificat,
  variant = 'outline',
  size = 'sm',
  className,
}: Props) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={() => imprimerCertificatBapteme(certificat)}
      className={className}
    >
      <Printer className="size-3.5 mr-1.5" />
      Imprimer le certificat de baptême
    </Button>
  );
}
