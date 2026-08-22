"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        // LE FLOU EST RETIRE (20 aout 2026). `backdrop-filter` force le
        // navigateur a composer toute la page derriere le pop-up a chaque
        // image : sur un organigramme React Flow ou un tableau de mille lignes,
        // c est ce qui rendait l ouverture pateuse. Le voile sombre suffit a
        // dire ce que le flou disait — « ceci est au-dessus » —, sans rien
        // recalculer.
        "fixed inset-0 isolate z-50 bg-black/20 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * UN POP-UP SE DEPLACE — 20 aout 2026.
 *
 * POURQUOI : un pop-up centre couvre exactement ce qu'on est venu consulter.
 * Saisir un mouvement en relisant la ligne du registre, rapprocher une dime en
 * regardant la liste : dans les deux cas il fallait fermer, lire, rouvrir.
 *
 * ON NE TIRE QUE PAR L'EN-TETE. Rendre toute la surface saisissable ferait
 * deplacer le pop-up en essayant de selectionner un libelle ou de cocher une
 * case. `closest()` sur l'en-tete borne la prise, et un `pointerdown` sur un
 * bouton ou un champ n'entraine rien — c'est le second test.
 *
 * LA POSITION NE SE MEMORISE PAS. Le pop-up se demonte a la fermeture, donc
 * l'etat repart a zero : rouvrir redonne un pop-up centre. C'est voulu — une
 * position retenue ferait rouvrir hors ecran apres un changement de taille de
 * fenetre, et personne ne saurait pourquoi le pop-up « ne s'ouvre plus ».
 *
 * Le decalage passe par `transform`, quand Tailwind v4 centre par la propriete
 * `translate` : les deux se composent au lieu de s'ecraser.
 *
 * LE DECALAGE MUTE LE DOM DIRECTEMENT — 22 aout 2026. Un `setState` a chaque
 * `pointermove` re-rend tout le contenu du pop-up (formulaire, tableau...) a
 * chaque pixel parcouru : sur un pop-up charge, le fil d'evenements pointeur
 * s'engorge et la souris semble « lacher » la prise, meme sous
 * `setPointerCapture`. Meme principe que la correction apportee a
 * l'organigramme : ce qui bouge en continu appartient au geste, pas au rendu
 * React — la position ne se memorise de toute facon pas, rien n'a donc besoin
 * d'etre su du composant.
 */
function useDeplacement() {
  const ref = React.useRef<HTMLDivElement>(null)
  const origine = React.useRef<{ x: number; y: number } | null>(null)
  const decalage = React.useRef({ x: 0, y: 0 })

  function auPointeur(evenement: React.PointerEvent<HTMLDivElement>) {
    const cible = evenement.target as HTMLElement

    // La prise, c'est l'en-tete — et rien qui s'y trouve d'interactif.
    if (!cible.closest('[data-slot="dialog-header"]')) return
    if (cible.closest("button, a, input, textarea, select, [role='button']")) return

    origine.current = {
      x: evenement.clientX - decalage.current.x,
      y: evenement.clientY - decalage.current.y,
    }
    evenement.currentTarget.setPointerCapture(evenement.pointerId)
    // L'animation d'ouverture ne doit pas reprendre la main sur `transform`
    // pendant le geste : elle ferait sauter le pop-up sous le doigt.
    evenement.currentTarget.classList.add("animate-none")
  }

  function auMouvement(evenement: React.PointerEvent<HTMLDivElement>) {
    if (!origine.current) return
    decalage.current = {
      x: evenement.clientX - origine.current.x,
      y: evenement.clientY - origine.current.y,
    }
    if (ref.current) {
      ref.current.style.transform = `translate(${decalage.current.x}px, ${decalage.current.y}px)`
    }
  }

  function auRelachement(evenement: React.PointerEvent<HTMLDivElement>) {
    if (!origine.current) return
    origine.current = null
    evenement.currentTarget.releasePointerCapture(evenement.pointerId)
  }

  return {
    ref,
    poignee: {
      onPointerDown: auPointeur,
      onPointerMove: auMouvement,
      onPointerUp: auRelachement,
      onPointerCancel: auRelachement,
    },
  }
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  style,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const { ref, poignee } = useDeplacement()

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        data-slot="dialog-content"
        {...poignee}
        style={style}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          // L'en-tete ANNONCE qu'il est saisissable, et seulement lui.
          "[&_[data-slot=dialog-header]]:cursor-grab",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-2 right-2"
              size="icon-sm"
            >
              <XIcon
              />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
