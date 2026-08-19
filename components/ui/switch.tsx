'use client';

import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

/**
 * Interrupteur — UI-14.
 *
 * QUAND L'EMPLOYER PLUTOT QU'UNE CASE A COCHER. Une case dit « ceci fait partie
 * d'une selection » ; un interrupteur dit « ceci est ACTIF ou INACTIF ». La
 * difference se voit a la lecture d'une liste : vingt cases se comptent, vingt
 * interrupteurs se lisent un par un — c'est ce qu'on veut d'une habilitation,
 * dont chacune se decide pour elle-meme.
 *
 * Il applique le meme etat desactive que la case : `disabled` grise sans
 * masquer, parce qu'un droit qu'on ne peut pas accorder doit rester visible
 * (plan.md §10.6).
 */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors outline-none',
        'focus-visible:ring-3 focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=unchecked]:bg-input data-[state=checked]:bg-primary',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform',
          'data-[state=unchecked]:translate-x-0.5 data-[state=checked]:translate-x-4',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
