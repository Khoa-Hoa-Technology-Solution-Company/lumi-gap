import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { useAdminUsers } from "@/features/admin/hooks/use-admin-users";
import { ForumLayout, ForumSurface } from "@/features/forum/components/forum-layout";
import { ForumSidebar } from "@/features/forum/components/forum-sidebar";
import { useForumCategories } from "@/features/forum/hooks/use-forum-categories";
import { forumCategoryApi } from "@/features/forum/api/forum-category.api";
import type { ForumCategoryInput, ForumCategoryView } from "@/features/forum/api/forum.api";

export function ForumCategoriesPage() {
  const user = useAuthStore((state) => state.user);
  const { t } = useI18n();
  if (user?.role !== "admin") return <div className="mx-auto max-w-xl p-8"><h1 className="text-xl font-semibold">{t("Category administration")}</h1><p className="mt-3 text-muted-foreground">{t("Only administrators can manage forum categories.")}</p><Link to="/forum" className="mt-4 inline-block text-primary">{t("Back to forum")}</Link></div>;
  return <CategoryAdministration />;
}

function CategoryAdministration() {
  const { t } = useI18n();
  const categories = useForumCategories(true);
  const client = useQueryClient();
  const [editor, setEditor] = useState<{ id?: string; input: ForumCategoryInput }>();
  const [moderatorCategory, setModeratorCategory] = useState<ForumCategoryView>();
  const save = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ForumCategoryInput }) => id ? forumCategoryApi.update(id, input) : forumCategoryApi.create(input),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["forum"] }); setEditor(undefined); toast.success(t("Category saved")); },
    onError: () => toast.error(t("Could not save category. Check the slug and try again.")),
  });
  const archive = useMutation({ mutationFn: (category: ForumCategoryView) => forumCategoryApi.update(category.id, { status: category.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE" }), onSuccess: () => { void client.invalidateQueries({ queryKey: ["forum"] }); }, onError: () => toast.error(t("Could not update category status.")) });
  const change = (input: Partial<ForumCategoryInput>) => setEditor((current) => current ? { ...current, input: { ...current.input, ...input } } : current);
  function submit(event: FormEvent) { event.preventDefault(); if (editor) save.mutate(editor); }
  return <ForumLayout sidebar={<ForumSidebar communities={categories.data?.filter((category) => category.status === "ACTIVE")} isAuthed />}>
    <ForumSurface className="p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-5"><div><h1 className="text-xl font-semibold">{t("Category administration")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("Organize forum fields and assign scoped moderators.")}</p></div><Button size="sm" onClick={() => { setEditor({ input: { name: "", slug: "", description: "", sortOrder: (categories.data?.reduce((max, row) => Math.max(max, row.sortOrder), -1) ?? -1) + 1 } }); setModeratorCategory(undefined); }}><Plus className="mr-1 h-4 w-4" />{t("New category")}</Button></div>
      {editor ? <form onSubmit={submit} className="space-y-4 border-b py-5" aria-label={t(editor.id ? "Edit category" : "New category")}>
        <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>{t("Name")} *</span><Input required minLength={2} maxLength={120} value={editor.input.name} onChange={(event) => change({ name: event.target.value })} /></label><label className="space-y-1 text-sm"><span>{t("Slug")} *</span><Input required pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={2} maxLength={120} value={editor.input.slug} placeholder="software-engineering" onChange={(event) => change({ slug: event.target.value })} /></label></div>
        <label className="block space-y-1 text-sm"><span>{t("Description")}</span><Input maxLength={2000} value={editor.input.description} onChange={(event) => change({ description: event.target.value })} /></label>
        <label className="block max-w-40 space-y-1 text-sm"><span>{t("Display order")}</span><Input type="number" required min={0} max={10000} value={editor.input.sortOrder} onChange={(event) => change({ sortOrder: Number(event.target.value) })} /></label>
        <div className="flex gap-2"><Button size="sm" disabled={save.isPending} type="submit">{t(save.isPending ? "Saving…" : "Save category")}</Button><Button type="button" size="sm" variant="ghost" disabled={save.isPending} onClick={() => setEditor(undefined)}>{t("Cancel")}</Button></div>
      </form> : null}
      {categories.isLoading ? <div role="status" className="space-y-4 py-6">{[0, 1, 2].map((value) => <div key={value} className="h-12 animate-pulse rounded bg-muted motion-reduce:animate-none" />)}</div> : categories.isError ? <div role="alert" className="py-6"><p>{t("Could not load categories.")}</p><Button variant="outline" className="mt-3" onClick={() => void categories.refetch()}>{t("Retry")}</Button></div> : <ul className="divide-y">{categories.data?.map((category) => <li key={category.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><div className="flex items-center gap-2"><span className="text-xs tabular-nums text-muted-foreground">{category.sortOrder}</span><Link to={`/forum?category=${encodeURIComponent(category.slug)}`} className="font-medium hover:text-primary">{t(category.name)}</Link>{category.status === "ARCHIVED" ? <span className="rounded bg-muted px-2 py-0.5 text-xs">{t("Archived")}</span> : null}</div><p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">{category.description}</p></div><div className="flex flex-wrap gap-1"><Button variant="ghost" size="sm" onClick={() => { setEditor({ id: category.id, input: { name: category.name, slug: category.slug, description: category.description, sortOrder: category.sortOrder } }); setModeratorCategory(undefined); }}>{t("Edit")}</Button><Button variant="ghost" size="sm" onClick={() => { setModeratorCategory(category); setEditor(undefined); }}>{t("Moderators")}</Button><Button variant="outline" size="sm" disabled={archive.isPending} onClick={() => archive.mutate(category)}>{t(category.status === "ACTIVE" ? "Archive" : "Restore")}</Button></div></li>)}</ul>}
      {moderatorCategory ? <CategoryModerators category={moderatorCategory} onClose={() => setModeratorCategory(undefined)} /> : null}
    </ForumSurface>
  </ForumLayout>;
}

function CategoryModerators({ category, onClose }: { category: ForumCategoryView; onClose: () => void }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => setQuery(search.trim()), 250); return () => window.clearTimeout(timer); }, [search]);
  const users = useAdminUsers({ search: query, pageSize: 10, accountStatus: "ACTIVE" }, query.length >= 2);
  const moderators = useQuery({ queryKey: ["forum", "category-moderators", category.id], queryFn: () => forumCategoryApi.moderators(category.id) });
  const assign = useMutation({ mutationFn: ({ userId, assigned }: { userId: string; assigned: boolean }) => forumCategoryApi.assignModerator(category.id, userId, assigned), onSuccess: () => { void client.invalidateQueries({ queryKey: ["forum"] }); }, onError: () => toast.error(t("Could not update moderator assignment.")) });
  return <section className="mt-4 space-y-3 border-t pt-5" aria-label={t("Category moderators")}><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{t(category.name)} · {t("Moderators")}</h2><Button variant="ghost" size="icon" onClick={onClose} aria-label={t("Close")}><X className="h-4 w-4" /></Button></div><p className="text-sm text-muted-foreground">{t("Moderation authority applies only to this category.")}</p>
    {moderators.isError ? <p role="alert">{t("Could not load moderators.")}</p> : moderators.isLoading ? <p role="status">{t("Loading…")}</p> : <ul className="divide-y">{moderators.data?.map((moderator) => <li key={moderator.userId} className="flex items-center justify-between py-2"><span>{moderator.fullName}</span><Button variant="ghost" size="sm" disabled={assign.isPending} onClick={() => assign.mutate({ userId: moderator.userId, assigned: false })}>{t("Revoke")}</Button></li>)}</ul>}
    <label className="block space-y-1 text-sm"><span>{t("Find a researcher to assign")}</span><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Search by name or email")} /></label>
    {users.isError ? <p role="alert">{t("Could not load users.")}</p> : query.length >= 2 ? <ul className="divide-y">{users.data?.data.filter((user) => !moderators.data?.some((moderator) => moderator.userId === user.id)).map((user) => <li key={user.id} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0"><span className="block text-sm font-medium">{user.fullName}</span><span className="block truncate text-xs text-muted-foreground">{user.email}</span></span><Button variant="outline" size="sm" disabled={assign.isPending} onClick={() => assign.mutate({ userId: user.id, assigned: true })}>{t("Assign")}</Button></li>)}</ul> : null}
  </section>;
}
