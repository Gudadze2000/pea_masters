import type { RecordDef } from './evaluation-model'

/**
 * ISU School of Technology — academic staff self-assessment form (based on the 2023 Google Form).
 * Each numbered item is a record type: one entry = one unit (one article, one semester, one grant …).
 * `maxPoints` comes from the answer options of the original form; items whose form offered
 * "more than …" have no cap. The four "write your total" questions (1.8, 2.46, 3.9, 4.0) are calculated.
 */

export type PartId = 'teaching' | 'research' | 'social'

export type Part = {
  id: PartId
  numeral: string
  name: string
  georgian: string
  /** Shown under the part heading */
  rule: string
  min?: number
  /** Points above this are not counted towards the total */
  cap?: number
  items: RecordDef[]
}

/** Minimum total over the two-year assessment period */
export const TOTAL_MINIMUM = 200

type ItemOptions = { icon?: string; variablePoints?: string; note?: string }

function item(code: string, points: number, maxPoints: number | null, name: string, georgian: string, hint: string, options: ItemOptions = {}): RecordDef {
  const fixed = !options.variablePoints
  return {
    id: `isu-${code.replace('.', '-')}`,
    code,
    name,
    georgian,
    points,
    icon: options.icon ?? 'imgIconFile1',
    required: false,
    maxPoints: maxPoints ?? undefined,
    maxEntries: fixed && maxPoints !== null ? Math.round(maxPoints / points) : undefined,
    variablePoints: options.variablePoints,
    hint: options.note ? `${hint} ${options.note}` : hint,
  }
}

const event = 'Event name, year and link.'
const grant = 'Grant name, year and number.'
const nameYear = 'Name and year.'
const article = 'Article title, journal, year and link.'
const book = 'Title, year, publisher and link.'
const chapter = 'Title, year, publisher, chapter and link.'
const journal = 'Journal name and link.'

export const parts: Part[] = [
  {
    id: 'teaching',
    numeral: 'I',
    name: 'Teaching',
    georgian: 'სწავლების კომპონენტი',
    rule: 'Required · at least 80 points',
    min: 80,
    items: [
      item('1.1', 20, null, 'Teaching a course at ISU with the minimum contract hours', 'სასწავლო კურსის წაკითხვა შრომითი ხელშეკრულებით გათვალისწინებული მინიმალური საათობრივი დატვირთვით', 'Course name(s) and number of groups for the semester. You can check past semesters in Argus.', {
        icon: 'imgIconBook1',
        variablePoints: '20 points per semester at the contract minimum. Below the minimum: −2 points per missing hour; above it: +4 points per extra hour (per semester). Add one entry per semester.',
      }),
      item('1.2', 2.5, null, 'Lecture at a partner university (San Diego State University – Georgia)', 'პარტნიორ უნივერსიტეტებში (სან-დიეგოს სახელმწიფო უნივერსიტეტი- საქართველო) ჩატარებული ლექცია', 'Lecture name(s) for the semester.', { icon: 'imgIconUsers' }),
      item('1.3', 15, 60, 'Leading an academic programme (per academic year)', 'ერთი აკადემიური პროგრამის ხელმძღვანელობა', 'Programme name(s).', { icon: 'imgIconGrad' }),
      item('1.4', 10, null, 'Supervising a bachelor’s thesis (per semester)', 'ერთი საბაკალავრო ნაშრომის ხელმძღვანელობა', 'Student name(s) by semester.', { icon: 'imgIconGrad' }),
      item('1.5', 5, 30, 'Developing the core documents of a new study programme (not a new course)', 'ახალი სასწავლო პროგრამის ძირითადი დოკუმენტების შემუშავებაში მონაწილეობა (გარდა ახალი სასწავლო კურსის შემუშავებისა)', 'Programme name.', { icon: 'imgIconEdit' }),
      item('1.6', 5, 40, 'Developing a new course', 'ახალი სასწავლო კურსის შემუშავება', 'Course name(s) and year.', { icon: 'imgIconEdit' }),
      item('1.7', 10, 40, 'Initiating or creating an international / joint study programme', 'საერთაშორისო/ერთობლივი საგანმანათლებლო პროგრამის ინიციატორობა/შექმნა', 'Programme name and year.', { icon: 'imgIconBuilding' }),
    ],
  },
  {
    id: 'research',
    numeral: 'II',
    name: 'Research',
    georgian: 'კვლევის კომპონენტი',
    rule: 'Required · at least 60 points',
    min: 60,
    items: [
      item('2.1', 50, 300, 'Article in an indexed journal — impact factor above 0.5 (Clarivate WoS) or CiteScore above 0.5 (Scopus)', 'სტატია საერთაშორისო ბაზებში შემავალ რეფერირებად ჟურნალში - 0.5-ზე მეტი იმპაქტ ფაქტორით ან ციტირების ქულით', article),
      item('2.2', 40, 80, 'Article in an indexed journal — impact factor or CiteScore of 0.5 or less', 'სტატია საერთაშორისო ბაზებში შემავალ რეფერირებად ჟურნალში - არა უმეტეს 0.5 იმპაქტ ფაქტორით ან ციტირების ქულით', article),
      item('2.3', 30, 120, 'Article in an international scientific collection', 'სტატია საერთაშორისო სამეცნიერო კრებულში', article),
      item('2.4', 10, 60, 'Article in a local peer-reviewed journal or collection', 'სტატია ადგილობრივ რეფერირებად სამეცნიერო ჟურნალში და/ან კრებულში', article),
      item('2.5', 70, 210, 'Monograph published abroad (recognised Western publisher)', 'უცხოეთში გამოცემული სამეცნიერო მონოგრაფია', book, { icon: 'imgIconBook1' }),
      item('2.6', 30, 90, 'Chapter in a monograph published abroad', 'უცხოეთში გამოცემული სამეცნიერო მონოგრაფიის თავის ავტორობა', chapter, { icon: 'imgIconBook1' }),
      item('2.7', 50, 150, 'Monograph published by ISU with international peer review', 'ილიას სახელმწიფო უნივერსიტეტის საერთაშორისო რეფერირებით გამოცემული სამეცნიერო მონოგრაფია', book, { icon: 'imgIconBook1' }),
      item('2.8', 20, 100, 'Chapter in an ISU monograph with international peer review', 'ილიას სახელმწიფო უნივერსიტეტის საერთაშორისო რეფერირებით გამოცემულ სამეცნიერო მონოგრაფიაში თავის ავტორობა', chapter, { icon: 'imgIconBook1' }),
      item('2.9', 20, 80, 'Scientific translation from the original with the ISU logo (scientific book)', 'სამეცნიერო თარგმანი ორიგინალიდან ილიას სახელმწიფო უნივერსიტეტის ლოგოთი (სამეცნიერო წიგნი)', chapter, { icon: 'imgIconBook' }),
      item('2.10', 15, 60, 'Paper in international conference proceedings', 'სტატია საერთაშორისო კონფერენციის მასალების კრებულში', 'Paper title, proceedings title, year and link.'),
      item('2.11', 5, 30, 'Paper in local conference proceedings', 'სტატია ადგილობრივი კონფერენციის მასალების კრებულში', 'Paper title, proceedings title, year and link.'),
      item('2.12', 30, 90, 'Textbook published under the ISU name and logo', 'ილიას სახელმწიფო უნივერსიტეტის სახელითა და ლოგოთი გამოსული დარგობრივი სახელმძღვანელო', 'Textbook title, year and link.', { icon: 'imgIconBook' }),
      item('2.13', 15, 60, 'Chapter in a textbook published under the ISU name and logo', 'ილიას სახელმწიფო უნივერსიტეტის სახელითა და ლოგოთი გამოსული დარგობრივი სახელმძღვანელოს თავის ავტორობა', 'Textbook title, chapter title, year and link.', { icon: 'imgIconBook' }),
      item('2.14', 15, 60, 'Textbook or guide published in Georgia (author credited as an ISU professor)', 'საქართველოში გამოცემული დარგობრივი სახელმძღვანელო/გზამკვლევი', 'Textbook title, year and link.', { icon: 'imgIconBook' }),
      item('2.15', 7, 28, 'Chapter in a textbook or guide published in Georgia (author credited as an ISU professor)', 'საქართველოში გამოცემული დარგობრივი სახელმძღვანელოს/გზამკვლევის თავის ავტორობა', 'Textbook title, chapter title, year and link.', { icon: 'imgIconBook' }),
      item('2.16', 5, 30, 'Professional publication (not peer-reviewed: a research report or a database you created)', 'პროფესიული პუბლიკაცია', 'Publication title, year and link.', { icon: 'imgIconFile2' }),
      item('2.17', 40, 160, 'Leading an international research grant', 'საერთაშორისო კვლევითი გრანტის ხელმძღვანელობა', grant, { icon: 'imgIconFlask' }),
      item('2.18', 20, 80, 'Taking part in an international research grant', 'საერთაშორისო კვლევით გრანტში მონაწილეობა', grant, { icon: 'imgIconFlask' }),
      item('2.19', 20, 60, 'Leading a national research grant or project', 'ეროვნული კვლევითი გრანტის/პროექტის ხელმძღვანელობა', grant, { icon: 'imgIconFlask' }),
      item('2.20', 15, 45, 'Taking part in a national research grant or project', 'ეროვნულ კვლევით გრანტში/პროექტში ჩართულობა', grant, { icon: 'imgIconFlask' }),
      item('2.21', 10, 50, 'Leading an ISU research grant', 'ილიას სახელმწიფო უნივერსიტეტის მიერ გაცემული კვლევითი გრანტის ხელმძღვანელობა', nameYear, { icon: 'imgIconFlask' }),
      item('2.22', 5, 25, 'Taking part in an ISU research grant', 'ილიას სახელმწიფო უნივერსიტეტის მიერ გაცემულ კვლევით გრანტში მონაწილეობა', nameYear, { icon: 'imgIconFlask' }),
      item('2.23', 5, 30, 'Leading any other grant or project that funds at least one student (total salary 1,500 GEL or more)', 'ნებისმიერი სხვა სახის გრანტის/პროექტის ხელმძღვანელობა, რომლის ბიუჯეტში გათვალისწინებულია მინიმუმ 1 სტუდენტის ჩართულობა', nameYear, { icon: 'imgIconFlask' }),
      item('2.24', 5, 25, 'Member of an international collaboration', 'საერთაშორისო კოლაბორაციის წევრობა', nameYear, { icon: 'imgIconUsers' }),
      item('2.25', 5, 30, 'Award or scholarship', 'ჯილდო/სტიპენდიები', nameYear, { icon: 'imgIconAward' }),
      item('2.26', 40, 120, 'International patent', 'საერთაშორისო პატენტი', 'Name, year and number.', { icon: 'imgIconAward' }),
      item('2.27', 15, 45, 'National patent', 'ეროვნული პატენტი', 'Name, year and number.', { icon: 'imgIconAward' }),
      item('2.28', 20, 100, 'Plenary talk at an international seminar, symposium, conference or congress', 'საერთაშორისო სამეცნიერო სემინარზე/სიმპოზიუმზე/კონფერენციაზე/კონგრესზე პლენარული მოხსენების გაკეთება', event, { icon: 'imgIconUsers' }),
      item('2.29', 15, 60, 'Talk at an international seminar, symposium, conference or congress', 'საერთაშორისო სამეცნიერო სემინარზე/სიმპოზიუმზე/კონფერენციაზე/კონგრესზე მოხსენების გაკეთება', event, { icon: 'imgIconUsers' }),
      item('2.30', 5, 25, 'Poster at an international seminar, symposium, conference or congress', 'საერთაშორისო სამეცნიერო სემინარზე/სიმპოზიუმზე/კონფერენციაზე/კონგრესზე სასტენდო პრეზენტაციის გაკეთება', event, { icon: 'imgIconUsers' }),
      item('2.31', 5, 25, 'Talk at a local seminar, symposium, conference or congress', 'ადგილობრივ სემინარზე/სიმპოზიუმზე/კონფერენციაზე/კონგრესზე მოხსენების გაკეთება', event, { icon: 'imgIconUsers' }),
      item('2.32', 2, 10, 'Poster at a local seminar, symposium, conference or congress', 'ადგილობრივ სემინარზე/სიმპოზიუმზე/კონფერენციაზე/კონგრესზე სასტენდო პრეზენტაციის გაკეთება', event, { icon: 'imgIconUsers' }),
      item('2.33', 15, 45, 'Scientific computing software published on GitHub under the university’s name', 'პროგრამული უზრუნველყოფის შემუშავება, რომელიც ეძღვნება სამეცნიერო გამოთვლებს და განთავსებულია github-ზე უნივერსიტეტის სახელით', 'Name, year and link.', {
        icon: 'imgIconSettings',
        variablePoints: 'Only one program gets 15 points; each further program gets 5. A co-authored program gets 10.',
      }),
      item('2.34', 15, 60, 'Taking part in an architectural project', 'არქიტექტურულ პროექტში მონაწილეობა', 'Name, year and link.', { icon: 'imgIconBuilding' }),
      item('2.35', 20, 80, 'Supervising a doctoral dissertation (up to 5 doctoral students)', 'ერთი სადისერტაციო ნაშრომის ხელმძღვანელობა (არაუმეტეს 5 დოქტორანტისა)', 'Student’s full name, by academic year.', { icon: 'imgIconGrad', note: 'Each dissertation counts only once.' }),
      item('2.36', 15, 150, 'Supervising a master’s thesis (up to 5 theses per academic year)', 'ერთი სამაგისტრო ნაშრომის ხელმძღვანელობა (არაუმეტეს 5 ნაშრომისა ერთ სასწავლო წელს)', 'Students’ full names, by year.', { icon: 'imgIconGrad', note: 'Each thesis counts only once.' }),
      item('2.37', 5, 20, 'Reviewing a doctoral dissertation', 'ერთი სადისერტაციო ნაშრომის რეცენზირება', 'Student’s full name and year.', { icon: 'imgIconCheck' }),
      item('2.38', 5, 30, 'Reviewing a master’s thesis', 'ერთი სამაგისტრო ნაშრომის რეცენზირება', 'Student’s full name and year.', { icon: 'imgIconCheck' }),
      item('2.39', 2, 20, 'Mentoring a student group in practice research (per semester)', 'სტუდენტთა ჯგუფის მენტორობა პრაქტიკის კვლევის საქმიანობაში', 'Students’ full names and semesters.', { icon: 'imgIconUsers' }),
      item('2.40', 10, 30, 'Editor or associate editor of an international peer-reviewed journal', 'საერთაშორისო სამეცნიერო რეფერირებადი ჟურნალის რედაქტორობა ან ასოცირებული რედაქტორობა', journal, { icon: 'imgIconEdit' }),
      item('2.41', 5, 20, 'Editor of a local peer-reviewed journal', 'ადგილობრივი სამეცნიერო რეფერირებადი ჟურნალის რედაქტორობა', journal, { icon: 'imgIconEdit' }),
      item('2.42', 3, 15, 'Editorial board member of an international peer-reviewed journal', 'საერთაშორისო სამეცნიერო რეფერირებადი ჟურნალის რედკოლეგიის წევრობა', journal, { icon: 'imgIconEdit' }),
      item('2.43', 2, 10, 'Editorial board member of a local peer-reviewed journal', 'ადგილობრივი სამეცნიერო რეფერირებადი ჟურნალის რედკოლეგიის წევრობა', journal, { icon: 'imgIconEdit' }),
      item('2.44', 5, 20, 'Peer review of international conference proceedings', 'საერთაშორისო კონფერენციის მასალების სამეცნიერო რეფერირება', 'Conference name, year and link.', { icon: 'imgIconCheck' }),
      item('2.45', 2, 10, 'Peer review of local conference proceedings', 'ადგილობრივი კონფერენციის მასალების სამეცნიერო რეფერირება', 'Conference name, year and link.', { icon: 'imgIconCheck' }),
    ],
  },
  {
    id: 'social',
    numeral: 'III',
    name: 'Social impact',
    georgian: 'სოციალური იმპაქტის კომპონენტი',
    rule: 'Optional · counts up to 20 points',
    cap: 20,
    items: [
      item('3.1', 20, 60, 'Organising an international conference', 'საერთაშორისო კონფერენციების ორგანიზება', 'Conference name, year and link.', { icon: 'imgIconUsers' }),
      item('3.2', 10, 50, 'Organising a seasonal school', 'სეზონური სკოლების ორგანიზება', nameYear, { icon: 'imgIconGrad' }),
      item('3.3', 5, 20, 'Creating or running a certificate programme or training course (LLL)', 'სასერტიფიკატო პროგრამების/ტრენინგ კურსების შექმნა, განხორციელება (LLL)', nameYear, { icon: 'imgIconGrad' }),
      item('3.4', 10, 40, 'Organising an international or local workshop (externally funded)', 'საერთაშორისო ან ადგილობრივი ვორქშოფის ორგანიზება (გრანტი გარე რესურსებით მიღებული)', nameYear, { icon: 'imgIconUsers' }),
      item('3.5', 5, 25, 'Serving on international, government, expert or other commissions and organisations', 'საერთაშორისო, სამთავრობო, საექსპერტო და სხვა კომისიებსა და ორგანიზაციებში მონაწილეობა', nameYear, { icon: 'imgIconBuilding' }),
      item('3.6', 10, 40, 'Organising professional development trainings or workshops', 'პროფესიული განვითარების ტრენინგების, ვორქშოფების ორგანიზება', nameYear, { icon: 'imgIconUsers' }),
      item('3.7', 2, 10, 'Attending professional development trainings or workshops', 'პროფესიული განვითარების ტრენინგებზე, ვორქშოფებზე დასწრება', nameYear, { icon: 'imgIconUser' }),
      item('3.8', 2, 8, 'Public lecture', 'საჯარო ლექცია', nameYear, { icon: 'imgIconUsers' }),
    ],
  },
]
