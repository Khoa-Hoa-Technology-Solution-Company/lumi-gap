import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Sidebar } from '../components/Sidebar';
import { AppHeader } from '../components/AppHeader';
import { StatusBadge } from '../components/StatusBadge';
import { UploadPdfModal } from '../components/UploadPdfModal';
import { EditablePaper, EditPaperModal } from '../components/EditPaperModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Search, Upload, Download, Eye, Filter, Check, X, Edit, Trash2 } from 'lucide-react';
import { apiRequest, resolveFileUrl, getStoredUser } from '../lib/api';
import { formatDisplayDate } from '../lib/date';
import { useToast } from '../components/ToastProvider';
import { getPaperType } from '../lib/papers';

type PaperStatus = 'pending' | 'downloaded' | 'not-downloaded' | 'approved' | 'rejected' | 'pending-requester-acceptance';

interface AdminPaper extends EditablePaper {
  requestedBy?: {
    _id?: string;
    fullName?: string;
    email?: string;
    university?: string;
    status?: string;
  };
  pdfPath?: string;
  uploadedBy?: {
    fullName?: string;
    university?: string;
  };
  createdAt: string;
}

function toCsvValue(value: string | number | undefined) {
  const text = String(value || '');
  return `"${text.replace(/"/g, '""')}"`;
}

export function PaperManagementPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>('all');
  const [papers, setPapers] = useState<AdminPaper[]>([]);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState<AdminPaper | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [paperToDelete, setPaperToDelete] = useState<AdminPaper | null>(null);
  const [isDeletingPaper, setIsDeletingPaper] = useState(false);
  const [paperToReject, setPaperToReject] = useState<AdminPaper | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejectingPaper, setIsRejectingPaper] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showUserModal, setShowUserModal] = useState(false);
  const [selectedUserProfile, setSelectedUserProfile] = useState<{
    _id?: string;
    fullName?: string;
    email?: string;
    university?: string;
    role?: string;
    status?: string;
    createdAt?: string;
  } | null>(null);
  const [selectedUserRanking, setSelectedUserRanking] = useState<{
    rank: number;
    points: number;
    uploadedPapers?: number;
    uploadedPdfs?: number;
    ratingsGiven?: number;
  } | null>(null);
  const [isLoadingUserDetails, setIsLoadingUserDetails] = useState(false);
  const [showConfirmToggle, setShowConfirmToggle] = useState(false);
  const [pendingToggleUserId, setPendingToggleUserId] = useState<string | null>(null);
  const [isTogglingUser, setIsTogglingUser] = useState(false);
  const { showToast } = useToast();

  function getRejectedCount(userId?: string) {
    if (!userId) return 0;
    return papers.filter((p) => {
    const requesterId = p.requestedBy?._id;
    return String(requesterId) === String(userId) && p.status === 'rejected';
  }).length;
  }

  const toggleUserStatus = async (userId?: string) => {
    if (!userId || !selectedUserProfile) return;
    const nextStatus = selectedUserProfile.status === 'banned' ? 'active' : 'banned';
    setIsTogglingUser(true);
    try {
      await apiRequest(`/users/${userId}/status`, {
        method: 'PATCH',
        auth: true,
        body: JSON.stringify({ status: nextStatus }),
      });

      // Update selected profile
      setSelectedUserProfile({ ...selectedUserProfile, status: nextStatus });

      // Sync status to all loaded papers where this user is the requester
      setPapers((prev) =>
        prev.map((paper) => {
          const requesterId = paper.requestedBy?._id;
          if (String(requesterId) === String(userId) && paper.requestedBy) {
            return { ...paper, requestedBy: { ...paper.requestedBy, status: nextStatus } };
          }
          return paper;
        })
      );

      showToast(`User ${nextStatus === 'banned' ? 'banned' : 'unbanned'} successfully.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to update user status', 'error');
    } finally {
      setIsTogglingUser(false);
      setShowConfirmToggle(false);
      setPendingToggleUserId(null);
    }
  };

  const requestToggleUserStatus = (userId?: string) => {
    if (!userId) return;
    setPendingToggleUserId(userId);
    setShowConfirmToggle(true);
  };

  async function loadPapers() {
    setIsLoading(true);
    setError('');

    try {
      const data = await apiRequest<{ papers: AdminPaper[] }>('/papers', { auth: true });
      setPapers(data.papers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load papers');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPapers();
  }, []);

  const filteredPapers = papers.filter((paper) => {
    const normalizedSearch = searchTerm.toLowerCase();
    const requesterName = paper.requestedBy?.fullName || '';
    const authorsText = paper.authors?.join(', ') || '';
    const matchesSearch =
      paper.title.toLowerCase().includes(normalizedSearch) ||
      paper.doi.toLowerCase().includes(normalizedSearch) ||
      (paper.paperType || '').toLowerCase().includes(normalizedSearch) ||
      requesterName.toLowerCase().includes(normalizedSearch) ||
      authorsText.toLowerCase().includes(normalizedSearch);

    const matchesStatus = filterStatus === 'all' || paper.status === filterStatus;
    const matchesYear = filterYear === 'all' || paper.createdAt.startsWith(filterYear);

    return matchesSearch && matchesStatus && matchesYear;
  });

  const years = Array.from(new Set(papers.map((paper) => paper.createdAt.substring(0, 4)))).sort((a, b) =>
    b.localeCompare(a)
  );

  const updatePaperStatus = async (paperId: string, status: PaperStatus, reason?: string) => {
    setError('');
    setMessage('');

    try {
      const data = await apiRequest<{ paper: AdminPaper }>(`/papers/${paperId}/status`, {
        method: 'PATCH',
        auth: true,
        body: JSON.stringify({ status, rejectionReason: reason }),
      });

      setPapers(papers.map((paper) => (paper._id === paperId ? data.paper : paper)));
      setMessage('Paper status updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update status');
    }
  };

  const handleReject = async () => {
    const reason = rejectionReason.trim();
    if (!paperToReject) return;

    if (reason.length < 5) {
      setError('Please enter a rejection reason with at least 5 characters.');
      return;
    }

    setIsRejectingPaper(true);
    try {
      await updatePaperStatus(paperToReject._id, 'rejected', reason);
      setPaperToReject(null);
      setRejectionReason('');
    } finally {
      setIsRejectingPaper(false);
    }
  };

  const handleOpenUploadModal = (paper: AdminPaper) => {
    setSelectedPaper(paper);
    setUploadModalOpen(true);
  };

  const handleOpenEditModal = (paper: AdminPaper) => {
    setSelectedPaper(paper);
    setEditModalOpen(true);
  };

  const handleViewUser = async (userId?: string) => {
    if (!userId) return;
    setIsLoadingUserDetails(true);
    setError('');
    setSelectedUserRanking(null);

    try {
      const [userData, rankingData] = await Promise.all([
        apiRequest<{ user: any }>(`/users/${userId}`, { auth: true }),
        apiRequest<{ ranking: { rank: number; points: number; uploadedPapers?: number; uploadedPdfs?: number; ratingsGiven?: number } }>(
          `/rankings/users/${userId}`,
          { auth: true }
        ).catch(() => ({ ranking: null })),
      ]);

      const data = userData;
      setSelectedUserProfile(data.user);
      setSelectedUserRanking(rankingData.ranking);
      setShowUserModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load user profile');
    } finally {
      setIsLoadingUserDetails(false);
    }
  };

  const handleOpenPdf = async (paper: AdminPaper) => {
    setError('');

    try {
      const data = await apiRequest<{ downloadUrl: string }>(`/papers/${paper._id}/pdf-url`, {
        auth: true,
      });

      window.open(resolveFileUrl(data.downloadUrl), '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open PDF');
    }
  };

  const handleUploadPdf = async (file: File) => {
    if (!selectedPaper) return;

    setError('');
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const data = await apiRequest<{ paper: AdminPaper }>(`/papers/${selectedPaper._id}/upload-pdf`, {
        method: 'POST',
        auth: true,
        body: formData,
      });

      setPapers(papers.map((paper) => (paper._id === selectedPaper._id ? data.paper : paper)));
      setMessage('PDF uploaded successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload PDF');
    }
  };

  const handleDeletePdf = async (paper: AdminPaper) => {
    setError('');
    setMessage('');

    try {
      const data = await apiRequest<{ paper: AdminPaper }>(`/papers/${paper._id}/pdf`, {
        method: 'DELETE',
        auth: true,
      });

      setPapers(papers.map((item) => (item._id === paper._id ? data.paper : item)));
      setMessage('PDF deleted successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete PDF');
    }
  };

  const handleSaveEdit = async (editedPaper: EditablePaper) => {
    setError('');
    setMessage('');

    try {
      const data = await apiRequest<{ paper: AdminPaper }>(`/papers/${editedPaper._id}`, {
        method: 'PATCH',
        auth: true,
        body: JSON.stringify({
          title: editedPaper.title,
          doi: editedPaper.doi,
          paperType: editedPaper.paperType,
          paperLink: editedPaper.paperLink,
          authors: editedPaper.authors,
          abstract: editedPaper.abstract,
          keywords: editedPaper.keywords,
            publishedYear: editedPaper.publishedYear,
            relatedSemesters: editedPaper.relatedSemesters,
            applicationDomain: editedPaper.applicationDomain,
          status: editedPaper.status,
          rejectionReason: editedPaper.rejectionReason,
        }),
      });

      setPapers(papers.map((paper) => (paper._id === editedPaper._id ? data.paper : paper)));
      setMessage('Paper information updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update paper');
    }
  };

  const handleDelete = async () => {
    if (!paperToDelete) return;

    setError('');
    setMessage('');
    setIsDeletingPaper(true);

    showToast('Deleting paper...', 'info');

    try {
      await apiRequest(`/papers/${paperToDelete._id}`, {
        method: 'DELETE',
        auth: true,
      });

      setPapers(papers.filter((item) => item._id !== paperToDelete._id));
      setPaperToDelete(null);
      setMessage('Paper deleted successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete paper');
      showToast(err instanceof Error ? err.message : 'Unable to delete paper', 'error');
    } finally {
      setIsDeletingPaper(false);
    }
  };

  const exportPapers = (items: AdminPaper[], filename: string) => {
    const csvContent = [
      ['Title', 'DOI', 'Paper Type', 'Authors', 'Application Domain', 'Related Semesters', 'Requested By', 'University', 'Date', 'Status'],
      ...items.map((paper) => [
        paper.title,
        paper.doi,
        paper.paperType,
        paper.authors?.join(', '),
        paper.applicationDomain || '',
        (paper.relatedSemesters || []).join(', '),
        paper.requestedBy?.fullName,
        paper.requestedBy?.university,
        formatDisplayDate(paper.createdAt),
        paper.status,
      ]),
    ]
      .map((row) => row.map(toCsvValue).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportAll = () => {
    exportPapers(papers, `all_papers_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const handleExportNotDownloaded = () => {
    const notDownloaded = papers.filter((paper) => paper.status !== 'downloaded');
    exportPapers(notDownloaded, `no_pdf_yet_papers_${new Date().toISOString().split('T')[0]}.csv`);
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-surface-workspace bg-fixed">
      <Sidebar role="admin" />

      <div className="min-w-0 flex-1 p-8">
        <AppHeader role="admin" />
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-foreground mb-2">Paper Management</h1>
              <p className="text-muted-foreground">Manage and track all research paper requests</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleExportNotDownloaded}
                className="bg-amber-600 text-white px-6 py-3 rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2"
              >
                <Download size={20} />
                Export No PDF Yet
              </button>
              <button
                onClick={handleExportAll}
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <Download size={20} />
                Export All
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">
              {error}
            </div>
          )}

          {message && (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4 mb-6">
              {message}
            </div>
          )}

          <div className="bg-white rounded-lg border border-border shadow-sm p-6 mb-6">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by title, DOI, or requester..."
                  maxLength={128}
                  className="w-full pl-10 pr-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                />
              </div>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="pl-10 pr-8 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background appearance-none"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending Review</option>
                  <option value="rejected">Rejected</option>
                  <option value="downloaded">PDF available</option>
                  <option value="not-downloaded">No PDF yet</option>
                  <option value="pending-requester-acceptance">Waiting requester accept</option>
                </select>
              </div>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="pl-10 pr-8 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background appearance-none"
                >
                  <option value="all">All Years</option>
                  {years.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="px-6 py-4 text-left text-foreground">Paper Title</th>
                    <th className="px-6 py-4 text-left text-foreground">Requested By</th>
                    <th className="px-6 py-4 text-left text-foreground">University</th>
                    <th className="px-6 py-4 text-left text-foreground">Date</th>
                    <th className="px-6 py-4 text-left text-foreground">Status</th>
                    <th className="px-6 py-4 text-left text-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPapers.map((paper) => (
                    <tr key={paper._id} className="border-b border-border hover:bg-accent transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-foreground">{paper.title}</p>
                          <p className="text-muted-foreground">DOI: {paper.doi}</p>
                          <p className="text-muted-foreground">Type: {getPaperType(paper)}</p>
                          <p className="text-muted-foreground">Authors: {paper.authors?.join(', ') || 'N/A'}</p>
                          <p className="text-muted-foreground">Domain: {paper.applicationDomain || 'N/A'}</p>
                          <p className="text-muted-foreground">Semesters: {(paper.relatedSemesters || []).map((s) => s).join(', ') || 'N/A'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                              <p className="text-foreground">
                                <button
                                  type="button"
                                  onClick={() => handleViewUser(paper.requestedBy?._id)}
                                  className="text-left text-foreground hover:underline"
                                >
                                  {paper.requestedBy?.fullName || 'Unknown'}
                                </button>
                              </p>
                              {/* Student ID removed */}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{paper.requestedBy?.university || 'N/A'}</td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDisplayDate(paper.createdAt)}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={paper.status} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => navigate(`/paper/${paper._id}`)}
                            className="p-2 hover:bg-muted rounded-lg transition-colors"
                            title="View details"
                          >
                            <Eye size={18} className="text-primary" />
                          </button>

                          <button
                            onClick={() => handleOpenEditModal(paper)}
                            className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
                            title="Edit paper"
                          >
                            <Edit size={18} className="text-blue-600" />
                          </button>

                          {paper.status === 'pending' && (
                            <>
                              <button
                                onClick={() => updatePaperStatus(paper._id, 'approved')}
                                className="p-2 hover:bg-green-100 rounded-lg transition-colors"
                                title="Approve request"
                              >
                                <Check size={18} className="text-green-600" />
                              </button>
                              <button
                                onClick={() => {
                                  setPaperToReject(paper);
                                  setRejectionReason(paper.rejectionReason || '');
                                }}
                                className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                                title="Reject request"
                              >
                                <X size={18} className="text-red-600" />
                              </button>
                            </>
                          )}

                          {/* Delete PDF button removed from row actions per UX request */}

                          {!paper.pdfPath && (
                            <button
                              type="button"
                              onClick={() => handleOpenUploadModal(paper)}
                              className="p-2 hover:bg-green-100 rounded-lg transition-colors"
                              title="Upload PDF"
                            >
                              <Upload size={18} className="text-green-600" />
                            </button>
                          )}

                          {paper.pdfPath && (
                            <button
                              type="button"
                              onClick={() => handleOpenPdf(paper)}
                              className="p-2 hover:bg-muted rounded-lg transition-colors"
                              title="Download PDF"
                            >
                              <Download size={18} className="text-blue-600" />
                            </button>
                          )}

                          <button
                            onClick={() => setPaperToDelete(paper)}
                            className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                            title="Delete paper"
                          >
                            <Trash2 size={18} className="text-red-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {isLoading && (
              <div className="p-12 text-center">
                <p className="text-muted-foreground">Loading papers...</p>
              </div>
            )}

            {!isLoading && filteredPapers.length === 0 && (
              <div className="p-12 text-center">
                <p className="text-muted-foreground">No papers found matching your criteria.</p>
              </div>
            )}
          </div>
        </div>

        <UploadPdfModal
          isOpen={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          onUpload={handleUploadPdf}
          paperTitle={selectedPaper?.title || ''}
        />

        <EditPaperModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          onSave={handleSaveEdit}
          paper={selectedPaper}
        />

        <ConfirmDialog
          isOpen={Boolean(paperToDelete)}
          title="Delete paper?"
          description={`This will permanently delete "${paperToDelete?.title || 'this paper'}".`}
          confirmLabel="Delete paper"
          isLoading={isDeletingPaper}
          onConfirm={handleDelete}
          onCancel={() => setPaperToDelete(null)}
        />
        {paperToReject && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-lg border border-border bg-white shadow-xl">
              <div className="border-b border-border p-5">
                <h3 className="text-foreground">Reject paper request?</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add a reason so the requester knows what needs to be fixed.
                </p>
              </div>
              <div className="p-5">
                <p className="mb-3 font-medium text-foreground">{paperToReject.title}</p>
                <textarea
                  value={rejectionReason}
                  onChange={(event) => setRejectionReason(event.target.value)}
                  rows={5}
                  maxLength={500}
                  className="w-full resize-none rounded-lg border border-border bg-input-background px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter rejection reason"
                />
                <p className="mt-2 text-sm text-muted-foreground">{rejectionReason.trim().length}/500 characters</p>
              </div>
              <div className="flex gap-3 border-t border-border p-5">
                <button
                  type="button"
                  disabled={isRejectingPaper}
                  onClick={() => {
                    setPaperToReject(null);
                    setRejectionReason('');
                  }}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isRejectingPaper || rejectionReason.trim().length < 5}
                  onClick={handleReject}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRejectingPaper ? 'Rejecting...' : 'Reject paper'}
                </button>
              </div>
            </div>
          </div>
        )}
        <ConfirmDialog
          isOpen={showConfirmToggle}
          title={selectedUserProfile?.status === 'banned' ? 'Unban user?' : 'Ban user?'}
          description={`Are you sure you want to ${selectedUserProfile?.status === 'banned' ? 'unban' : 'ban'} ${
            selectedUserProfile?.fullName || 'this user'
          }?`}
          confirmLabel={selectedUserProfile?.status === 'banned' ? 'Unban user' : 'Ban user'}
          isLoading={isTogglingUser}
          onConfirm={() => toggleUserStatus(pendingToggleUserId || undefined)}
          onCancel={() => {
            setShowConfirmToggle(false);
            setPendingToggleUserId(null);
          }}
        />
        {showUserModal && selectedUserProfile && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
              <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-border p-6">
                <div>
                  <p className="text-sm text-muted-foreground">User profile</p>
                  <h2 className="text-foreground">{selectedUserProfile.fullName || 'User Details'}</h2>
                </div>
                <button
                  onClick={() => setShowUserModal(false)}
                  className="p-2 hover:bg-accent rounded-lg transition-colors"
                  aria-label="Close user details"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="max-h-[calc(90vh-156px)] overflow-y-auto overscroll-contain p-6">
                {isLoadingUserDetails ? (
                  <div className="mb-4 rounded-lg border border-border bg-white p-4 text-muted-foreground">Loading latest profile...</div>
                ) : (
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div>
                      <p className="text-muted-foreground mb-1">Full Name</p>
                      <p className="text-foreground">{selectedUserProfile.fullName}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Email</p>
                      <p className="text-foreground">{selectedUserProfile.email}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">University</p>
                      <p className="text-foreground">{selectedUserProfile.university}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Join Date</p>
                      <p className="text-foreground">{formatDisplayDate(selectedUserProfile.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Role</p>
                      <p className="text-foreground">{selectedUserProfile.role || 'user'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Status</p>
                      <p className="text-foreground">{selectedUserProfile.status || 'active'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Ranking</p>
                      <p className="text-foreground">
                        {selectedUserRanking ? `Rank #${selectedUserRanking.rank}` : 'Rank N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Ranking Points</p>
                      <p className="text-foreground">{selectedUserRanking?.points ?? 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Rejected Requests</p>
                      <p className="text-foreground">{getRejectedCount(selectedUserProfile._id)}</p>
                    </div>
                  </div>
                )}
              </div>

                  <div className="flex gap-4 p-6 border-t border-border">
                <div className="flex-1">
                  <button
                    onClick={() => requestToggleUserStatus(selectedUserProfile._id)}
                    disabled={selectedUserProfile._id === getStoredUser()?._id}
                    className={`w-full px-6 py-3 rounded-lg text-white transition-colors ${
                      selectedUserProfile.status === 'banned' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    {selectedUserProfile.status === 'banned' ? 'Unban User' : 'Ban User'}
                  </button>
                </div>
                <div className="flex-1">
                  <button
                    onClick={() => setShowUserModal(false)}
                    className="w-full px-6 py-3 border border-border rounded-lg hover:bg-accent transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
