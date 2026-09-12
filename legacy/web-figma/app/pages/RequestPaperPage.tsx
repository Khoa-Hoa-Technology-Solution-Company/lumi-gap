import { useRef, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Sidebar } from '../components/Sidebar';
import { ArrowLeft } from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { apiRequest } from '../lib/api';
import { PAPER_TYPES, RELATED_SEMESTERS, APPLICATION_DOMAINS } from '../lib/papers';

const MAX_PDF_SIZE = 50 * 1024 * 1024;

type RequestPaperPageProps = {
  role?: 'user' | 'admin';
};

export function RequestPaperPage({ role = 'user' }: RequestPaperPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAdmin = role === 'admin';
  const isContribution = !isAdmin && searchParams.get('mode') === 'contribute';
  const dashboardPath = isAdmin ? '/admin' : '/dashboard';
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    doi: '',
    paperType: '',
    link: '',
    authors: '',
    abstract: '',
    keywords: '',
    year: '',
    relatedSemesters: [] as string[],
    applicationDomain: '',
    applicationDomainOther: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target as HTMLInputElement;
    setFormData({
      ...formData,
      [name]: value,
    });
    setError('');
    setMessage('');
  };

  const handleSemesterToggle = (value: string, checked: boolean) => {
    const next = new Set(formData.relatedSemesters);
    if (checked) next.add(value); else next.delete(value);
    setFormData({ ...formData, relatedSemesters: Array.from(next) });
    setError('');
    setMessage('');
  };
  const [showSemesters, setShowSemesters] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    function handleDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (showSemesters) {
        if (
          popoverRef.current && !popoverRef.current.contains(target) &&
          toggleRef.current && !toggleRef.current.contains(target)
        ) {
          setShowSemesters(false);
        }
      }
    }

    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [showSemesters]);

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  const setPdfFile = (file?: File) => {
    setError('');
    setMessage('');

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (file.type !== 'application/pdf') {
      setSelectedFile(null);
      setError('Please choose a PDF file.');
      return;
    }

    if (file.size > MAX_PDF_SIZE) {
      setSelectedFile(null);
      setError('PDF file must be 50MB or smaller.');
      return;
    }

    setSelectedFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPdfFile(e.target.files?.[0]);
  };

  const handleFileDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
    setPdfFile(event.dataTransfer.files?.[0]);
  };

  const handleFileDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFile(true);
  };

  const handleFileDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingFile(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (isContribution && !selectedFile) {
      setError('Please choose a PDF file before submitting your contribution.');
      return;
    }

    const validationError = validatePaperRequest(formData);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      const formDataPayload = new FormData();
      formDataPayload.append('title', formData.title);
      formDataPayload.append('doi', formData.doi);
      formDataPayload.append('paperType', formData.paperType);
      formDataPayload.append('paperLink', formData.link);
      formDataPayload.append('authors', formData.authors);
      formDataPayload.append('abstract', formData.abstract);
      formDataPayload.append('keywords', formData.keywords);
      formDataPayload.append('publishedYear', formData.year);
        if (formData.relatedSemesters && formData.relatedSemesters.length > 0) {
          formDataPayload.append('relatedSemesters', formData.relatedSemesters.join(','));
        }

        const domainValue = formData.applicationDomain === 'Other' ? formData.applicationDomainOther : formData.applicationDomain;
        if (domainValue) formDataPayload.append('applicationDomain', domainValue);

      if (selectedFile) {
        formDataPayload.append('pdf', selectedFile);
      }

      await apiRequest('/papers', {
        method: 'POST',
        auth: true,
        body: formDataPayload,
      });

      setMessage(
        isAdmin
          ? 'Paper posted successfully.'
          : isContribution
          ? 'PDF contribution submitted successfully.'
          : 'Paper request submitted successfully.'
      );
      setSelectedFile(null);
      setTimeout(() => navigate(isAdmin ? '/admin' : '/my-requests'), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit paper request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormInvalid =
    !formData.title.trim() ||
    !formData.doi.trim() ||
    !formData.paperType.trim() ||
    !formData.link.trim() ||
    !formData.abstract.trim() ||
    !formData.authors.trim() ||
    !formData.keywords.trim() ||
    !formData.year ||
    formData.relatedSemesters.length === 0 ||
    (isContribution && !selectedFile) ||
    (!formData.applicationDomain.trim() || (formData.applicationDomain === 'Other' && !formData.applicationDomainOther.trim()));

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-surface-request bg-fixed">
      <Sidebar role={role} />

      <div className="min-w-0 flex-1">
        <AppHeader role={role} />
        <div className="p-8">
          <div className="max-w-3xl mx-auto">
          <button
            onClick={() => navigate(dashboardPath)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft size={20} />
            Back to Dashboard
          </button>

          <div className="mb-8">
            <h1 className="text-foreground mb-2">
              {isAdmin ? 'Post Research Paper' : isContribution ? 'Contribute a Research PDF' : 'Request Research Paper'}
            </h1>
            <p className="text-muted-foreground">
              {isAdmin
                ? 'Publish a paper directly to the research library.'
                : isContribution
                ? 'Share a PDF with the community and provide the paper details for review.'
                : 'Fill in the details of the paper you need.'}
            </p>
          </div>

          <div className="bg-white rounded-lg border border-border shadow-sm p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700">{error}</p>
              </div>
            )}

            {message && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-700">{message}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-foreground mb-2">Paper Title <span className="text-red-600">*</span></label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                  placeholder="Enter the full title of the research paper"
                  required
                />
              </div>

              {/* Row 2: DOI (left) and Paper Type (right) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-foreground mb-2">DOI <span className="text-red-600">*</span></label>
                  <input
                    type="text"
                    name="doi"
                    value={formData.doi}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                    placeholder="10.1234/example.2024"
                    required
                  />
                </div>

                <div>
                  <label className="block text-foreground mb-2">Paper Type <span className="text-red-600">*</span></label>
                  <select
                    name="paperType"
                    value={formData.paperType}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                    required
                  >
                    <option value="">Please Choose paper type</option>
                    {PAPER_TYPES.map((paperType) => (
                      <option key={paperType} value={paperType}>
                        {paperType}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Publication Year + Related Semesters (expandable) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <div>
                  <label className="block text-foreground mb-2">Publication Year <span className="text-red-600">*</span></label>
                  <input
                    type="number"
                    name="year"
                    value={formData.year}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                    placeholder="2024"
                    min={1900}
                    max={new Date().getFullYear() + 1}
                    required
                  />
                </div>

                <div>
                  <label className="block text-foreground mb-2">Related Semesters <span className="text-red-600">*</span></label>
                  <div className="relative">
                    <div className="flex items-center gap-3">
                      <button
                        ref={toggleRef}
                        type="button"
                        onClick={() => setShowSemesters((s) => !s)}
                        className="w-full md:w-auto text-sm px-3 py-2 border border-border rounded-md bg-input-background hover:bg-gray-50 text-center"
                        aria-expanded={showSemesters}
                      >
                        {formData.relatedSemesters.length > 0 ? `Selected (${formData.relatedSemesters.length})` : 'Select Semesters'}
                      </button>
                      <span className="text-muted-foreground text-sm">Click to expand and choose semesters</span>
                    </div>

                    {showSemesters && (
                      <div ref={popoverRef} className="absolute left-0 mt-2 z-30 w-full p-3 bg-white border border-border rounded-md shadow-lg">
                          <div className="p-1">
                            <div className="flex gap-4">
                              {(() => {
                                const cols = 3;
                                const perCol = Math.ceil(RELATED_SEMESTERS.length / cols);
                                return Array.from({ length: cols }).map((_, ci) => (
                                  <div key={ci} className="flex flex-col gap-2">
                                    {RELATED_SEMESTERS.slice(ci * perCol, (ci + 1) * perCol).map((s) => (
                                      <label key={s.value} className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
                                        <input
                                          type="checkbox"
                                          className="h-4 w-4 text-primary border-gray-300 rounded"
                                          checked={formData.relatedSemesters.includes(s.value)}
                                          onChange={(e) => handleSemesterToggle(s.value, e.target.checked)}
                                          aria-checked={formData.relatedSemesters.includes(s.value)}
                                          aria-label={s.label}
                                        />
                                        <span className="select-none">{s.label}</span>
                                      </label>
                                    ))}
                                  </div>
                                ));
                              })()}
                            </div>
                          </div>
                        <div className="flex justify-end mt-3">
                          <button type="button" onClick={() => setShowSemesters(false)} className="text-sm text-muted-foreground px-2 py-1">Done</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 4: Authors (required) */}
              <div>
                <label className="block text-foreground mb-2">Authors <span className="text-red-600">*</span></label>
                <input
                  type="text"
                  name="authors"
                  value={formData.authors}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                  placeholder="Nguyen Van A, Tran Thi B"
                  required
                />
                <p className="text-muted-foreground mt-2">Separate author names with commas.</p>
              </div>

              {/* Row 5: Paper Link */}
              <div>
                <label className="block text-foreground mb-2">Paper Link <span className="text-red-600">*</span></label>
                <input
                  type="url"
                  name="link"
                  value={formData.link}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                  placeholder="https://example.com/paper"
                  required
                />
              </div>

              {/* Row 6: Abstract */}
              <div>
                <label className="block text-foreground mb-2">Abstract <span className="text-red-600">*</span></label>
                <textarea
                  name="abstract"
                  value={formData.abstract}
                  onChange={handleChange}
                  rows={6}
                  className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background resize-none"
                  placeholder="Paste or enter the paper abstract..."
                  required
                />
              </div>

              {/* Row 7: Keywords */}
              <div>
                <label className="block text-foreground mb-2">Keywords <span className="text-red-600">*</span></label>
                <input
                  type="text"
                  name="keywords"
                  value={formData.keywords}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                  placeholder="machine learning, neural networks, classification"
                  required
                />
                <p className="text-muted-foreground mt-2">Separate keywords with commas</p>
              </div>

              {/* Application Domain (full width) */}
              <div>
                <label className="block text-foreground mb-2">Application Domain <span className="text-red-600">*</span></label>
                <select
                  name="applicationDomain"
                  value={formData.applicationDomain}
                  onChange={(e) => handleChange(e)}
                  className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                  required
                >
                  <option value="">Select domain</option>
                  {APPLICATION_DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                {formData.applicationDomain === 'Other' && (
                  <input
                    type="text"
                    name="applicationDomainOther"
                    value={formData.applicationDomainOther}
                    onChange={handleChange}
                    className="w-full mt-2 px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                    placeholder="Enter custom application domain"
                    required
                  />
                )}
              </div>

              

              <div>
                <label className="block text-foreground mb-2">
                  PDF File {isContribution && <span className="text-red-600">*</span>}
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="sr-only"
                />
                <div
                  onDrop={handleFileDrop}
                  onDragOver={handleFileDragOver}
                  onDragLeave={handleFileDragLeave}
                  className={`rounded-lg border border-dashed px-4 py-5 transition-colors ${
                    isDraggingFile
                      ? 'border-primary bg-blue-50'
                      : 'border-border bg-input-background hover:border-primary hover:bg-accent/40'
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-foreground">
                        {selectedFile ? selectedFile.name : 'Drag and drop a PDF here'}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selectedFile ? 'Drop another PDF to replace this file.' : 'Or choose a file from your computer.'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {selectedFile && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-white"
                        >
                          Remove
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleChooseFile}
                        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-blue-600"
                      >
                        Choose file
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-muted-foreground mt-2">
                  {isContribution ? 'Required for contributions.' : 'Optional. Upload a PDF now if you already have one.'} Only PDF files up to 50MB are accepted.
                </p>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting || isFormInvalid}
                  className="flex-1 bg-primary text-primary-foreground py-3 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Submitting...' : isAdmin ? 'Post Paper' : isContribution ? 'Submit Contribution' : 'Submit Request'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(dashboardPath)}
                  className="flex-1 bg-muted text-muted-foreground py-3 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function hasEnoughWords(value: string, minWords: number) {
  return value.trim().split(/\s+/).filter((word) => /[a-z0-9]/i.test(word)).length >= minWords;
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter((word) => /[a-z0-9]/i.test(word)).length;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validatePaperRequest(data: {
  title: string;
  doi: string;
  paperType: string;
  link: string;
  abstract: string;
  keywords: string;
  year: string;
  authors: string;
  relatedSemesters?: string[];
  applicationDomain?: string;
  applicationDomainOther?: string;
}) {
  const title = data.title.trim();
  const doi = data.doi.trim();
  const abstract = data.abstract.trim();
  const keywords = data.keywords
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  const year = Number(data.year);
  const maxYear = new Date().getFullYear() + 1;
  const titleWordCount = countWords(title);
  const abstractWordCount = countWords(abstract);
  const paperType = data.paperType.trim();
  const authors = data.authors
    .split(',')
    .map((author) => author.trim())
    .filter(Boolean);

  if (authors.length === 0) {
    return 'Please enter at least one author.';
  }

  if (authors.some((author) => author.length < 2)) {
    return 'Please enter valid author names.';
  }
  const relatedSemesters = data.relatedSemesters || [];
  const applicationDomain = data.applicationDomain?.trim() || '';
  const applicationDomainOther = data.applicationDomainOther?.trim() || '';

  if (title.length < 8 || !hasEnoughWords(title, 3)) {
    return 'Please enter a clearer paper title.';
  }

  if (titleWordCount > 200) {
    return 'Paper title must be 200 words or fewer.';
  }

  if (!/^10\.\d{4,9}\/\S+$/i.test(doi)) {
    return 'Please enter a valid DOI, for example 10.1234/example.2024.';
  }

  if (!paperType || !PAPER_TYPES.includes(paperType)) {
    return 'Please Choose paper type';
  }

  if (!isHttpUrl(data.link)) {
    return 'Please enter a valid paper link starting with http or https.';
  }

  if (authors.length > 0 && authors.some((author) => author.length < 2)) {
    return 'Please enter valid author names.';
  }

  // Validate related semesters (optional)
  if (relatedSemesters.length > 0) {
    const validSemValues = RELATED_SEMESTERS.map((s) => s.value);
    if (relatedSemesters.some((s) => !validSemValues.includes(s))) {
      return 'Invalid related semesters selected.';
    }
  }

  // Validate application domain (optional)
  if (applicationDomain === 'Other' && !applicationDomainOther) {
    return 'Please provide a custom application domain.';
  }

  const wordCount = countWords(abstract);
  if (wordCount < 50 || wordCount > 350) {
    return 'Word Count Limit: The abstract must contain between 50 and 350 words. Please revise your text to proceed.';
  }

  if (abstractWordCount > 1000) {
    return 'Abstract must be 1000 words or fewer.';
  }

  if (keywords.length === 0 || keywords.some((keyword) => keyword.length < 2)) {
    return 'Please enter at least one meaningful keyword.';
  }

  if (!Number.isInteger(year) || year < 1900 || year > maxYear) {
    return `Publication year must be between 1900 and ${maxYear}.`;
  }

  return '';
}
