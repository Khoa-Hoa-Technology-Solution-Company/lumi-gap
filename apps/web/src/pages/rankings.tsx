import React, { useEffect, useState, useRef } from 'react';
import { Crown, Trophy, Medal, Award, Info, ShieldCheck, FileText, Upload, Star, Loader2, ChevronLeft, ChevronRight, Sparkles, TrendingUp, Users } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { api } from '@/services/api-client';
import { useAuthStore } from '@/stores/auth-store';

import { avatars, getLevel, getLevelProgress, getNextLevelPoints } from '@/utils/level';
import { formatNumber } from '@/utils';

interface RankingUser {
  rank: number;
  id: string;
  name: string;
  university: string;
  role: string;
  points: number;
  credits: number;
  avatarUrl: string | null;
  level?: number;
  isMe?: boolean;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface MyRankingStats {
  points: number;
  uploadCreditReward: number;
  uploadedPdfs: number;
  requestedPapers: number;
  ratingsGiven: number;
  penaltyPoints: number;
}

interface MyRanking {
  rank: number;
  user: { id: string; name: string; university: string; role: string; avatarUrl: string | null };
  stats: MyRankingStats;
}

// ────────────────────────── Particle Background ──────────────────────────────
function FloatingParticle({ delay, x, size }: { delay: number; x: number; size: number }) {
  return (
    <div
      className="ranking-particle"
      style={{ left: `${x}%`, width: size, height: size, animationDelay: `${delay}s`, animationDuration: `${6 + Math.random() * 4}s` }}
    />
  );
}

// ────────────────────────── Podium Card ──────────────────────────────────────
interface PodiumCardProps {
  user: RankingUser;
  place: 1 | 2 | 3;
  delay: number;
}

function PodiumCard({ user, place, delay }: PodiumCardProps) {
  const isFirst = place === 1;
  const isSecond = place === 2;

  const config = {
    1: {
      border: 'border-yellow-400 dark:border-yellow-500',
      bg: 'from-yellow-50 via-amber-50/30 to-white dark:from-[#2a2410] dark:via-[#1e1a0e] dark:to-[#0f0e0a]',
      shadow: 'shadow-[0_20px_60px_rgba(250,204,21,0.25)] dark:shadow-[0_20px_60px_rgba(250,204,21,0.10)]',
      glow: 'before:bg-yellow-400/20 dark:before:bg-yellow-400/10',
      rankBg: 'bg-gradient-to-br from-yellow-400 to-amber-500',
      rankText: 'text-white',
      pointColor: 'text-yellow-700 dark:text-yellow-400',
      pointBg: 'bg-yellow-100/60 dark:bg-yellow-900/25 border-yellow-200 dark:border-yellow-700/30',
      height: 'h-[340px]',
      avatarSize: 'w-32 h-32',
      nameSize: 'text-xl',
      icon: <Crown className="w-8 h-8 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]" fill="currentColor" />,
    },
    2: {
      border: 'border-slate-300 dark:border-slate-600',
      bg: 'from-slate-50 via-gray-50/30 to-white dark:from-[#1e2030] dark:via-[#181a28] dark:to-[#0f1018]',
      shadow: 'shadow-[0_10px_40px_rgba(148,163,184,0.2)] dark:shadow-[0_10px_40px_rgba(100,116,139,0.10)]',
      glow: 'before:bg-slate-300/20 dark:before:bg-slate-500/10',
      rankBg: 'bg-gradient-to-br from-slate-300 to-slate-500',
      rankText: 'text-white',
      pointColor: 'text-slate-700 dark:text-slate-300',
      pointBg: 'bg-slate-100/60 dark:bg-slate-800/50',
      height: 'h-[280px]',
      avatarSize: 'w-24 h-24',
      nameSize: 'text-lg',
      icon: <Medal className="w-6 h-6 text-slate-400" />,
    },
    3: {
      border: 'border-orange-300 dark:border-orange-700',
      bg: 'from-orange-50 via-amber-50/20 to-white dark:from-[#231a10] dark:via-[#1c1408] dark:to-[#0f0c06]',
      shadow: 'shadow-[0_10px_40px_rgba(249,115,22,0.15)] dark:shadow-[0_10px_40px_rgba(234,88,12,0.08)]',
      glow: 'before:bg-orange-300/20 dark:before:bg-orange-500/10',
      rankBg: 'bg-gradient-to-br from-orange-300 to-amber-600',
      rankText: 'text-white',
      pointColor: 'text-orange-700 dark:text-orange-400',
      pointBg: 'bg-orange-100/50 dark:bg-orange-900/20',
      height: 'h-[240px]',
      avatarSize: 'w-20 h-20',
      nameSize: 'text-base',
      icon: <Award className="w-6 h-6 text-orange-400" />,
    },
  }[place];

  return (
    <div
      className={`relative bg-gradient-to-b ${config.bg} border-2 ${config.border} rounded-2xl flex flex-col items-center text-center
        ${config.shadow} ${config.height} justify-between p-6
        before:absolute before:inset-0 before:rounded-2xl ${config.glow} before:opacity-0 hover:before:opacity-100 before:transition-opacity
        ranking-podium-card`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Clipped container for shimmer effect */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none z-0">
        <div className="absolute inset-0 pointer-events-none ranking-shimmer" />
      </div>

      {/* Rank badge */}
      <div className={`absolute ${isFirst ? '-top-10' : '-top-6'} flex flex-col items-center gap-1 z-10`}>
        {isFirst && config.icon}
        <div className={`${isFirst ? 'w-14 h-14 text-xl' : 'w-12 h-12 text-base'} ${config.rankBg} ${config.rankText} rounded-full border-4 border-white dark:border-[#0f0e0a] flex items-center justify-center font-black shadow-lg ranking-bounce`}
          style={{ animationDelay: `${delay + 200}ms` }}>
          #{place}
        </div>
        {!isFirst && config.icon}
      </div>

      {/* Avatar */}
      <div className={`${config.avatarSize} mt-6 ranking-avatar-float z-10`} style={{ animationDelay: `${delay + 400}ms` }}>
        <img src={avatars[user.level ?? 1]!} alt={`Level ${user.level}`} className="w-full h-full object-contain filter drop-shadow-xl" />
      </div>

      {/* Name + Level */}
      <div className="w-full z-10">
        <h4 className={`font-black ${config.nameSize} text-slate-900 dark:text-white truncate`}>{user.name}</h4>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5 truncate">
          Lv.{user.level} · {user.university || 'N/A'}
        </p>
      </div>

      {/* Points */}
      <div className={`w-full py-2.5 ${config.pointBg} rounded-xl border border-transparent z-10`}>
        <span className={`font-black text-xl ${config.pointColor}`}>{formatNumber(user.points)}</span>
        <span className="text-xs text-slate-400 uppercase tracking-wider font-bold ml-1">pts</span>
      </div>
    </div>
  );
}

// ────────────────────────── Table Row ────────────────────────────────────────
function TableRow({ user, index }: { user: RankingUser; index: number }) {
  return (
    <tr
      className={`group transition-all duration-200 ranking-table-row ${
        user.isMe
          ? 'bg-blue-50/60 dark:bg-blue-950/30 hover:bg-blue-50 dark:hover:bg-blue-950/50'
          : 'hover:bg-slate-50/80 dark:hover:bg-white/[0.03]'
      }`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <td className="px-6 py-4 text-center w-16">
        <span className="font-black text-slate-300 dark:text-slate-700 text-sm">#{user.rank}</span>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 shrink-0 relative">
            <img src={avatars[user.level ?? 1]!} alt={`Lv ${user.level}`} className="w-full h-full object-contain" />
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-slate-800 dark:bg-[#1c1f26] rounded-full flex items-center justify-center">
              <span className="text-[7px] font-black text-slate-400">{user.level}</span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`font-bold text-sm truncate ${user.isMe ? 'text-blue-600 dark:text-blue-400' : 'text-slate-900 dark:text-white'}`}>
                {user.name}
              </span>
              {user.isMe && (
                <span className="bg-blue-600 text-white text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider shrink-0">You</span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-600 mt-0.5 truncate font-medium">
              {user.university || '—'}
            </div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-center hidden sm:table-cell">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-600 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-md">
          {user.role}
        </span>
      </td>
      <td className="px-6 py-4 text-center hidden md:table-cell">
        <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-lg text-slate-500 dark:text-slate-500 font-semibold text-xs">
          <FileText className="w-3 h-3" /> {user.credits}
        </div>
      </td>
      <td className="px-6 py-4 text-right">
        <span className={`font-black text-base ${user.isMe ? 'text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}>
          {formatNumber(user.points)}
        </span>
        <span className="text-[10px] text-slate-400 ml-0.5 font-semibold">pts</span>
      </td>
    </tr>
  );
}

// ────────────────────────── Main Component ───────────────────────────────────
export function RankingsPage() {
  const [rankings, setRankings] = useState<RankingUser[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [myRanking, setMyRanking] = useState<MyRanking | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState(false);
  const currentUser = useAuthStore((s) => s.user);
  const particles = useRef(Array.from({ length: 15 }, (_, i) => ({ id: i, delay: i * 0.4, x: (i * 7) % 100, size: 4 + (i % 4) * 2 }))).current;

  const fetchRankings = async (page: number) => {
    setPageLoading(true);
    setError(false);
    try {
      const res = await api.get(`/auth/rankings/top?page=${page}&limit=20`);
      const raw: RankingUser[] = (res.data.data ?? []).map((u: any) => ({
        ...u,
        level: getLevel(u.points),
        isMe: u.id === currentUser?.id,
      }));
      setRankings(raw);
      setPagination(res.data.meta ?? { page, limit: 20, total: raw.length, totalPages: 1 });
    } catch {
      // Distinguish a real fetch error from a genuinely empty leaderboard.
      setError(true);
    } finally {
      setPageLoading(false);
      setLoading(false);
    }
  };

  const fetchMyRanking = async () => {
    if (!currentUser) return;
    try {
      const res = await api.get('/auth/rankings/me');
      if (res.data.success) setMyRanking(res.data.data as MyRanking);
    } catch {
      // not ranked or not logged in
    }
  };

  useEffect(() => {
    fetchRankings(1);
    fetchMyRanking();
  }, [currentUser?.id]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    void fetchRankings(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="relative">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
          <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" />
        </div>
        <p className="text-slate-400 text-sm font-medium animate-pulse">Loading leaderboard…</p>
      </div>
    );
  }

  // Real fetch error → don't masquerade as an empty leaderboard; offer a retry.
  if (error && rankings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
        <p className="font-bold text-slate-700 dark:text-slate-200">Failed to load rankings.</p>
        <p className="text-sm text-slate-400">Please try again later.</p>
        <button
          onClick={() => void fetchRankings(1)}
          className="mt-2 px-5 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  const isFirstPage = pagination.page === 1;
  const top3 = isFirstPage ? rankings.slice(0, 3) : [];
  const tableRows = isFirstPage ? rankings.slice(3) : rankings;
  const first = top3[0];
  const second = top3[1];
  const third = top3[2];

  const userPoints = myRanking ? myRanking.stats.points : (currentUser?.points ?? 0);
  const myLevel = getLevel(userPoints);
  const myProgress = getLevelProgress(userPoints, myLevel);
  const myNextLevel = getNextLevelPoints(myLevel);

  function getTierLabel(pts: number) {
    if (pts >= 3000) return 'Legendary';
    if (pts >= 1000) return 'Expert';
    if (pts >= 300) return 'Advanced';
    if (pts >= 75) return 'Scholar';
    return 'Novice';
  }
  const activeTier = getTierLabel(userPoints);

  return (
    <>
      {/* ───── Inline Keyframe Styles ───── */}
      <style>{`
        @keyframes rankingFadeUp {
          from { opacity: 0; transform: translateY(30px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes rankingBounce {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
        @keyframes rankingFloat {
          0%,100% { transform: translateY(0) rotate(-1deg); }
          50%      { transform: translateY(-8px) rotate(1deg); }
        }
        @keyframes rankingParticle {
          0%   { transform: translateY(100vh) scale(0); opacity: 0; }
          10%  { opacity: 0.6; }
          90%  { opacity: 0.4; }
          100% { transform: translateY(-10vh) scale(1.5); opacity: 0; }
        }
        @keyframes rankingShimmer {
          0%   { transform: translateX(-100%) rotate(25deg); opacity: 0; }
          40%  { opacity: 0.08; }
          100% { transform: translateX(200%) rotate(25deg); opacity: 0; }
        }
        @keyframes rankingPulseGlow {
          0%,100% { box-shadow: 0 0 20px rgba(99,102,241,0.15); }
          50%      { box-shadow: 0 0 40px rgba(99,102,241,0.35); }
        }
        @keyframes rankingRowSlide {
          from { opacity: 0; transform: translateX(-16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes rankingCrownSpin {
          0%   { transform: rotate(-10deg) scale(1); }
          50%  { transform: rotate(10deg) scale(1.15); }
          100% { transform: rotate(-10deg) scale(1); }
        }
        @keyframes rankingStarPop {
          0%,100% { transform: scale(1); opacity: 0.7; }
          50%      { transform: scale(1.4); opacity: 1; }
        }

        .ranking-podium-card {
          animation: rankingFadeUp 0.7s ease both;
          transform-style: preserve-3d;
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .ranking-podium-card:hover { transform: translateY(-8px); }

        .ranking-bounce {
          animation: rankingBounce 2.5s ease-in-out infinite;
        }
        .ranking-avatar-float {
          animation: rankingFloat 3.5s ease-in-out infinite;
        }
        .ranking-shimmer::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%);
          animation: rankingShimmer 3.5s ease-in-out infinite;
        }
        .ranking-particle {
          position: absolute;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(99,102,241,0.5) 0%, transparent 70%);
          animation: rankingParticle ease-in-out infinite;
          pointer-events: none;
        }
        .ranking-table-row {
          animation: rankingRowSlide 0.5s ease both;
        }
        .ranking-crown-anim {
          animation: rankingCrownSpin 3s ease-in-out infinite;
        }
        .ranking-star-pop {
          animation: rankingStarPop 1.5s ease-in-out infinite;
        }
        .ranking-glow-card {
          animation: rankingPulseGlow 3s ease-in-out infinite;
        }
        .ranking-header-gradient {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 40%, #ec4899 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
      `}</style>

      <div className="w-full relative">

        {/* ── Floating Particles (decorative background) ── */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 opacity-40">
          {particles.map((p) => (
            <FloatingParticle key={p.id} delay={p.delay} x={p.x} size={p.size} />
          ))}
        </div>

        {/* ── Page Header ── */}
        <PageHeader
          title="Leaderboard"
          description="Top contributors by approved PDFs, useful ratings, and academic impact."
        />

        <div className="mt-8 flex flex-col xl:flex-row gap-8 relative z-10">

          {/* ══════════════ MAIN COLUMN ══════════════ */}
          <div className="flex-1 min-w-0 space-y-10">

            {/* ── Podium (first page only) ── */}
            {isFirstPage && (
              <section>

                {rankings.length === 0 ? (
                  <div className="text-center py-20 text-slate-400 dark:text-zinc-600 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                    <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-bold">No ranking data yet.</p>
                    <p className="text-sm mt-1">Be the first to contribute and earn points!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end pt-10">
                    {/* Silver (2nd) */}
                    <div className="order-2 md:order-1">
                      {second
                        ? <PodiumCard user={second} place={2} delay={200} />
                        : <EmptyPodium place={2} />}
                    </div>
                    {/* Gold (1st) — center/tallest */}
                    <div className="order-1 md:order-2">
                      {first
                        ? <PodiumCard user={first} place={1} delay={0} />
                        : <EmptyPodium place={1} />}
                    </div>
                    {/* Bronze (3rd) */}
                    <div className="order-3">
                      {third
                        ? <PodiumCard user={third} place={3} delay={400} />
                        : <EmptyPodium place={3} />}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* ── Leaderboard Table ── */}
            <section>
              <div className="bg-white dark:bg-[#0f1014] border border-slate-200 dark:border-white/[0.06] rounded-2xl shadow-sm overflow-hidden">

                {/* Table header bar */}
                <div className="px-6 py-5 border-b border-slate-100 dark:border-white/[0.05] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Users className="w-5 h-5 text-indigo-500" />
                    <h3 className="font-black text-slate-900 dark:text-white text-lg">Rankings</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-full text-xs font-black border border-indigo-100 dark:border-indigo-500/20">
                      {pagination.total} Users
                    </span>
                    {pageLoading && <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50/70 dark:bg-white/[0.02] text-slate-400 dark:text-slate-600 text-[11px] uppercase font-black tracking-wider">
                      <tr>
                        <th className="px-6 py-3 w-16 text-center">Rank</th>
                        <th className="px-6 py-3">User</th>
                        <th className="px-6 py-3 text-center hidden sm:table-cell">Role</th>
                        <th className="px-6 py-3 text-center hidden md:table-cell">Credits</th>
                        <th className="px-6 py-3 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                      {tableRows.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-center py-12 text-slate-400 dark:text-slate-600 font-medium text-sm">
                            No users on this page.
                          </td>
                        </tr>
                      )}
                      {tableRows.map((user, i) => (
                        <TableRow key={user.id} user={user} index={i} />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.05] flex flex-col sm:flex-row items-center justify-between gap-4">
                    <span className="text-xs text-slate-400 font-medium text-center sm:text-left">
                      Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handlePageChange(pagination.page - 1)}
                        disabled={pagination.page <= 1 || pageLoading}
                        className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400
                          hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                        const p = Math.max(1, pagination.page - 2) + i;
                        if (p > pagination.totalPages) return null;
                        return (
                          <button
                            key={p}
                            onClick={() => handlePageChange(p)}
                            disabled={pageLoading}
                            className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${
                              p === pagination.page
                                ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.4)]'
                                : 'border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                            }`}
                          >
                            {p}
                          </button>
                        );
                      })}

                      <button
                        onClick={() => handlePageChange(pagination.page + 1)}
                        disabled={pagination.page >= pagination.totalPages || pageLoading}
                        className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400
                          hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        aria-label="Next page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* ══════════════ SIDEBAR ══════════════ */}
          <aside className="w-full xl:w-[320px] shrink-0 space-y-5">

            {/* ── Your Position Card ── */}
            {myRanking ? (
              <div className="relative bg-gradient-to-br from-[#3730a3] via-[#4f46e5] to-[#7c3aed] rounded-2xl p-6 text-white shadow-[0_20px_60px_rgba(79,70,229,0.35)] overflow-hidden ranking-glow-card">
                {/* BG decoration */}
                <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-purple-400/20 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl pointer-events-none" />

                {/* Stars decoration */}
                {[0, 1, 2].map((i) => (
                  <Sparkles
                    key={i}
                    className={`absolute w-3 h-3 text-yellow-300/60 ranking-star-pop`}
                    style={{ top: `${20 + i * 25}%`, right: `${15 + i * 10}%`, animationDelay: `${i * 0.5}s` }}
                  />
                ))}

                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-5">
                    <ShieldCheck className="w-4 h-4 text-indigo-200" />
                    <h3 className="font-black text-sm tracking-wide text-indigo-100">Your Position</h3>
                  </div>

                  {/* Rank + Avatar */}
                  <div className="flex items-center gap-4 mb-5">
                    <div className="w-16 h-16 bg-white/15 rounded-2xl p-2 border border-white/20 backdrop-blur-sm">
                      <img src={avatars[myLevel]!} alt="My Level" className="w-full h-full object-contain drop-shadow-lg" />
                    </div>
                    <div>
                      <div className="text-4xl font-black leading-none mb-1">#{myRanking.rank}</div>
                      <div className="text-xs text-indigo-200 font-semibold">
                        Level {myLevel} · {formatNumber(myRanking.stats.points)} pts
                      </div>
                    </div>
                  </div>

                  {/* Progress bar to next level */}
                  <div className="mb-5">
                    <div className="flex justify-between text-[11px] text-indigo-200 font-semibold mb-1.5">
                      <span>Lv.{myLevel}</span>
                      <span>Lv.{Math.min(myLevel + 1, 10)}</span>
                    </div>
                    <div className="w-full bg-white/15 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)] transition-all duration-1000"
                        style={{ width: `${myProgress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-indigo-300/70 mt-1 font-medium">
                      <span>{myRanking.stats.points} pts</span>
                      {myLevel < 10 && <span>Next: {myNextLevel} pts</span>}
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Uploads', value: myRanking.stats.uploadedPdfs, icon: <Upload className="w-3 h-3" />, color: 'bg-emerald-400/20' },
                      { label: 'Ratings', value: myRanking.stats.ratingsGiven, icon: <Star className="w-3 h-3" />, color: 'bg-yellow-400/20' },
                      { label: 'Papers', value: myRanking.stats.requestedPapers, icon: <FileText className="w-3 h-3" />, color: 'bg-blue-400/20' },
                    ].map((s) => (
                      <div key={s.label} className={`${s.color} rounded-xl p-2.5 flex flex-col items-center gap-1 border border-white/10`}>
                        <div className="text-indigo-200">{s.icon}</div>
                        <div className="font-black text-lg leading-none">{s.value}</div>
                        <div className="text-[9px] text-indigo-300/70 font-semibold uppercase tracking-wider">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {/* ── Trending ── */}
            <div className="bg-white dark:bg-[#0f1014] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-5 shadow-sm">
              <h3 className="font-black text-slate-900 dark:text-white mb-4 flex items-center gap-2 text-sm">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                How Points Are Earned
              </h3>
              <div className="space-y-3">
                {[
                  { icon: <Upload className="w-4 h-4" />, color: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', label: 'Successful PDF Upload', value: '+60–180 pts' },
                  { icon: <Star className="w-4 h-4" />, color: 'bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400', label: 'Rate a Paper / Report', value: '+5 pts each' },
                  { icon: <Award className="w-4 h-4" />, color: 'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400', label: 'Download a Paper', value: 'Credits used' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3 group">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.color} transition-transform group-hover:scale-110`}>
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{item.label}</div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-600 font-semibold">{item.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Level Guide ── */}
            <div className="bg-white dark:bg-[#0f1014] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-5 shadow-sm">
              <h3 className="font-black text-slate-900 dark:text-white mb-4 flex items-center gap-2 text-sm">
                <Sparkles className="w-4 h-4 text-purple-500" />
                Level Tiers
              </h3>
              <div className="space-y-2">
                {([
                  { lv: 10, label: 'Legendary', pts: '3000+', img: avatars[10], color: 'text-yellow-500' },
                  { lv: 7, label: 'Expert', pts: '1000+', img: avatars[7], color: 'text-purple-500' },
                  { lv: 5, label: 'Advanced', pts: '300+', img: avatars[5], color: 'text-blue-500' },
                  { lv: 3, label: 'Scholar', pts: '75+', img: avatars[3], color: 'text-emerald-500' },
                  { lv: 1, label: 'Novice', pts: '0+', img: avatars[1], color: 'text-slate-400' },
                ] as const).map((tier) => {
                  const isCurrentTier = activeTier === tier.label;
                  return (
                    <div
                      key={tier.lv}
                      className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03] ${
                        isCurrentTier
                          ? 'bg-indigo-50 dark:bg-indigo-500/10 ring-1 ring-indigo-200 dark:ring-indigo-500/20'
                          : ''
                      }`}
                    >
                      <img src={tier.img} alt={`Lv${tier.lv}`} className="w-7 h-7 object-contain shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-black ${tier.color}`}>{tier.label}</div>
                        <div className="text-[10px] text-slate-400 font-medium">{tier.pts} pts</div>
                      </div>
                      {isCurrentTier && (
                        <span className="text-[10px] bg-indigo-500 text-white px-1.5 py-0.5 rounded font-black animate-pulse">
                          YOU
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

          </aside>
        </div>
      </div>
    </>
  );
}

// ── Empty Podium Slot ──────────────────────────────────────────────────────
function EmptyPodium({ place }: { place: 1 | 2 | 3 }) {
  const icons = { 1: <Crown className="w-8 h-8 text-yellow-300/40 animate-pulse" />, 2: <Medal className="w-7 h-7 text-slate-300/40" />, 3: <Award className="w-7 h-7 text-orange-300/40" /> };
  const borders = { 1: 'border-yellow-200 dark:border-yellow-800/30', 2: 'border-slate-200 dark:border-slate-800', 3: 'border-orange-200 dark:border-orange-900/30' };
  const heights = { 1: 'h-[340px]', 2: 'h-[280px]', 3: 'h-[240px]' };
  return (
    <div className={`border-2 border-dashed ${borders[place]} ${heights[place]} rounded-2xl flex flex-col items-center justify-center gap-2 opacity-40`}>
      {icons[place]}
      <p className="text-xs font-bold text-slate-400">Rank #{place} is empty</p>
    </div>
  );
}
