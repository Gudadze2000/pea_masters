import type { Language } from "@/lib/language-context"

/** Front-end sample data. Replace with API calls when the back end exists. */
export type GeneralInformation = {
  /** Biography HTML per content language */
  biography: Record<Language, string>
  /** Photo as a data URL, or null to show initials */
  photo: string | null
}

export const BIOGRAPHY_MAX_LENGTH = 3000

export const initialGeneralInformation: GeneralInformation = {
  biography: {
    EN:
      "<p>Nino Beridze is an Associate Professor of Biology at Ilia State University. Her research focuses on plant molecular genetics and the adaptation of Caucasian flora to climate change.</p>" +
      "<p>She has coordinated two international research projects and supervised five doctoral students. She teaches molecular biology and bioinformatics at the BA and MA levels.</p>",
    KA: "",
  },
  photo: null,
}

/** Read-only, managed by the faculty admin */
export const institutionalInformation = {
  fullName: "Nino Beridze",
  initials: "NB",
  email: "nino.beridze@iliauni.edu.ge",
  faculty: "Natural Sciences and Medicine",
  direction: "Biology",
  position: "Associate Professor",
}
