import { Dialog } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export function EvaluationIcon({ name }: { name: string }) {
  return <img className="evaluation-icon" src={`/evaluation/${name}.svg`} alt="" />
}

export function EvaluationModal({ open, onClose, title, description, children, wide = false }: {
  open: boolean; onClose: () => void; title: string; description: string; children: ReactNode; wide?: boolean
}) {
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose() }}>
    <Dialog.Portal>
      <Dialog.Backdrop className="evaluation-backdrop" />
      <Dialog.Popup className={`evaluation-modal${wide ? ' evaluation-modal-wide' : ''}`}>
        <div className="evaluation-modal-header">
          <div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div>
          <Dialog.Close render={<Button variant="outline" size="icon" className="icon-button" aria-label="Close dialog" />}><EvaluationIcon name="imgIconX" /></Dialog.Close>
        </div>
        {children}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
}
