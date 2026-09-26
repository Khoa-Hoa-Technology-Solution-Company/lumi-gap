import { lazy, Suspense, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { AcademicProfile, PublicAcademicProfile } from "@trend/shared-types";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  Camera,
  CheckCircle2,
  CircleMinus,
  Clock3,
  Copy,
  ExternalLink,
  GraduationCap,
  HandHeart,
  Link2,
  MapPin,
  Pencil,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAcademicAvatar, useAcademicCover } from "../hooks/use-academic-profile";
import type { EditSection } from "./academic-profile-inline-editor";
import { AcademicIdentityManager } from "./academic-identity-manager";
import { ProfileAvatarDialog } from "./profile-avatar-dialog";
import { PositionVerificationPanel } from "./position-verification-panel";

const AcademicProfileInlineEditor = lazy(() => import("./academic-profile-inline-editor")
  .then((module) => ({ default: module.AcademicProfileInlineEditor })));

type VisibleProfile = PublicAcademicProfile | AcademicProfile;

const supportLabels: Record<string, string> = {
  RESEARCH_DIRECTION: "Research direction",
  LITERATURE_REVIEW: "Literature review",
  RESEARCH_GAP_VALIDATION: "Research gap validation",
  RESEARCH_METHODOLOGY: "Research methodology",
  EXPERIMENT_DESIGN: "Experiment design",
  DATA_ANALYSIS: "Data analysis",
  ACADEMIC_WRITING: "Academic writing",
  SOFTWARE_TECHNICAL_GUIDANCE: "Software guidance",
  RESEARCH_PROPOSAL: "Research proposal",
  RESEARCH_GAP: "Research gap",
  METHODOLOGY: "Methodology",
  EXPERIMENTAL_RESULTS: "Experimental results",
  RESEARCH_PAPER: "Research paper",
  SOFTWARE_RESEARCH_PROJECT: "Software research project",
};

const sectionLinks: Array<[string, string]> = [
  ["about", "About"],
  ["research", "Research"],
  ["works", "Works"],
  ["identity", "Identity"],
  ["availability", "Open to"],
];

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function safeExternalUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if ((url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password) return url.toString();
  } catch {
    return undefined;
  }
  return undefined;
}

export function AcademicProfileView({
  profile,
  editableProfile,
  editingSection,
  onEdit,
  onCloseEdit,
}: {
  profile: VisibleProfile;
  editableProfile?: AcademicProfile;
  editingSection?: EditSection | null;
  onEdit?: (section: EditSection) => void;
  onCloseEdit?: () => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [activeSection, setActiveSection] = useState("about");
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const authenticatedCoverSrc = useAcademicCover(profile.coverUrl);
  const avatarSrc = useAcademicAvatar(profile.avatarUrl);
  const owner = Boolean(editableProfile);
  const isLecturer = profile.primaryPosition === "LECTURER";
  const isStudent = profile.academicType === "student";
  const institution = profile.affiliation.institutionName;
  const showAvailability = profile.supportAvailability.enabled || profile.reviewAvailability.enabled;
  const expertise = useMemo(
    () => [...new Set([...profile.expertiseAreas, ...profile.skills])],
    [profile.expertiseAreas, profile.skills],
  );
  const hasResearch = profile.researchInterests.length > 0 || expertise.length > 0 || profile.researchKeywords.length > 0;
  const professionalLinks = profile.externalIdentities.filter((identity) => identity.provider === "GITHUB" && safeExternalUrl(identity.profileUrl));
  const title = profile.positionTitle || profile.affiliation.positionTitle || profile.affiliation.position || profile.academicTitle
    || (isStudent ? "Student" : isLecturer ? "Lecturer" : "Researcher");
  const coverSrc = authenticatedCoverSrc;
  const publicPath = `/academics/${profile.userId}`;
  const publicUrl = typeof window === "undefined" ? publicPath : `${window.location.origin}${publicPath}`;
  const editor = (section: EditSection) => editingSection === section && editableProfile
    ? (
      <Suspense fallback={<div className="mt-5 h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />}>
        <AcademicProfileInlineEditor key={section} section={section} profile={editableProfile} onClose={() => onCloseEdit?.()} />
      </Suspense>
    )
    : null;

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActiveSection(visible[0].target.id);
    }, { rootMargin: "-112px 0px -58% 0px", threshold: 0 });
    for (const [id] of sectionLinks) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, []);

  function scrollToSection(event: MouseEvent<HTMLAnchorElement>, id: string) {
    const section = document.getElementById(id);
    if (!section) return;
    event.preventDefault();
    setActiveSection(id);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${id}`);
    section.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }

  async function copyPublicUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-5 sm:px-6 sm:pt-8 lg:px-8">
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#101923]">
        <div className="relative h-36 overflow-hidden bg-slate-900 sm:h-44 lg:h-48" style={{ backgroundColor: "#0f2744" }}>
          {coverSrc && failedCover !== profile.coverUrl ? (
            <img src={coverSrc} alt="" onError={() => setFailedCover(profile.coverUrl ?? null)} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-50"
              style={{
                backgroundImage: "linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px), radial-gradient(circle at 82% 22%, rgba(37,99,235,.38), transparent 33%)",
                backgroundSize: "32px 32px, 32px 32px, 100% 100%",
              }}
            />
          )}
          {coverSrc && failedCover !== profile.coverUrl && <div aria-hidden="true" className="absolute inset-0 bg-[#0f2744]/45" />}
          <div className="absolute bottom-5 right-5 hidden text-right text-[10px] font-semibold uppercase tracking-[0.28em] text-blue-100/70 sm:block">
            LumiGap<br />Academic network
          </div>
          {owner && (
            <button
              type="button"
              aria-label={profile.coverUrl ? "Change cover image" : "Add cover image"}
              onClick={() => onEdit?.("cover")}
              className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-white/25 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-white backdrop-blur-sm transition-colors duration-150 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-5 sm:top-5"
            >
              <Camera className="h-3.5 w-3.5" />
              {profile.coverUrl ? "Change cover" : "Add cover"}
            </button>
          )}
        </div>

        <div className="relative px-5 pb-7 sm:px-8 sm:pb-8">
          <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
            <button
              type="button"
              disabled={!owner}
              aria-label={owner ? "Change profile photo" : undefined}
              onClick={() => owner && setAvatarDialogOpen(true)}
              className="group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-[5px] border-white bg-blue-100 text-2xl font-semibold text-[#0f2744] shadow-[0_12px_28px_-12px_rgba(15,39,68,0.75)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-default dark:border-[#101923] dark:bg-slate-700 dark:text-white sm:h-28 sm:w-28"
            >
              {avatarSrc ? <img src={avatarSrc} alt={`${profile.displayName} profile photo`} className="h-full w-full object-cover" /> : initials(profile.displayName)}
              {owner && (
                <span className="absolute inset-x-0 bottom-0 flex translate-y-full items-center justify-center gap-1 bg-slate-950/80 py-2 text-[10px] font-medium text-white transition-transform duration-150 group-hover:translate-y-0 group-focus-visible:translate-y-0">
                  <Camera className="h-3 w-3" />Change photo
                </span>
              )}
            </button>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:pb-1">
              {owner ? (
                <>
                  <Button type="button" size="sm" onClick={() => onEdit?.("intro")} className="w-full gap-2 bg-slate-900 text-white hover:bg-slate-800 sm:w-auto">
                    <Pencil className="h-3.5 w-3.5" />Edit profile
                  </Button>
                  <Button asChild size="sm" variant="outline" className="w-full sm:w-auto"><Link to={publicPath}>View public profile</Link></Button>
                </>
              ) : (
                <>
                  <Button asChild size="sm" variant="outline" className="w-full sm:w-auto"><Link to="/communities">Connect</Link></Button>
                  <Button asChild size="sm" variant="outline" className="w-full sm:w-auto"><Link to="/projects">Invite to project</Link></Button>
                  {profile.supportAvailability.enabled && <Button asChild size="sm" className="w-full bg-slate-900 text-white hover:bg-slate-800 sm:w-auto"><Link to="/communities">Request support</Link></Button>}
                </>
              )}
            </div>
          </div>

          <div className="mt-4 max-w-3xl">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-2xl font-semibold tracking-[-0.025em] text-slate-950 dark:text-slate-50 sm:text-[2rem]">{profile.displayName}</h1>
              {profile.verificationStatuses?.affiliation === "VERIFIED" && (
                <Badge className="gap-1.5 border border-emerald-200 bg-emerald-50 font-medium text-emerald-800 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                  <BadgeCheck className="h-3.5 w-3.5" />{institution ? `${institution} affiliation verified` : "Academic affiliation verified"}
                </Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200"><GraduationCap className="h-4 w-4 text-blue-600" />{title}</span>
              {institution && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-slate-400" />{institution}{profile.affiliation.department ? ` · ${profile.affiliation.department}` : ""}</span>}
            </div>
            {profile.headline && <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700 dark:text-slate-200 sm:text-[17px]">{profile.headline}</p>}
            {profile.researchInterests.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {profile.researchInterests.slice(0, 3).map((interest) => (
                  <Badge key={interest} className="border border-blue-100 bg-blue-50 px-2.5 py-1 font-medium text-blue-800 hover:bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">{interest}</Badge>
                ))}
              </div>
            )}
            {profile.verificationStatuses?.position === "VERIFIED" && <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"><BadgeCheck className="h-3.5 w-3.5" />Position verified</p>}
          </div>
          {editor("cover")}
          {editor("intro")}
        </div>

        <nav aria-label="Profile sections" className="overflow-x-auto border-t border-slate-200 px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-slate-800 sm:px-6">
          <div className="flex min-w-max items-center">
            {sectionLinks.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={(event) => scrollToSection(event, id)}
                aria-current={activeSection === id ? "location" : undefined}
                className={`border-b-2 px-3 py-3.5 text-sm font-medium transition-colors duration-150 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${activeSection === id ? "border-blue-600 text-[#0f2744] dark:text-blue-200" : "border-transparent text-slate-500 hover:border-blue-200 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"}`}
              >
                {label}
              </a>
            ))}
          </div>
        </nav>
      </header>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-12">
        <div className="min-w-0 space-y-6 lg:col-span-8">
          <ProfileSection id="about" title="About" icon={<BookOpen />} tone="light" owner={owner} editing={editingSection === "about"} onEdit={() => onEdit?.("about")} onClose={onCloseEdit}>
            {editor("about") ?? (profile.biography || profile.bio ? (
              <p className="max-w-[72ch] whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-700 dark:text-slate-300">{profile.biography || profile.bio}</p>
            ) : (
              <EmptyProfileField owner={owner} text="Tell others about your academic interests and research journey." action="Add bio" onEdit={() => onEdit?.("about")} />
            ))}
          </ProfileSection>

          <ProfileSection id="research" title="Research Interests & Expertise" icon={<GraduationCap />} tone="featured" owner={owner} editing={editingSection === "research"} onEdit={() => onEdit?.("research")} onClose={onCloseEdit}>
            {editor("research") ?? (hasResearch ? (
              <div className="grid gap-6 sm:grid-cols-2">
                <ProfileTags label="Research interests" values={[...profile.researchInterests, ...profile.researchKeywords]} tone="blue" />
                <ProfileTags label="Expertise" values={expertise} tone="neutral" />
              </div>
            ) : (
              <EmptyProfileField owner={owner} text="Add research topics to help collaborators understand your academic focus." action="Add research interests" onEdit={() => onEdit?.("research")} />
            ))}
          </ProfileSection>

          <ProfileSection id="works" title="Research & Contributions" icon={<BriefcaseBusiness />} tone="standard" owner={owner} editing={editingSection === "works"} onEdit={() => onEdit?.("works")} onClose={onCloseEdit}>
            {editor("works") ?? (profile.featuredWorks.length > 0 ? (
              <>
                <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                  <p className="text-sm text-slate-500">Selected research work</p>
                  <span className="text-xs font-medium tabular-nums text-slate-500">{profile.featuredWorks.length} featured</span>
                </div>
                <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                  {profile.featuredWorks.map((work, index) => (
                    <li key={`${work.paperId ?? work.doi ?? work.title}-${index}`} className="group flex gap-4 py-4 first:pt-3 last:pb-0">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-semibold tabular-nums text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{String(index + 1).padStart(2, "0")}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h3 className="break-words text-sm font-semibold leading-6 text-slate-900 transition-colors group-hover:text-blue-700 dark:text-slate-100 dark:group-hover:text-blue-300">{work.title || work.doi || "LumiGap paper"}</h3>
                          {work.year && <span className="text-xs tabular-nums text-slate-500">{work.year}</span>}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{work.canonical ? "Research paper · LumiGap record" : "Self-declared research work"}{work.doi ? ` · DOI ${work.doi}` : ""}</p>
                        {work.paperId && work.canonical && <Link to={`/papers/${work.paperId}`} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-300">View work <ArrowRight className="h-3 w-3" /></Link>}
                      </div>
                    </li>
                  ))}
                </ol>
                {profile.publicHandle && <Link to={`/profile/${profile.publicHandle}/contributions`} className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline dark:text-blue-300">View contribution archive <ArrowRight className="h-3.5 w-3.5" /></Link>}
              </>
            ) : (
              <EmptyProfileField owner={owner} text="Add papers, projects or contributions to showcase your research work." action="Add contribution" onEdit={() => onEdit?.("works")} />
            ))}
          </ProfileSection>

          <ProfileSection id="identity" title="Academic Identity" icon={<Link2 />} tone="standard">
            <PositionVerificationPanel profile={profile} editable={owner} onEditPosition={() => onEdit?.("affiliation")} />
            <AcademicIdentityManager profile={profile} editable={owner} />
            <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500 dark:border-slate-800">
              Scholarly profile links help people discover your work. They do not verify your academic position, affiliation, or expertise.
            </p>
          </ProfileSection>
        </div>

        <aside className="space-y-5 lg:col-span-4">
          <SidebarCard id="affiliation" title="Current Affiliation" icon={<Building2 />} action={owner ? <EditButton label="Current Affiliation" editing={editingSection === "affiliation"} onClick={() => editingSection === "affiliation" ? onCloseEdit?.() : onEdit?.("affiliation")} /> : undefined}>
            {editor("affiliation") ?? (
              institution ? (
                <div className="mt-4">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{institution}</p>
                  {profile.affiliation.department && <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">{profile.affiliation.department}</p>}
                  <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">{title}</p>
                  {profile.affiliation.startYear && <p className="mt-1 text-xs text-slate-500">{profile.affiliation.startYear} – Present</p>}
                  {profile.verificationStatuses?.affiliation === "VERIFIED" && <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"><BadgeCheck className="h-3.5 w-3.5" />Affiliation verified</p>}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-500">Current affiliation has not been added.</p>
              )
            )}
          </SidebarCard>

          <SidebarCard title="Academic Verification" icon={<ShieldCheck />} featured>
            <div className="mt-4 divide-y divide-blue-100/80 dark:divide-slate-800">
              {verificationRows(profile).map((row) => <VerificationRow key={row.label} label={row.label} status={row.status} />)}
            </div>
            {owner && (
              <Link
                to="/profile?edit=affiliation#affiliation"
                className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-blue-300"
              >
                View verification details <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </SidebarCard>

          <section id="availability" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_35px_-30px_rgba(15,39,68,0.6)] dark:border-slate-800 dark:bg-[#101923]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"><HandHeart className="h-4 w-4" /></span><h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Open to</h2></div>
              {owner && <EditButton label="Open to" editing={editingSection === "availability"} onClick={() => editingSection === "availability" ? onCloseEdit?.() : onEdit?.("availability")} />}
            </div>
            {editor("availability") ?? (showAvailability ? (
              <div className="mt-4 space-y-5">
                <AvailabilityGroup title="Research support" enabled={profile.supportAvailability.enabled} types={profile.supportAvailability.types} topics={profile.supportAvailability.preferredTopics} note={profile.supportAvailability.note} />
                <AvailabilityGroup title="Academic review" enabled={profile.reviewAvailability.enabled} types={profile.reviewAvailability.types} topics={profile.reviewAvailability.preferredTopics} note={profile.reviewAvailability.note} />
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-slate-500">Not currently available for research support or academic review.</p>
            ))}
          </section>

          {(owner || profile.publicHandle) && (
            <section id="public-link" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Public Profile</h2>
                {owner && <EditButton label="Public Profile URL" editing={editingSection === "link"} onClick={() => editingSection === "link" ? onCloseEdit?.() : onEdit?.("link")} />}
              </div>
              {editor("link") ?? (
                <>
                  <p className="mt-3 break-all text-xs leading-5 text-slate-600 dark:text-slate-300">{profile.publicHandle ? publicUrl : "Choose a short link to share in your CV and publications."}</p>
                  {profile.publicHandle && <Button type="button" variant="outline" size="sm" className="mt-3 gap-1.5 bg-white dark:bg-slate-950" onClick={() => void copyPublicUrl()}><Copy className="h-3.5 w-3.5" />{copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy link"}</Button>}
                  <span className="sr-only" aria-live="polite">{copyState === "copied" ? "Public profile URL copied" : copyState === "failed" ? "Could not copy public profile URL" : ""}</span>
                </>
              )}
            </section>
          )}

          {professionalLinks.length > 0 && (
            <SidebarCard title="Professional Links" icon={<ExternalLink />}>
              <div className="mt-3 space-y-2">
                {professionalLinks.map((identity) => {
                  const url = safeExternalUrl(identity.profileUrl);
                  return url ? <a key={`${identity.provider}-${url}`} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-lg px-2 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-blue-300"><span>GitHub</span><ExternalLink className="h-3.5 w-3.5" /></a> : null;
                })}
              </div>
            </SidebarCard>
          )}
        </aside>
      </div>

      {owner && <ProfileAvatarDialog open={avatarDialogOpen} currentAvatar={avatarSrc} onOpenChange={setAvatarDialogOpen} />}
    </main>
  );
}

function ProfileSection({ id, title, icon, tone, owner, editing, onEdit, onClose, children }: {
  id: string;
  title: string;
  icon: ReactNode;
  tone: "light" | "featured" | "standard";
  owner?: boolean;
  editing?: boolean;
  onEdit?: () => void;
  onClose?: () => void;
  children: ReactNode;
}) {
  const surfaces = {
    light: "border-y border-slate-200 px-1 py-6 dark:border-slate-800",
    featured: "rounded-[18px] border border-blue-100 bg-gradient-to-br from-white to-blue-50/45 p-5 shadow-[0_16px_40px_-34px_rgba(37,99,235,0.65)] dark:border-blue-950 dark:from-[#101923] dark:to-blue-950/20 sm:p-6",
    standard: "rounded-[18px] border border-slate-200 bg-white p-5 shadow-[0_14px_36px_-34px_rgba(15,39,68,0.8)] dark:border-slate-800 dark:bg-[#101923] sm:p-6",
  };
  return (
    <section id={id} className={`scroll-mt-24 ${surfaces[tone]}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-slate-900 dark:text-slate-100">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700 [&>svg]:h-4 [&>svg]:w-4 dark:bg-blue-950/40 dark:text-blue-300">{icon}</span>
          <h2 className="text-base font-semibold tracking-[-0.01em]">{title}</h2>
        </div>
        {owner && <EditButton label={title} editing={editing} onClick={() => editing ? onClose?.() : onEdit?.()} />}
      </div>
      {children}
    </section>
  );
}

function SidebarCard({ id, title, icon, action, featured, children }: { id?: string; title: string; icon: ReactNode; action?: ReactNode; featured?: boolean; children: ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-24 rounded-2xl border p-5 ${featured ? "border-blue-100 bg-blue-50/55 dark:border-blue-950 dark:bg-blue-950/15" : "border-slate-200 bg-white shadow-[0_12px_35px_-30px_rgba(15,39,68,0.6)] dark:border-slate-800 dark:bg-[#101923]"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-blue-700 shadow-sm [&>svg]:h-4 [&>svg]:w-4 dark:bg-slate-900 dark:text-blue-300">{icon}</span>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EditButton({ label, editing, onClick }: { label: string; editing?: boolean; onClick: () => void }) {
  return <button type="button" aria-label={`${editing ? "Close" : "Edit"} ${label}`} aria-expanded={editing} onClick={onClick} className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-blue-300 dark:hover:bg-slate-800">{!editing && <Pencil className="h-3.5 w-3.5" />}{editing ? "Close" : "Edit"}</button>;
}

function ProfileTags({ label, values, tone }: { label: string; values: string[]; tone: "blue" | "neutral" }) {
  const uniqueValues = [...new Set(values)].filter(Boolean);
  return (
    <div>
      <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</h3>
      {uniqueValues.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {uniqueValues.map((value) => <Badge key={value} variant="outline" className={`max-w-full break-words px-2.5 py-1 font-medium leading-5 ${tone === "blue" ? "border-blue-100 bg-blue-50 text-blue-800 hover:bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200" : "border-slate-200 bg-white text-slate-700 hover:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}>{value}</Badge>)}
        </div>
      ) : <p className="text-sm text-slate-400">Not added yet</p>}
    </div>
  );
}

function verificationRows(profile: VisibleProfile): Array<{ label: string; status: string }> {
  const statuses = profile.verificationStatuses;
  return [
    { label: "Identity", status: statuses?.identity ?? "NOT_SUBMITTED" },
    { label: "Email", status: statuses?.email ?? "NOT_SUBMITTED" },
    { label: "Affiliation", status: statuses?.affiliation ?? "NOT_SUBMITTED" },
    { label: "Position", status: statuses?.position ?? "NOT_SUBMITTED" },
  ];
}

function VerificationRow({ label, status }: { label: string; status: string }) {
  const isVerified = status === "VERIFIED";
  const isPending = status === "PENDING";
  const isRejected = ["REJECTED", "EXPIRED", "INVALIDATED"].includes(status);
  const Icon = isVerified ? CheckCircle2 : isPending ? Clock3 : isRejected ? XCircle : CircleMinus;
  const tone = isVerified
    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
    : isPending
      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
      : isRejected
        ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        : "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
      <Badge variant="outline" className={`gap-1 px-2 py-0.5 text-[11px] ${tone}`}><Icon className="h-3 w-3" />{verificationStatusLabel(status)}</Badge>
    </div>
  );
}

function verificationStatusLabel(value: string): string {
  return ({ NOT_SUBMITTED: "Not submitted", UNVERIFIED: "Not submitted", PENDING: "Pending", VERIFIED: "Verified", REJECTED: "Rejected", EXPIRED: "Expired", INVALIDATED: "Invalidated" } as Record<string, string>)[value] ?? value;
}

function AvailabilityGroup({ title, enabled, types, topics, note }: { title: string; enabled: boolean; types: string[]; topics: string[]; note?: string }) {
  if (!enabled) return null;
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200"><CheckCircle2 className="h-4 w-4 text-emerald-600" />{title}</p>
      {types.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1.5">{types.map((type) => <Badge key={type} variant="outline" className="border-slate-200 bg-slate-50 font-normal text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{supportLabels[type] ?? type.replaceAll("_", " ").toLowerCase()}</Badge>)}</div>}
      {topics.length > 0 && <p className="mt-2 text-xs leading-5 text-slate-500">Preferred topics: {topics.join(", ")}</p>}
      {note && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-500">{note}</p>}
    </div>
  );
}

function EmptyProfileField({ owner, text, action, onEdit }: { owner: boolean; text: string; action: string; onEdit?: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-6 text-center dark:border-slate-700 dark:bg-slate-900/40">
      <p className="mx-auto max-w-lg text-sm leading-6 text-slate-500">{text}</p>
      {owner && <button type="button" onClick={onEdit} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-blue-300">{action} <ArrowRight className="h-3.5 w-3.5" /></button>}
    </div>
  );
}
