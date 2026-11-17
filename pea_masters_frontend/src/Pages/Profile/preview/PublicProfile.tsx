import { Building2, Mail } from "lucide-react"
import type { ResearchOverview } from "../research/researchMock"
import type { Entry, SectionDef } from "../qualifications/sections"
import "@/components/forms/forms.css"
import "../ProfilePage.css"
import "../qualifications/QualificationsPage.css"
import "../research/ResearchPage.css"
import "./PublicProfile.css"

export type PublicProfileData = {
  name: string
  initials: string
  photo: string | null
  /** Position, department, faculty: whatever is known */
  place: string[]
  organization: string
  email: string
  /** Biography HTML, already cleaned by the server (app/richtext.py), and its language */
  biography: { html: string; lang: "en" | "ka" } | null
  /** Only the entries visitors may see, section by section, in profile order */
  qualifications: { section: SectionDef; entries: Entry[] }[]
  teaching: { interests: string[]; programmes: { id: string; name: string; level: string; year: string }[] }
  research: ResearchOverview
}

const period = (start: string, end: string) => `${start} - ${end || "present"}`

/**
 * A researcher's profile as other people see it: read-only, without review statuses, attachments or anything
 * meant only for the owner or reviewers. Used by the owner's preview; meant for the public profile page too.
 */
export function PublicProfile({ data }: { data: PublicProfileData }) {
  const { teaching, research } = data
  const hasTeaching = teaching.interests.length > 0 || teaching.programmes.length > 0
  const hasResearch = research.interests.length > 0 || research.projects.length > 0 || research.collaborations.length > 0 || research.organisations.length > 0
  const empty = !data.biography && data.qualifications.length === 0 && !hasTeaching && !hasResearch

  return (
    <article className="public-profile" aria-label={`Profile of ${data.name}`}>
      <header className="public-profile-header">
        <div className="profile-header-avatar" aria-hidden="true">{data.photo ? <img src={data.photo} alt="" /> : data.initials}</div>
        <div className="public-profile-identity">
          <h2>{data.name}</h2>
          {data.place.length > 0 && <p>{data.place.join(" · ")}</p>}
          {data.organization && <small><Building2 aria-hidden="true" />{data.organization}</small>}
          {data.email && <small><Mail aria-hidden="true" /><a href={`mailto:${data.email}`}>{data.email}</a></small>}
        </div>
      </header>

      {empty && <p className="public-profile-empty">Nothing else has been added to this profile yet.</p>}

      {data.biography && (
        <section className="public-profile-section" aria-labelledby="public-about">
          <h3 id="public-about">About</h3>
          {/* Cleaned on the server before it was stored */}
          <div className="public-profile-bio" lang={data.biography.lang} dangerouslySetInnerHTML={{ __html: data.biography.html }} />
        </section>
      )}

      {data.qualifications.map(({ section, entries }) => (
        <section key={section.id} className="public-profile-section" aria-labelledby={`public-${section.id}`}>
          <h3 id={`public-${section.id}`}>{section.label}</h3>
          <ul className="public-profile-entries">
            {entries.map(entry => {
              const meta = section.metaOf(entry.values)
              const description = section.descriptionOf(entry.values)
              return (
                <li key={entry.id}>
                  <p className="public-entry-title">{section.titleOf(entry.values)}</p>
                  {meta.length > 0 && (
                    <ul className="entry-meta">
                      {meta.map(({ icon: Icon, text, href }) => (
                        <li key={text}>
                          <Icon aria-hidden="true" />
                          {href ? <a href={href} target="_blank" rel="noopener noreferrer">{text}</a> : text}
                        </li>
                      ))}
                    </ul>
                  )}
                  {description && <p className="public-entry-description">{description}</p>}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {hasTeaching && (
        <section className="public-profile-section" aria-labelledby="public-teaching">
          <h3 id="public-teaching">Teaching</h3>
          {teaching.interests.length > 0 && <Chips label="Teaching interests" items={teaching.interests} />}
          {teaching.programmes.length > 0 && (
            <>
              <h4>Programmes &amp; modules</h4>
              <ul className="public-profile-list">
                {teaching.programmes.map(item => <li key={item.id}><span>{item.name}</span><small>{item.level} · {item.year}</small></li>)}
              </ul>
            </>
          )}
        </section>
      )}

      {hasResearch && (
        <section className="public-profile-section" aria-labelledby="public-research">
          <h3 id="public-research">Research</h3>
          {research.interests.length > 0 && <Chips label="Research interests" items={research.interests} />}
          {research.projects.length > 0 && (
            <>
              <h4>Projects</h4>
              <ul className="public-profile-list">
                {research.projects.map(project => (
                  <li key={project.id}>
                    <span>{project.title}</span>
                    <small>{project.role} · {project.donor} · {period(project.startYear, project.endYear)} <span className={`type-pill ${project.type === "International" ? "international" : "local"}`}>{project.type}</span></small>
                  </li>
                ))}
              </ul>
            </>
          )}
          {research.collaborations.length > 0 && (
            <>
              <h4>Collaborators</h4>
              <ul className="public-profile-list">
                {research.collaborations.map(person => <li key={person.id}><span>{person.name}</span><small>{person.institution} · {person.topic}</small></li>)}
              </ul>
            </>
          )}
          {research.organisations.length > 0 && (
            <>
              <h4>Collaborating universities &amp; organisations</h4>
              <ul className="public-profile-list">
                {research.organisations.map(name => <li key={name}><span>{name}</span></li>)}
              </ul>
            </>
          )}
        </section>
      )}
    </article>
  )
}

function Chips({ label, items }: { label: string; items: string[] }) {
  return (
    <>
      <h4>{label}</h4>
      <ul className="keyword-chips" aria-label={label}>
        {items.map(item => <li key={item} className="keyword-chip">{item}</li>)}
      </ul>
    </>
  )
}
