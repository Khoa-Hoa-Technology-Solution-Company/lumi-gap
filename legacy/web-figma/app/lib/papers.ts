export type PublicPaper = {
  _id: string;
  title: string;
  doi: string;
  paperType: string;
  paperLink: string;
  abstract: string;
  authors?: string[];
  keywords: string[];
  relatedSemesters?: string[];
  applicationDomain?: string;
  publishedYear: number;
  status: 'pending' | 'approved' | 'rejected' | 'downloaded' | 'not-downloaded' | 'pending-requester-acceptance';
  pdfPath?: string;
  uploadedBy?: {
    _id: string;
    fullName?: string;
    university?: string;
    email?: string;
    role?: 'user' | 'admin';
  };
  requestedBy?: {
    _id: string;
    fullName?: string;
    university?: string;
    email?: string;
    role?: 'user' | 'admin';
  };
  uploadedAt?: string;
  averageRating: number;
  totalRatings: number;
  downloadCount: number;
  metadataScore?: number;
  sourceScore?: number;
  duplicateScore?: number;
  relevanceScore?: number;
  prestigeScore?: number;
  utilityScore?: number;
  qualityScore?: number;
  qualityTier?: number;
  qualityTierName?: string;
  downloadCost?: number | null;
  uploadCreditReward?: number;
  createdAt: string;
};

export const PAPER_TYPES = [
  'Survey',
  'Research',
  'Preprint',
  'Conference Paper',
  'Journal Article',
  'Book Chapter',
  'Thesis',
  'Technical Report',
  'Workshop Paper',
  'Review Article',
  'Case Study',
  'Position Paper',
  'Editorial',
  'White Paper',
  'Research Note',
  'Short Communication',
  'Letter to Editor',
  'News & Views',
  'Commentary',
  'Tutorial',
  'Abstract',
  'Extended Abstract',
  'Poster Paper',
  'Data Paper',
  'Software Paper',
  'Patent',
  'Book Review',
  'Erratum',
  'Corrigendum',
  'Retraction Notice',
  'Proposal',
  'Other',
];

export const RELATED_SEMESTERS: { value: string; label: string }[] = [
  { value: 'semester_1', label: 'Semester 1' },
  { value: 'semester_2', label: 'Semester 2' },
  { value: 'semester_3', label: 'Semester 3' },
  { value: 'semester_4', label: 'Semester 4' },
  { value: 'semester_5', label: 'Semester 5' },
  { value: 'semester_6', label: 'Semester 6' },
  { value: 'semester_7', label: 'Semester 7' },
  { value: 'semester_8', label: 'Semester 8' },
  { value: 'semester_9', label: 'Semester 9' },
];

export const APPLICATION_DOMAINS = [
  'Software Engineering',
  'Machine Learning',
  'Natural Language Processing',
  'Computer Vision',
  'Data Science',
  'Cybersecurity',
  'Cloud Computing',
  'Database Systems',
  'Distributed Systems',
  'Blockchain',
  'IoT (Internet of Things)',
  'Bioinformatics',
  'Healthcare IT',
  'Finance/FinTech',
  'Education',
  'Other',
];

export function getSemesterLabel(value?: string) {
  if (!value) return value || '';
  const item = RELATED_SEMESTERS.find((s) => s.value === value);
  return item ? item.label : value;
}

export function getPaperAuthors(paper: PublicPaper) {
  if (paper.authors && paper.authors.length > 0) {
    return paper.authors.join(', ');
  }

  return paper.requestedBy?.fullName ? `Requested by ${paper.requestedBy.fullName}` : 'Requested by unknown user';
}

export function getPaperType(paper: PublicPaper) {
  return paper.paperType || 'N/A';
}

export function getPdfUrl(pdfPath?: string) {
  if (!pdfPath) return '';
  if (/^https?:\/\//i.test(pdfPath)) return pdfPath;

  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  return `${new URL(apiBaseUrl).origin}${pdfPath}`;
}
