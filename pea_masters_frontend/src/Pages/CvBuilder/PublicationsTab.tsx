import { ResearchOutputsSection } from "@/Pages/Profile/sections/ResearchOutputsSection"
import { CITATION_STYLES, type CitationStyle, type CvData } from "./cv-model"
import { Segmented } from "./cv-ui"
import type { ChangeCv } from "./form-utils"

/**
 * "Research outputs" tab: the citation style, then the publications, datasets and software kept on My profile.
 * Adding or changing one here changes the profile; each CV only chooses which of them it shows.
 */
export function PublicationsTab({ cv, change }: { cv: CvData; change: ChangeCv }) {
  const toggle = (id: string, shown: boolean) => change(current => ({
    ...current,
    hiddenOutputs: shown ? current.hiddenOutputs.filter(other => other !== id) : [...new Set([...current.hiddenOutputs, id])],
  }))
  return (
    <div className="cv-tab-panel">
      <section className="dashboard-card cv-card" aria-labelledby="cv-style-heading">
        <div className="cv-inline-setting">
          <span id="cv-style-heading">Citation style</span>
          <Segmented<CitationStyle>
            label="Citation style"
            value={cv.citationStyle}
            options={CITATION_STYLES.map(style => ({ value: style, label: style }))}
            onChange={citationStyle => change(current => ({ ...current, citationStyle }))}
          />
        </div>
      </section>
      <ResearchOutputsSection cv={{ hidden: new Set(cv.hiddenOutputs), onToggle: toggle }} />
    </div>
  )
}
