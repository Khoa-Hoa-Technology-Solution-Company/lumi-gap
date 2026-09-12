import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { PAPER_TYPES, RELATED_SEMESTERS, APPLICATION_DOMAINS } from '../lib/papers';

export type EditablePaper = {
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
  status: 'pending' | 'downloaded' | 'not-downloaded' | 'approved' | 'rejected' | 'pending-requester-acceptance';
  rejectionReason?: string;
};

interface EditPaperModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (paper: EditablePaper) => void;
  paper: EditablePaper | null;
}

export function EditPaperModal({ isOpen, onClose, onSave, paper }: EditPaperModalProps) {
  const [editedPaper, setEditedPaper] = useState<EditablePaper | null>(paper);
  const [authorsText, setAuthorsText] = useState('');
  const [keywordsText, setKeywordsText] = useState('');
  const [otherDomain, setOtherDomain] = useState('');
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    setEditedPaper(paper);
    setAuthorsText(paper?.authors?.join(', ') || '');
    setKeywordsText(paper?.keywords.join(', ') || '');
    setOtherDomain(paper?.applicationDomain && !APPLICATION_DOMAINS.includes(paper.applicationDomain) ? paper.applicationDomain : '');
  }, [paper]);

  if (!isOpen || !paper || !editedPaper) return null;

  const handleSave = () => {
    const authors = authorsText.split(',').map((author) => author.trim()).filter(Boolean);
    if (authors.length === 0) {
      setModalError('Please enter at least one author.');
      return;
    }

    if (authors.some((a) => a.length < 2)) {
      setModalError('Please enter valid author names.');
      return;
    }

    if (editedPaper.status === 'rejected' && !editedPaper.rejectionReason?.trim()) {
      setModalError('Please enter a rejection reason.');
      return;
    }

    onSave({
      ...editedPaper,
      rejectionReason: editedPaper.rejectionReason?.trim(),
      authors,
      keywords: keywordsText.split(',').map((keyword) => keyword.trim()).filter(Boolean),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-white p-6">
          <div>
            <h2 className="text-foreground">Edit Paper Information</h2>
            <p className="text-muted-foreground mt-1">Update paper details and request status</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            title="Close editor"
            aria-label="Close editor"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-foreground mb-2">Paper Title *</label>
            <input
              type="text"
              value={editedPaper.title}
              onChange={(e) => setEditedPaper({ ...editedPaper, title: e.target.value })}
              className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
            />
          </div>

          <div>
            <label className="block text-foreground mb-2">DOI *</label>
            <input
              type="text"
              value={editedPaper.doi}
              onChange={(e) => setEditedPaper({ ...editedPaper, doi: e.target.value })}
              className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
              placeholder="10.1234/example.2024"
            />
          </div>

          <div>
            <label className="block text-foreground mb-2">Paper Type *</label>
            <select
              value={editedPaper.paperType}
              onChange={(e) => setEditedPaper({ ...editedPaper, paperType: e.target.value })}
              className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
            >
              <option value="">Please Choose paper type</option>
              {PAPER_TYPES.map((paperType) => (
                <option key={paperType} value={paperType}>
                  {paperType}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-foreground mb-2">Paper Link *</label>
            <input
              type="url"
              value={editedPaper.paperLink}
              onChange={(e) => setEditedPaper({ ...editedPaper, paperLink: e.target.value })}
              className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
              placeholder="https://example.com/paper"
            />
          </div>

          <div>
            <label className="block text-foreground mb-2">Authors <span className="text-red-600">*</span></label>
            <input
              type="text"
              value={authorsText}
              onChange={(e) => setAuthorsText(e.target.value)}
              className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
              placeholder="Nguyen Van A, Tran Thi B"
            />
            <p className="text-muted-foreground mt-2">Separate author names with commas.</p>
          </div>

          {modalError && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-700">{modalError}</p>
            </div>
          )}

          <div>
            <fieldset className="p-3 border border-border rounded-md">
              <legend className="text-foreground font-medium mb-2">Related Semesters</legend>
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
                            checked={(editedPaper.relatedSemesters || []).includes(s.value)}
                            onChange={(e) => {
                              const current = new Set(editedPaper.relatedSemesters || []);
                              if (e.target.checked) current.add(s.value); else current.delete(s.value);
                              setEditedPaper({ ...editedPaper, relatedSemesters: Array.from(current) });
                            }}
                            aria-label={s.label}
                          />
                          <span className="select-none">{s.label}</span>
                        </label>
                      ))}
                    </div>
                  ));
                })()}
              </div>
              <p className="text-muted-foreground mt-2 text-sm">Choose one or more semesters related to this paper.</p>
            </fieldset>
          </div>

          <div>
            <label className="block text-foreground mb-2">Application Domain</label>
            <select
              value={editedPaper.applicationDomain || ''}
              onChange={(e) => setEditedPaper({ ...editedPaper, applicationDomain: e.target.value })}
              className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
            >
              <option value="">Select domain (optional)</option>
              {APPLICATION_DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            {editedPaper.applicationDomain === 'Other' && (
              <input
                type="text"
                value={otherDomain}
                onChange={(e) => {
                  setOtherDomain(e.target.value);
                  setEditedPaper({ ...editedPaper, applicationDomain: e.target.value });
                }}
                className="w-full mt-2 px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                placeholder="Enter custom application domain"
              />
            )}
          </div>

          <div>
            <div>
              <label className="block text-foreground mb-2">Publication Year *</label>
              <input
                type="number"
                value={editedPaper.publishedYear}
                min={1900}
                max={new Date().getFullYear() + 1}
                onChange={(e) => setEditedPaper({ ...editedPaper, publishedYear: Number(e.target.value) })}
                className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
              />
            </div>

            <div>
              <label className="block text-foreground mb-2">Status</label>
              <select
                value={editedPaper.status}
                onChange={(e) => setEditedPaper({ ...editedPaper, status: e.target.value as EditablePaper['status'] })}
                className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
              >
                <option value="pending">Pending Review</option>
                <option value="rejected">Rejected</option>
                <option value="downloaded">PDF available</option>
                <option value="not-downloaded">No PDF yet</option>
                <option value="pending-requester-acceptance">Waiting requester accept</option>
              </select>
            </div>
          </div>

          {editedPaper.status === 'rejected' && (
            <div>
              <label className="block text-foreground mb-2">Rejection Reason *</label>
              <textarea
                value={editedPaper.rejectionReason || ''}
                onChange={(e) => setEditedPaper({ ...editedPaper, rejectionReason: e.target.value })}
                rows={3}
                maxLength={500}
                className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background resize-none"
                placeholder="Explain why this paper request was rejected"
              />
              <p className="text-muted-foreground mt-2 text-sm">This reason will be shown to the requester.</p>
            </div>
          )}

          <div>
            <label className="block text-foreground mb-2">Abstract *</label>
            <textarea
              value={editedPaper.abstract}
              onChange={(e) => setEditedPaper({ ...editedPaper, abstract: e.target.value })}
              rows={4}
              className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background resize-none"
            />
          </div>

          <div>
            <label className="block text-foreground mb-2">Keywords</label>
            <input
              type="text"
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
              placeholder="machine learning, neural networks, classification"
            />
            <p className="text-muted-foreground mt-2">Separate keywords with commas</p>
          </div>
        </div>

        <div className="flex gap-4 p-6 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 border border-border rounded-lg hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-blue-600 transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
