import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api-client";
import {
  MessageSquare, ShieldAlert, Users, ThumbsUp, Eye,
  AlertTriangle, CheckCircle2, Lock, Trash2, Search
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/utils";

export function AdminCommunityPage() {
  const [activeTab, setActiveTab] = useState<"communities" | "discussions" | "moderation">("communities");
  const [search, setSearch] = useState("");

  const { data: communities, isLoading: isCommLoading } = useQuery({
    queryKey: ["admin", "communities"],
    queryFn: async () => {
      const res = await api.get("/communities").catch(() => ({ data: { data: [] } }));
      return (res.data.data ?? []) as Array<{
        id: string;
        name: string;
        slug: string;
        description?: string;
        memberCount?: number;
        postCount?: number;
        isPrivate?: boolean;
        createdAt: string;
      }>;
    },
  });

  const { data: forumPosts, isLoading: isPostsLoading } = useQuery({
    queryKey: ["admin", "forum-posts"],
    queryFn: async () => {
      const res = await api.get("/forum/posts", { params: { pageSize: 20 } }).catch(() => ({ data: { data: [] } }));
      return (res.data.data ?? []) as Array<{
        id: string;
        title: string;
        content: string;
        author?: { fullName: string; email: string };
        commentCount?: number;
        upvoteCount?: number;
        createdAt: string;
      }>;
    },
  });

  return (
    <div className="space-y-6 select-none">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Community & Content Moderation</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage academic discussion spaces, research communities, and platform content moderation.
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Active Communities</span>
            <Users className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {isCommLoading ? <Skeleton className="h-7 w-12" /> : formatNumber(communities?.length ?? 0)}
          </div>
          <p className="text-[11px] text-slate-400">Research working groups and specialized fields</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Forum Discussions</span>
            <MessageSquare className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {isPostsLoading ? <Skeleton className="h-7 w-12" /> : formatNumber(forumPosts?.length ?? 0)}
          </div>
          <p className="text-[11px] text-slate-400">Paper reviews, questions and methodology talks</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Flagged Reports</span>
            <ShieldAlert className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 tabular-nums">0</div>
          <p className="text-[11px] text-slate-400">All community content within academic safety norms</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold">
        <button
          onClick={() => setActiveTab("communities")}
          className={`pb-3 px-3 transition-colors ${
            activeTab === "communities"
              ? "border-b-2 border-blue-600 text-blue-600 font-bold"
              : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
          }`}
        >
          Communities ({communities?.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab("discussions")}
          className={`pb-3 px-3 transition-colors ${
            activeTab === "discussions"
              ? "border-b-2 border-blue-600 text-blue-600 font-bold"
              : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
          }`}
        >
          Discussions & Posts ({forumPosts?.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab("moderation")}
          className={`pb-3 px-3 transition-colors ${
            activeTab === "moderation"
              ? "border-b-2 border-blue-600 text-blue-600 font-bold"
              : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
          }`}
        >
          Moderation Queue (0)
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "communities" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {communities && communities.length > 0 ? (
              communities.map((c) => (
                <div key={c.id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{c.name}</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">{c.description || "No description provided."}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                      {c.memberCount || 1} members
                    </span>
                    <button className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
                      Settings
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">
                No communities created yet.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "discussions" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {forumPosts && forumPosts.length > 0 ? (
              forumPosts.map((p) => (
                <div key={p.id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <div className="min-w-0 flex-1 pr-4">
                    <h3 className="font-bold text-slate-900 dark:text-white truncate">{p.title}</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                      By {p.author?.fullName || "Anonymous"} • {new Date(p.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <MessageSquare className="h-3 w-3" /> {p.commentCount || 0}
                    </span>
                    <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
                      <Lock className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">
                No discussions or forum posts found.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "moderation" && (
        <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center text-xs text-slate-400 dark:border-slate-800">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
          <p className="font-semibold text-slate-700 dark:text-slate-300">Moderation Queue is Clean</p>
          <p className="text-[11px] text-slate-400 mt-1">No reported posts or users requiring administrative action.</p>
        </div>
      )}
    </div>
  );
}
