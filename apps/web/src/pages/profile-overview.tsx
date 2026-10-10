import { Link, useSearchParams } from "react-router-dom";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/features/auth";
import { AcademicProfileView, useAcademicProfile } from "@/features/academic-profile";
import type { EditSection } from "@/features/academic-profile/components/academic-profile-inline-editor";

const editSections: EditSection[] = ["cover", "intro", "research", "works", "affiliation", "availability", "link"];

export function ProfilePage() {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = currentUser?.user;
  const hasAcademicProfile = Boolean(user?.primaryPosition || user?.onboarding?.completed);
  const { data: profile, isLoading: profileLoading, error } = useAcademicProfile(hasAcademicProfile);
  const requestedSection = searchParams.get("edit");
  const editingSection = requestedSection === "1" || requestedSection === "about" ? "intro"
    : editSections.find((section) => section === requestedSection) ?? null;
  const setEditing = (section: EditSection | null) => setSearchParams(current => {
    const next = new URLSearchParams(current);
    if (section) next.set("edit", section);
    else next.delete("edit");
    return next;
  }, { replace: true });

  if (userLoading || (hasAcademicProfile && profileLoading)) {
    return <main className="mx-auto max-w-[1120px] px-4 py-8" aria-label="Loading profile"><div className="h-80 animate-pulse rounded-[22px] bg-slate-100 dark:bg-slate-900" /><div className="mt-5 h-48 animate-pulse rounded-[18px] bg-slate-100 dark:bg-slate-900" /></main>;
  }

  if (!user) {
    return <main className="mx-auto max-w-3xl px-4 py-16"><p className="text-sm text-slate-600">Unable to load your profile.</p></main>;
  }

  if (!hasAcademicProfile) {
    return <main className="mx-auto max-w-3xl px-4 py-12"><div className="rounded-[18px] border border-slate-200 bg-white p-7 dark:border-slate-800 dark:bg-[#101923]"><h1 className="text-2xl font-semibold text-slate-950 dark:text-white">{user.fullName}</h1><p className="mt-2 text-sm text-slate-500">Your account does not have an academic profile yet.</p><Button asChild variant="outline" className="mt-5 gap-2"><Link to="/settings/profile"><Settings2 className="h-4 w-4" />Account settings</Link></Button></div></main>;
  }

  if (error || !profile) {
    return <main className="mx-auto max-w-3xl px-4 py-16"><h1 className="text-xl font-semibold text-slate-950 dark:text-white">Academic profile unavailable</h1><p className="mt-2 text-sm text-slate-500">Please try again or check your account details.</p><Button asChild variant="outline" className="mt-5"><Link to="/settings/profile">Account settings</Link></Button></main>;
  }

  return <AcademicProfileView profile={profile} editableProfile={profile} editingSection={editingSection} onEdit={setEditing} onCloseEdit={() => setEditing(null)} />;
}
