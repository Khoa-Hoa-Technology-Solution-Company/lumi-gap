import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Edit,
  FileText,
  Lock,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { LoadingSkeleton } from '../components/LoadingSpinner';
import { apiRequest, AuthUser, getStoredUser } from '../lib/api';
import { formatDisplayDate } from '../lib/date';
import { calculateCurrentRank } from '../lib/userRanking';
import { getRankImage } from '../lib/rankVisuals';

type PaperRequest = {
  _id: string;
  status: string;
  pdfPath?: string;
};

type UserRanking = {
  rank: number;
  points: number;
  uploadedPapers: number;
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function UserPublicProfilePage() {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [papers, setPapers] = useState<PaperRequest[]>([]);
  const [ranking, setRanking] = useState<UserRanking | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      apiRequest<{ user: AuthUser }>('/auth/me', { auth: true }),
      apiRequest<{ papers: PaperRequest[] }>('/papers/my-requests', { auth: true }).catch(() => ({ papers: [] })),
      apiRequest<{ ranking: UserRanking }>('/rankings/me', { auth: true }).catch(() => ({ ranking: null })),
    ])
      .then(([profileData, paperData, rankingData]) => {
        if (!isMounted) return;
        setUser(profileData.user);
        setPapers(paperData.papers);
        setRanking(rankingData.ranking);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const initials = getInitials(user?.fullName || '') || 'U';
  const approvedCount = papers.filter((paper) =>
    ['approved', 'downloaded', 'not-downloaded', 'pending-requester-acceptance'].includes(paper.status)
  ).length;
  const pdfCount = papers.filter((paper) => paper.status === 'downloaded' && Boolean(paper.pdfPath)).length;
  const academicRank = calculateCurrentRank(ranking?.points ?? 0, ranking?.uploadedPapers ?? 0);

  return (
    <div className="min-h-screen bg-[#f5f3f0]">
      <AppHeader role="user" />

      <main className="pt-16 md:pt-0">
        <div className="h-44 bg-[#211b18] md:h-52" />

        <div className="mx-auto -mt-20 max-w-5xl px-4 pb-10">
          {isLoading ? (
            <LoadingSkeleton variant="profile" />
          ) : (
            <>
              <section className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
                <div className="h-28 bg-slate-800" />
                <div className="px-6 pb-8 md:px-8">
                  <div className="-mt-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                      <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-lg border-4 border-white bg-[#211b18] text-4xl font-semibold text-white shadow-sm">
                  {initials}
                      </div>
                      <div className="pb-1">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                            <CreditCard size={15} />
                            {user?.credits ?? 0} credits
                          </span>
                          <span className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                            Member account
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
                            <Lock size={14} />
                            Secure profile
                          </span>
                          <span className="inline-flex items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-1 text-sm font-medium text-violet-700">
                            <img src={getRankImage(academicRank.level)} alt="" className="h-5 w-5 object-contain" />
                            Lv. {academicRank.level} · {academicRank.name}
                          </span>
                        </div>
                        <h1 className="text-3xl font-semibold text-foreground">{user?.fullName || 'LiemResearch user'}</h1>
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-2">
                            <Building2 size={16} />
                            {user?.university || 'Research community member'}
                          </span>
                          <span className="flex items-center gap-2">
                            <CalendarDays size={16} />
                            Joined {formatDisplayDate(user?.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Link
                      to="/settings/profile"
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
                    >
                      <Edit size={18} />
                      Edit profile
                    </Link>
                  </div>

                  <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
                    <ProfileMetric icon={FileText} label="Papers" value={papers.length} />
                    <ProfileMetric icon={CheckCircle2} label="Approved" value={approvedCount} />
                    <ProfileMetric icon={Upload} label="PDFs" value={pdfCount} />
                    <ProfileMetric icon={CreditCard} label="Credits" value={user?.credits ?? 0} />
                  </div>
                </div>
              </section>

              <div className="mt-5 grid gap-5 md:grid-cols-[280px_minmax(0,1fr)]">
                <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
                  <h2 className="mb-3 text-lg font-semibold text-foreground">Badges</h2>
                  <ProfileBadge icon={ShieldCheck} label="Community member" tone="blue" />
                  <ProfileBadge icon={Lock} label="Secure profile" tone="amber" />
                  <ProfileBadge icon={FileText} label="Paper contributor" active={papers.length > 0} tone="green" />
                  <ProfileBadge icon={Upload} label="PDF contributor" active={pdfCount > 0} tone="violet" />
                  <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-3 text-violet-700">
                    <div className="flex items-center gap-3">
                      <img src={getRankImage(academicRank.level)} alt={academicRank.name} className="h-12 w-12 object-contain" />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide">Academic rank</p>
                        <p className="font-semibold">Lv. {academicRank.level} · {academicRank.name}</p>
                        <p className="mt-0.5 text-xs">{ranking ? `Leaderboard #${ranking.rank} · ${ranking.points} points` : '0 points'}</p>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-white shadow-sm">
                  <div className="border-b border-border px-5 py-4">
                    <h2 className="text-xl font-semibold text-foreground">Recent activity</h2>
                  </div>
                  <p className="px-5 py-8 text-muted-foreground">
                    Your latest paper requests and PDF contributions will appear here.
                  </p>
                </section>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function ProfileMetric({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon size={18} className="text-primary" />
      </div>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

const badgeTones = {
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
};

function ProfileBadge({
  icon: Icon,
  label,
  tone,
  active = true,
}: {
  icon: typeof FileText;
  label: string;
  tone: keyof typeof badgeTones;
  active?: boolean;
}) {
  return (
    <div className={`mb-2.5 flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium ${active ? badgeTones[tone] : 'border-border bg-muted text-muted-foreground opacity-55'}`}>
      <Icon size={17} />
      {label}
    </div>
  );
}
