import { Link } from "react-router"
import "./PrivacyPage.css"

/*
 * Public: no sign-in needed, so Google (and anyone) can read it before signing in.
 * Every statement here describes what PEA actually does; change it when PEA changes.
 */

const UPDATED = "20 November 2026"

export function PrivacyPage() {
  return (
    <div className="privacy-page">
      <header className="privacy-header">
        <Link to="/login" className="privacy-brand">
          <span aria-hidden="true">PEA</span>
          <div><p>Personnel Evaluation</p><small>Ilia State University</small></div>
        </Link>
        <Link to="/login" className="privacy-signin">Sign in</Link>
      </header>

      <main className="privacy-content">
        <h1>Privacy</h1>
        <p className="privacy-updated">Last updated {UPDATED}</p>

        <p className="privacy-lead">
          PEA (Personnel Evaluation and Academic profile) is Ilia State University's system where academic staff keep
          their profile and CV and submit evaluation forms, and heads of department review them. This page explains what
          PEA keeps about you, who can see it and which outside services it uses.
        </p>

        <section aria-labelledby="who">
          <h2 id="who">Who runs PEA</h2>
          <p>
            Ilia State University runs PEA on its own server and is responsible for the information in it. Only people
            the university has registered can sign in, with their university Google account.
          </p>
        </section>

        <section aria-labelledby="what">
          <h2 id="what">What PEA keeps</h2>
          <ul>
            <li><strong>From your Google account, when you sign in:</strong> your name, email address and Google's identifier for your account. PEA never sees your password and has no access to your email, files or anything else in your Google account.</li>
            <li><strong>Entered by your organization's Admins:</strong> your roles, faculty, department and position.</li>
            <li><strong>Entered by you:</strong> your biography, photo, qualifications and their supporting documents, research and teaching interests, video lecture links, research identifiers (ORCID iD, Web of Science ResearcherID, Scopus Author ID), your CV, and your evaluation entries with their evidence files.</li>
            <li><strong>Added by reviewers:</strong> decisions on your evaluation entries and forms, their comments and your final score.</li>
            <li><strong>Records that keep PEA secure:</strong> when you sign in, the IP address you use, every change made to information in PEA and by whom (the audit log), and your notifications.</li>
          </ul>
        </section>

        <section aria-labelledby="see">
          <h2 id="see">Who can see it</h2>
          <ul>
            <li><strong>You</strong> see everything about yourself.</li>
            <li><strong>Your head of department</strong> (your coordinator) sees your profile, supporting documents and evaluation forms, to review them.</li>
            <li><strong>Your organization's Admins</strong> see the same for everyone in the organization, to manage PEA.</li>
            <li><strong>Other people in your organization</strong> may see your name and photo, for example where you are someone's coordinator.</li>
            <li><strong>The people who maintain PEA</strong> can reach the information when they need to keep PEA running.</li>
          </ul>
          <p>Nothing in PEA is public on the internet: every page needs signing in. (A CV you mark as "public" isn't published anywhere yet.)</p>
        </section>

        <section aria-labelledby="services">
          <h2 id="services">Outside services</h2>
          <p>PEA sends each of these services only what it needs for one job, never your profile, CV or evaluation:</p>
          <ul>
            <li><strong>Google:</strong> to sign you in.</li>
            <li><strong>Clarivate Web of Science:</strong> the DOIs you enter, to check whether an article is indexed, and your ResearcherID or ORCID iD, to find your publications.</li>
            <li><strong>Crossref:</strong> DOIs and journals' ISSNs, to check articles that aren't in Web of Science.</li>
            <li><strong>ORCID:</strong> when you connect your ORCID iD you sign in at ORCID, and PEA reads the public works on your ORCID record when you import them.</li>
            <li><strong>YouTube or Vimeo:</strong> a video lecture's player loads from them, in YouTube's privacy-enhanced mode or with Vimeo's do-not-track setting.</li>
          </ul>
        </section>

        <section aria-labelledby="cookies">
          <h2 id="cookies">Cookies and your browser</h2>
          <p>
            PEA uses one cookie to keep you signed in (it ends when you sign out, or after 12 hours) and a short-lived one
            while Google signs you in. Your preferences, such as language and colour theme, are kept in your browser only.
            There are no advertising or tracking cookies and no analytics.
          </p>
        </section>

        <section aria-labelledby="keep">
          <h2 id="keep">How long it's kept</h2>
          <p>
            Your information stays in PEA while you belong to the organization, and evaluation records as long as the
            university needs them. A deactivated account can no longer sign in, but its evaluation records remain. The
            audit log is never edited. Backups are made every night and kept for 14 days.
          </p>
        </section>

        <section aria-labelledby="security">
          <h2 id="security">Security</h2>
          <p>
            PEA is only reachable over an encrypted connection (HTTPS), shows each person only what their role allows,
            and records every change and every refused attempt to see something. It stores no passwords: signing in is
            done by Google.
          </p>
        </section>

        <section aria-labelledby="choices">
          <h2 id="choices">Your choices</h2>
          <p>
            You can see and correct most of your information yourself, in My profile, the CV builder and Settings. For
            anything else, such as your department or position, a question about who has seen your information, or a
            request to remove it, contact your organization's PEA Admin or Ilia State University.
          </p>
        </section>
      </main>

      <footer className="privacy-footer">
        <span>Ilia State University · PEA</span>
        <Link to="/login">Back to sign in</Link>
      </footer>
    </div>
  )
}
