import { Fragment, type ReactNode } from "react"
import { Globe, Mail, Phone } from "lucide-react"
import type { CitationPart } from "./citations"
import type { CvSection } from "./cv-content"
import type { CvData } from "./cv-model"
import { validProfiles } from "./identifiers"

type Person = { fullName: string; email: string; position: string; faculty: string; direction: string }

type Props = {
  cv: CvData
  sections: CvSection[]
  person: Person
  /** Visitor view hides the contact details the researcher keeps private */
  asVisitor: boolean
}

function Citation({ parts }: { parts: CitationPart[] }) {
  return (
    <>
      {parts.map((part, index) => {
        let node: ReactNode = part.text
        if (part.link) node = <a href={part.link} target="_blank" rel="noopener noreferrer">{node}</a>
        if (part.italic) node = <i>{node}</i>
        if (part.self) node = <strong className="cv-self">{node}</strong>
        return <Fragment key={index}>{node}</Fragment>
      })}
    </>
  )
}

function Section({ section, cv }: { section: CvSection; cv: CvData }) {
  return (
    <section className="cv-section" aria-label={section.label}>
      <h2 className="cv-section-title">{section.label}</h2>
      {section.kind === "text" && <p className="cv-text">{section.text}</p>}
      {section.kind === "chips" && <p className="cv-text">{section.chips.join(" · ")}</p>}
      {section.kind === "list" && (
        <ul className="cv-items">
          {section.items.map(item => (
            <li key={item.key} className="cv-item">
              <div className="cv-item-main">
                <p className="cv-item-title">{item.title}</p>
                {item.subtitle && <p className="cv-item-subtitle">{item.subtitle}</p>}
                {item.detail && <p className="cv-item-detail">{item.detail}</p>}
              </div>
              {item.when && <span className="cv-item-when">{item.when}</span>}
            </li>
          ))}
        </ul>
      )}
      {section.kind === "publications" && section.groups.map(group => (
        <div key={group.label} className="cv-pub-group">
          {section.groups.length > 1 && <h3 className="cv-pub-heading">{group.label}</h3>}
          <ol className={`cv-publications ${cv.citationStyle === "IEEE" ? "numbered" : ""}`}>
            {group.items.map(item => <li key={item.key}>{item.citation && <Citation parts={item.citation} />}</li>)}
          </ol>
        </div>
      ))}
      {section.kind === "facts" && (
        <>
          <dl className="cv-facts">
            {section.facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
          </dl>
          {section.note && <p className="cv-note">{section.note}</p>}
        </>
      )}
    </section>
  )
}

/** The CV document itself. The same markup is used on screen and when printing to PDF. */
export function CvPreview({ cv, sections, person, asVisitor }: Props) {
  const profiles = validProfiles(cv.profiles)
  const showEmail = !asVisitor || cv.publicFields.email
  const showPhone = (!asVisitor || cv.publicFields.phone) && cv.personal.phone.trim()
  const website = profiles.find(profile => profile.key === "website")
  const identifiers = profiles.filter(profile => profile.key !== "website")

  return (
    <article className={`cv-paper template-${cv.template}`} aria-label="CV preview">
      <header className="cv-header">
        <h1 className="cv-name">{person.fullName}</h1>
        <p className="cv-headline">{cv.personal.headline || person.position}</p>
        <p className="cv-affiliation">{[person.direction, `Faculty of ${person.faculty}`, "Ilia State University"].join(" · ")}</p>
        <ul className="cv-contact">
          {showEmail && <li><Mail aria-hidden="true" /><a href={`mailto:${person.email}`}>{person.email}</a></li>}
          {showPhone && <li><Phone aria-hidden="true" />{cv.personal.phone}</li>}
          {website && <li><Globe aria-hidden="true" /><a href={website.url} target="_blank" rel="noopener noreferrer">{website.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a></li>}
        </ul>
        {identifiers.length > 0 && (
          <ul className="cv-identifiers" aria-label="Research profiles">
            {identifiers.map(profile => (
              <li key={profile.key}>
                <a href={profile.url} target="_blank" rel="noopener noreferrer">
                  <span className={`cv-id-mark id-${profile.key}`} aria-hidden="true">{profile.key === "orcid" ? "iD" : profile.badge[0]}</span>
                  <span className="cv-id-label">{profile.badge}</span>
                  {(profile.key === "orcid" || profile.key === "scopus" || profile.key === "researcherId") && <span className="cv-id-value">{profile.value}</span>}
                </a>
              </li>
            ))}
          </ul>
        )}
      </header>
      {sections.length === 0
        ? <p className="cv-empty">Turn on a few sections in “Sections &amp; layout” to fill your CV.</p>
        : sections.map(section => <Section key={section.id} section={section} cv={cv} />)}
    </article>
  )
}
