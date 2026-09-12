import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Sidebar } from '../components/Sidebar';
import { AppHeader } from '../components/AppHeader';
import { StatsCard } from '../components/StatsCard';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingSkeleton } from '../components/LoadingSpinner';
import { SuccessToast } from '../components/SuccessToast';
import { FileText, Download, Clock, Users } from 'lucide-react';
import { apiRequest, AuthUser } from '../lib/api';
import { formatDisplayDate } from '../lib/date';
import { PublicPaper } from '../lib/papers';

type DashboardPaper = PublicPaper & {
  requestedBy?: Pick<AuthUser, 'fullName' | 'email'>;
};

export function AdminDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [papers, setPapers] = useState<DashboardPaper[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!message) return;

    const timeoutId = window.setTimeout(() => {
      setMessage('');
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  useEffect(() => {
    if (location.state?.loginSuccess) {
      setMessage('Logged in successfully.');
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!message) return;

    const timeoutId = window.setTimeout(() => {
      setMessage('');
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      setIsLoading(true);
      setError('');

      try {
        const [paperData, userData] = await Promise.all([
          apiRequest<{ papers: DashboardPaper[] }>('/papers', { auth: true }),
          apiRequest<{ users: AuthUser[] }>('/users', { auth: true }),
        ]);

        if (isMounted) {
          setPapers(paperData.papers);
          setUsers(userData.users);
        }
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err.message : 'Unable to load dashboard');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const totalRequests = papers.length;
  const downloadedPapers = papers.filter((paper) => paper.status === 'downloaded').length;
  const pendingPapers = papers.filter((paper) => paper.status === 'pending').length;
  const notDownloadedPapers = papers.filter((paper) => paper.status === 'not-downloaded' || paper.status === 'approved').length;
  const waitingRequesterAcceptance = papers.filter((paper) => paper.status === 'pending-requester-acceptance').length;
  const recentPendingRequests = papers
    .filter((paper) => paper.status === 'pending')
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 5);

  const getPercent = (count: number) => {
    if (totalRequests === 0) return 0;
    return Math.round((count / totalRequests) * 100);
  };

  const distribution = [
    { label: 'PDF available', count: downloadedPapers, color: 'bg-green-500' },
    { label: 'Pending', count: pendingPapers, color: 'bg-amber-500' },
    { label: 'No PDF yet', count: notDownloadedPapers, color: 'bg-gray-500' },
    { label: 'Waiting requester accept', count: waitingRequesterAcceptance, color: 'bg-purple-500' },
  ];

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-surface-workspace bg-fixed">
      <Sidebar role="admin" />

      <div className="min-w-0 flex-1 p-5">
        <AppHeader role="admin" />
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-foreground mb-2">Statistics</h1>
            <p className="text-muted-foreground">Overview of research paper requests and system statistics</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">
              {error}
            </div>
          )}

          {message && (
            <SuccessToast message={message} onDismiss={() => setMessage('')} />
          )}

          {isLoading ? (
            <div className="space-y-4">
              <LoadingSkeleton variant="stats" />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <LoadingSkeleton rows={5} />
                <LoadingSkeleton rows={3} />
              </div>
            </div>
          ) : (
            <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatsCard
              title="Total Requests"
              value={totalRequests}
              icon={FileText}
              color="bg-blue-500"
            />
            <StatsCard
              title="PDF available"
              value={downloadedPapers}
              icon={Download}
              color="bg-green-500"
            />
            <StatsCard
              title="Pending Papers"
              value={pendingPapers}
              icon={Clock}
              color="bg-amber-500"
            />
            <StatsCard
              title="Total Users"
              value={users.length}
              icon={Users}
              color="bg-purple-500"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg border border-border shadow-sm p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-foreground">Recent Pending Requests</h3>
                <button
                  type="button"
                  onClick={() => navigate('/admin/papers')}
                  className="text-sm text-primary hover:underline"
                >
                  View all
                </button>
              </div>
              <div className="space-y-4">
                {recentPendingRequests.map((request) => (
                  <button
                    key={request._id}
                    type="button"
                    onClick={() => navigate(`/paper/${request._id}`)}
                    className="flex w-full items-center justify-between gap-4 border-b border-border py-3 text-left transition-colors last:border-0 hover:bg-accent/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-foreground">{request.title}</p>
                      <p className="truncate text-muted-foreground">{request.requestedBy?.fullName || 'Unknown user'}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <StatusBadge status={request.status} />
                      <span className="text-muted-foreground">{formatDisplayDate(request.createdAt)}</span>
                    </div>
                  </button>
                ))}

                {!isLoading && recentPendingRequests.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
                    <p className="text-foreground">No pending requests.</p>
                    <p className="mt-1 text-sm text-muted-foreground">New requests that need review will appear here.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-border shadow-sm p-4">
              <h3 className="text-foreground mb-3">Request Status Distribution</h3>
              <div className="space-y-3">
                {distribution.map((item) => {
                  const percent = getPercent(item.count);

                  return (
                    <div key={item.label}>
                      <div className="flex justify-between mb-2">
                        <span className="text-foreground">{item.label}</span>
                        <span className="text-muted-foreground">{percent}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-3">
                        <div className={`${item.color} h-3 rounded-full`} style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
