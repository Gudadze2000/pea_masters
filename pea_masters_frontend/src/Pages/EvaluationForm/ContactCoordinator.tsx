import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, Mail, MessageSquare } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { FormField } from '@/components/forms/FormField'
import { useIdentity } from '@/lib/profile'
import { EvaluationModal } from './EvaluationModal'

/** The entry a question is about, e.g. a rejected one: pre-fills the subject and message */
export type ContactTopic = { record: string; entry: string; comment?: string }

const PERIOD = 'Annual evaluation 2025-2026'

function draftFor(topic: ContactTopic | undefined, coordinator: string, me: string) {
  const greeting = `Dear ${coordinator || 'colleague'},`
  const signature = `Kind regards,\n${me}`
  if (!topic) return { subject: `${PERIOD}: question about my evaluation form`, body: `${greeting}\n\n\n\n${signature}` }
  const about = `"${topic.entry}" (${topic.record})`
  return {
    subject: `${PERIOD}: question about ${topic.record}`,
    body: `${greeting}\n\nI have a question about my evaluation entry ${about}.${topic.comment ? `\n\nReviewer's comment: ${topic.comment}` : ''}\n\n\n\n${signature}`,
  }
}

const q = encodeURIComponent

/**
 * Write to your Coordinator from your own email: Gmail, Outlook on the web, or whatever mail app
 * the computer uses. Nothing is sent by PEA itself. Messages inside PEA come later.
 */
export function ContactCoordinator({ onClose, topic }: { onClose: () => void; topic?: ContactTopic }) {
  const identity = useIdentity()
  const coordinator = identity.coordinator
  // Rendered only while open, so every opening starts a fresh draft for the entry it was opened from
  const [draft] = useState(() => draftFor(topic, coordinator?.name ?? '', identity.fullName))
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    if (!coordinator) return
    try {
      await navigator.clipboard.writeText(coordinator.email)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 2500)
    } catch { /* Clipboard blocked: the address is on screen to copy by hand */ }
  }

  const to = coordinator?.email ?? ''
  // authuser picks the signed-in university account when several Google accounts are open
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&authuser=${q(identity.email)}&to=${q(to)}&su=${q(subject)}&body=${q(body)}`
  const outlook = `https://outlook.office.com/mail/deeplink/compose?to=${q(to)}&subject=${q(subject)}&body=${q(body)}`
  const mailto = `mailto:${to}?subject=${q(subject)}&body=${q(body)}`
  const link = (variant: 'default' | 'outline') => buttonVariants({ variant, className: 'dashboard-button' })

  return <EvaluationModal open onClose={onClose} wide title="Contact your coordinator"
    description={topic ? `About “${topic.entry}”` : 'Questions about your evaluation go to your department\'s Coordinator.'}>
    {coordinator ? <>
      <div className="evaluation-modal-body">
        <div className="contact-person">
          <span className="contact-avatar" aria-hidden="true">{coordinator.name.split(/\s+/).filter(Boolean).map(word => word[0]).slice(0, 2).join('').toUpperCase()}</span>
          <div>
            <p>{coordinator.name}</p>
            <small>Coordinator of {identity.department || 'your department'} · <a href={`mailto:${coordinator.email}`}>{coordinator.email}</a></small>
          </div>
          <Button variant="outline" size="sm" className="contact-copy" onClick={() => void copy()} aria-label={`Copy ${coordinator.email}`}>
            {copied ? <><Check aria-hidden="true" />Copied</> : <><Copy aria-hidden="true" />Copy address</>}
          </Button>
        </div>
        <FormField idPrefix="contact" field={{ name: 'subject', label: 'Subject', type: 'text' }} value={subject} onChange={setSubject} />
        <FormField idPrefix="contact" field={{ name: 'message', label: 'Message', type: 'textarea', rows: 7 }} value={body} onChange={setBody} />
        <p className="evaluation-entry-note">Your email opens with this message filled in. Check it there and press Send. PEA doesn't send anything itself.</p>
        <div className="contact-soon">
          <MessageSquare aria-hidden="true" />
          <div><p>Messages inside PEA</p><small>Coming soon: write to your coordinator here and get the reply as a notification.</small></div>
        </div>
      </div>
      <div className="evaluation-modal-footer contact-footer">
        <a className={link('outline')} href={mailto}><Mail aria-hidden="true" />Default email app</a>
        <a className={link('outline')} href={outlook} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />Outlook</a>
        <a className={link('default')} href={gmail} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />Open in Gmail</a>
      </div>
    </> : <>
      <div className="evaluation-modal-body">
        <div className="evaluation-warning">
          <Mail aria-hidden="true" />
          <div><p>No coordinator assigned yet</p><small>{identity.department ? `${identity.department} doesn't have a Coordinator in PEA yet.` : "You aren't in a department in PEA yet."} Ask your organization's administrator to set one up.</small></div>
        </div>
      </div>
      <div className="evaluation-modal-footer"><Button variant="outline" className="dashboard-button" onClick={onClose}>Close</Button></div>
    </>}
  </EvaluationModal>
}
