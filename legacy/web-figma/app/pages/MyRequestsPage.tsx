import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Sidebar } from '../components/Sidebar';
import { AppHeader } from '../components/AppHeader';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Search, Plus, Eye, Calendar, BookOpen, Download, Trash2, XCircle } from 'lucide-react';
import { apiRequest, AuthUser, getToken, resolveFileUrl, saveAuth } from '../lib/api';
import { formatDisplayDate } from '../lib/date';

type PaperStatus = 'pending' | 'approved' | 'rejected' | 'downloaded' | 'not-downloaded' | 'pending-requester-acceptance';

interface PaperRequest {
  _id: string;
  title: string;
  doi: string;
  paperType: string;
  paperLink: string;
  authors?: string[];
  abstract: string;
  keywords: string[];
  publishedYear: number;
  status: PaperStatus;
  rejectionReason?: string;
  createdAt: string;
  pdfPath?: string;
}

const filters: Array<{
  value: 'all' | PaperStatus;
  label: string;
  iconBgClass: string;
  iconClass: string;
}> = [
  { value: 'all', label: 'Total Requests', iconBgClass: 'bg-blue-100', iconClass: 'text-blue-600' },
  { value: 'pending', label: 'Pending', iconBgClass: 'bg-amber-100', iconClass: 'text-amber-600' },
  { value: 'downloaded', label: 'PDF available', iconBgClass: 'bg-green-100', iconClass: 'text-green-600' },
  { value: 'pending-requester-acceptance', label: 'Waiting accept', iconBgClass: 'bg-purple-100', iconClass: 'text-purple-600' },
  { value: 'not-downloaded', label: 'No PDF yet', iconBgClass: 'bg-gray-100', iconClass: 'text-gray-600' },
  { value: 'rejected', label: 'Rejected', iconBgClass: 'bg-red-100', iconClass: 'text-red-600' },
];

export function MyRequestsPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | PaperStatus>('all');
  const [requests, setRequests] = useState<PaperRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [requestToCancel, setRequestToCancel] = useState<PaperRequest | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<PaperRequest | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadRequests() {
      setIsLoading(true);
      setError('');

      try {
        const data = await apiRequest<{ papers: PaperRequest[] }>('/papers/my-requests', { auth: true });
        if (isMounted) setRequests(data.papers);
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unable to load paper requests');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadRequests();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredRequests = requests.filter((request) => {
    const normalizedSearch = searchTerm.toLowerCase();
    const matchesSearch =
      request.title.toLowerCase().includes(normalizedSearch) ||
      request.doi.toLowerCase().includes(normalizedSearch) ||
      (request.paperType || '').toLowerCase().includes(normalizedSearch) ||
      request.keywords.some((keyword) => keyword.toLowerCase().includes(normalizedSearch)) ||
      request.authors?.some((author) => author.toLowerCase().includes(normalizedSearch));

    const matchesFilter = filterStatus === 'all' || request.status === filterStatus;

    return matchesSearch && matchesFilter;
  });

  const statusCounts = filters.reduce<Record<string, number>>((counts, filter) => {
    counts[filter.value] =
      filter.value === 'all'
        ? requests.length
        : requests.filter((request) => request.status === filter.value).length;
    return counts;
  }, {});

  const cancelRequest = async () => {
    if (!requestToCancel) return;

    setIsCanceling(true);
    setError('');
    setMessage('');

    try {
      await apiRequest(`/papers/${requestToCancel._id}/cancel`, {
        method: 'DELETE',
        auth: true,
      });
      const token = getToken();
      if (token) {
        const { user } = await apiRequest<{ user: AuthUser }>('/auth/me', { auth: true });
        saveAuth(token, user);
      }
      setRequests((items) => items.filter((item) => item._id !== requestToCancel._id));
      setMessage('Paper request cancelled successfully. Your request credit has been refunded.');
      setRequestToCancel(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to cancel paper request');
    } finally {
      setIsCanceling(false);
    }
  };

  const deleteRequest = async () => {
    if (!requestToDelete) return;

    setIsDeleting(true);
    setError('');
    setMessage('');

    try {
      await apiRequest(`/papers/${requestToDelete._id}`, {
        method: 'DELETE',
        auth: true,
      });
      setRequests((items) => items.filter((item) => item._id !== requestToDelete._id));
      setMessage('Paper request deleted successfully.');
      setRequestToDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete paper request');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-surface-workspace bg-fixed">
      <Sidebar role="user" />

      <div className="min-w-0 flex-1">
        <AppHeader role="user" />
        <div className="p-8">
          <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-foreground mb-2">My Requests</h1>
              <p className="text-muted-foreground">View and manage all your research paper requests</p>
            </div>
            <button
              onClick={() => navigate('/request-paper')}
              className="bg-primary text-primary-foreground px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
            >
              <Plus size={20} />
              New Request
            </button>
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

          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
            {filters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setFilterStatus(filter.value)}
                className={`bg-white rounded-lg p-4 border text-left ${
                  filterStatus === filter.value ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                } cursor-pointer hover:shadow-md transition-all`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-muted-foreground mb-1">{filter.label}</p>
                    <h3 className="text-foreground">{statusCounts[filter.value] || 0}</h3>
                  </div>
                  <div className={`${filter.iconBgClass} p-3 rounded-lg`}>
                    <BookOpen size={20} className={filter.iconClass} />
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="bg-white rounded-lg border border-border shadow-sm p-6 mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by title, DOI, or keywords..."
                maxLength={128}
                className="w-full pl-10 pr-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="bg-white rounded-lg border border-border shadow-sm p-12 text-center">
              <p className="text-muted-foreground">Loading requests...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRequests.map((request) => (
                <div
                  key={request._id}
                  className="bg-white rounded-lg border border-border shadow-sm p-6 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-foreground mb-2">{request.title}</h3>
                      <div className="flex items-center gap-4 text-muted-foreground mb-3">
                        <span className="flex items-center gap-2">
                          <Calendar size={16} />
                          {formatDisplayDate(request.createdAt)}
                        </span>
                        <span>Year: {request.publishedYear}</span>
                      </div>
                      <p className="text-muted-foreground mb-2">
                        Authors: {request.authors?.length ? request.authors.join(', ') : 'N/A'}
                      </p>
                      <p className="text-muted-foreground mb-2">Type: {request.paperType || 'N/A'}</p>
                      <p className="text-muted-foreground mb-3 line-clamp-2">{request.abstract}</p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {request.keywords.slice(0, 3).map((keyword) => (
                          <span
                            key={keyword}
                            className="px-2 py-1 bg-accent text-accent-foreground rounded border border-border"
                          >
                            {keyword}
                          </span>
                        ))}
                        {request.keywords.length > 3 && (
                          <span className="px-2 py-1 text-muted-foreground">
                            +{request.keywords.length - 3} more
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground">DOI: {request.doi}</p>
                      {request.status === 'rejected' && (
                        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
                          <p className="font-medium">Rejection reason</p>
                          <p className="mt-1 text-sm">{request.rejectionReason || 'No reason was provided.'}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-3 ml-4">
                      <StatusBadge status={request.status} />
                      <button
                        onClick={() => navigate(`/paper/${request._id}`)}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
                      >
                        <Eye size={18} />
                        View Details
                      </button>
                      {request.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => setRequestToCancel(request)}
                          className="px-4 py-2 border border-red-200 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-2 whitespace-nowrap"
                        >
                          <XCircle size={18} />
                          Cancel Request
                        </button>
                      )}
                      {request.status !== 'pending' && (
                        <button
                          type="button"
                          onClick={() => setRequestToDelete(request)}
                          className="px-4 py-2 border border-red-200 bg-white text-red-700 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-2 whitespace-nowrap"
                        >
                          <Trash2 size={18} />
                          Delete
                        </button>
                      )}
                      {request.pdfPath && request.status === 'downloaded' ? (
                        <button
                          onClick={async () => {
                            try {
                              const data = await apiRequest<{ downloadUrl: string }>(`/public-papers/${request._id}/download`, {
                                method: 'POST',
                                auth: true,
                              });

                              const fileUrl = resolveFileUrl(data.downloadUrl);
                              const resp = await fetch(fileUrl);
                              const blob = await resp.blob();
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `${request.doi || request.title}.pdf`;
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                              window.URL.revokeObjectURL(url);
                            } catch (err) {
                              console.error(err);
                              setError(err instanceof Error ? err.message : 'Unable to download PDF');
                            }
                          }}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                        >
                          <Download size={18} />
                          Download
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && filteredRequests.length === 0 && (
            <div className="bg-white rounded-lg border border-border shadow-sm p-12 text-center">
              <BookOpen size={48} className="mx-auto text-muted-foreground mb-4" />
              <h3 className="text-foreground mb-2">No requests found</h3>
              <p className="text-muted-foreground mb-6">
                {searchTerm || filterStatus !== 'all'
                  ? 'Try adjusting your search or filter criteria.'
                  : "You haven't submitted any paper requests yet."}
              </p>
              {!searchTerm && filterStatus === 'all' && (
                <button
                  onClick={() => navigate('/request-paper')}
                  className="bg-primary text-primary-foreground px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors inline-flex items-center gap-2"
                >
                  <Plus size={20} />
                  Submit Your First Request
                </button>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={Boolean(requestToCancel)}
        title="Cancel paper request?"
        description={`This will remove "${requestToCancel?.title || 'this request'}" from your requests and refund the request credit.`}
        confirmLabel="Cancel Request"
        isLoading={isCanceling}
        onConfirm={cancelRequest}
        onCancel={() => setRequestToCancel(null)}
      />
      <ConfirmDialog
        isOpen={Boolean(requestToDelete)}
        title="Delete paper request?"
        description={`This will permanently delete "${requestToDelete?.title || 'this request'}" from your requests.`}
        confirmLabel="Delete"
        isLoading={isDeleting}
        onConfirm={deleteRequest}
        onCancel={() => setRequestToDelete(null)}
      />
    </div>
  );
}
