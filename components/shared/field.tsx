'use client';

import { useId } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Champ de formulaire accessible — ENF-UTI-03, ENF-UTI-05.
 *
 * Cable systematiquement `id`, `aria-invalid`, `aria-describedby` et
 * `aria-required`. Un champ en erreur sans lien ARIA vers son message est
 * invisible pour un lecteur d'ecran : c'est la premiere cause de non-conformite
 * WCAG dans les formulaires.
 *
 * Espacements sur la grille de 8px (UI-01) : `gap-2` entre libelle et champ.
 */
export function Field({
  label,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  error?: string;
  /** Precision affichee sous le champ, ex. « Liste filtree selon l'eglise ». */
  hint?: string;
  required?: boolean;
  className?: string;
  /** Recoit les props ARIA a appliquer au controle. */
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
    'aria-required': boolean;
  }) => React.ReactNode;
}) {
  const id = useId();
  const idErreur = `${id}-erreur`;
  const idHint = `${id}-hint`;

  const describedBy =
    [error ? idErreur : null, hint ? idHint : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden>
            *
          </span>
        )}
      </Label>

      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy,
        'aria-required': Boolean(required),
      })}

      {hint && !error && (
        <p id={idHint} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}

      {error && (
        <p id={idErreur} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Raccourci pour le cas courant : un `<Input>` simple. */
export function TextField({
  label,
  error,
  hint,
  required,
  className,
  ...props
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
} & Omit<React.ComponentProps<typeof Input>, 'id'>) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {(aria) => <Input {...aria} {...props} />}
    </Field>
  );
}
