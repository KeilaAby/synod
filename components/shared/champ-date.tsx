'use client';

import { useState } from 'react';

import { Input } from '@/components/ui/input';
import {
  FORMAT_DATE_FR,
  masquerDateFr,
  versFrancais,
  versIso,
} from '@/lib/domain/date-fr';
import { cn } from '@/lib/utils';

/**
 * Une date saisie EN FRANÇAIS — jj/mm/aaaa.
 *
 * POURQUOI PAS `<input type="date">`. Il affiche la date dans la langue DU
 * NAVIGATEUR, pas dans celle de la page : `lang="fr"` n'y change rien, et
 * l'attribut n'est respecté ni par Firefox ni de façon fiable par Chrome. Sur
 * un poste configuré en anglais, « 04/07/1988 » s'affiche « 07/04/1988 » — le
 * même texte, deux sens opposés.
 *
 * LE DÉFAUT EST SILENCIEUX. Personne ne remarque qu'une date de naissance a été
 * lue à l'envers : les deux formes sont plausibles onze mois sur douze, et
 * l'erreur ne se voit que le jour où quelqu'un compare la fiche à un acte de
 * naissance. Laisser cela dépendre de la configuration d'un poste n'est pas une
 * option.
 *
 * CE QUI VOYAGE RESTE L'ISO. Le composant reçoit et rend `AAAA-MM-JJ` : rien ne
 * change pour les formulaires, les schémas ni la base. Seul l'affichage est
 * repris en main.
 *
 * LE TEXTE TAPÉ VIT DANS SON PROPRE ÉTAT, et c'est indispensable : « 04/0 » est
 * un état transitoire parfaitement normal qui ne correspond à aucune date. Le
 * dériver de la valeur ISO effacerait les frappes à mesure qu'on les fait.
 */

export function ChampDate({
  value,
  onChange,
  onBlur,
  id,
  name,
  disabled,
  className,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: {
  /** ISO `AAAA-MM-JJ`, ou vide. */
  value: string;
  /** Rend l'ISO, ou `''` tant que la saisie n'est pas une date complète. */
  onChange: (iso: string) => void;
  onBlur?: () => void;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const [texte, setTexte] = useState(() => versFrancais(value));

  /**
   * LA VALEUR EXTÉRIEURE REPREND LA MAIN quand elle change vraiment.
   *
   * Le formulaire peut la réinitialiser — ouverture d'un pop-up, chargement
   * d'une fiche. On compare donc l'ISO reçu au précédent, PENDANT le rendu :
   * c'est le motif que React recommande pour ajuster un état sur un changement
   * de prop, et il évite le rendu supplémentaire qu'un effet imposerait.
   *
   * ON NE COMPARE PAS AU TEXTE TAPÉ. « 04/0 » est un état transitoire qui ne
   * correspond à aucune date : le confronter à la valeur extérieure effacerait
   * la frappe à chaque caractère.
   */
  const [dernierIso, setDernierIso] = useState(value);
  if (value !== dernierIso) {
    setDernierIso(value);
    setTexte(versFrancais(value));
  }

  return (
    <Input
      id={id}
      name={name}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={FORMAT_DATE_FR}
      value={texte}
      disabled={disabled}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      onChange={(e) => {
        const masque = masquerDateFr(e.target.value);
        setTexte(masque);

        /**
         * ON REMONTE `''` TANT QUE LA DATE EST INCOMPLÈTE, et non la dernière
         * valeur valide : sinon effacer une date laisserait l'ancienne en
         * place, et le formulaire enregistrerait ce que l'écran n'affiche plus.
         */
        onChange(versIso(masque) ?? '');
      }}
      onBlur={onBlur}
      // `tabular-nums` : des chiffres de largeur égale, comme partout ailleurs
      // dans l'application (règle 5).
      className={cn('h-10 tabular-nums', className)}
    />
  );
}
