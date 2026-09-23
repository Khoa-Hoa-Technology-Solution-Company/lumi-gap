import { lazy, Suspense, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { getLevel, type AcademicExternalIdentity, type AcademicProfile, type ExternalIdentityProvider, type PublicAcademicProfile } from "@trend/shared-types";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  BriefcaseBusiness,
  ExternalLink,
  GraduationCap,
  HandHeart,
  Link2,
  MapPin,
  Pencil,
  Copy,
  Camera,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { formatNumber } from "@/utils/format";
import { useAcademicCover } from "../hooks/use-academic-profile";
import { canShowVerifiedLecturerBadge } from "../utils/verification";
import type { EditSection } from "./academic-profile-inline-editor";

const AcademicProfileInlineEditor = lazy(() => import("./academic-profile-inline-editor")
  .then((module) => ({ default: module.AcademicProfileInlineEditor })));

type VisibleProfile = PublicAcademicProfile | AcademicProfile;

const identityOrder = ["ORCID", "GITHUB", "OPENALEX", "GOOGLE_SCHOLAR", "SEMANTIC_SCHOLAR"] as const;
const identityLabels: Record<string, string> = {
  ORCID: "ORCID iD",
  GITHUB: "GitHub",
  OPENALEX: "OpenAlex",
  GOOGLE_SCHOLAR: "Google Scholar",
  SEMANTIC_SCHOLAR: "Semantic Scholar",
};
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

function safeIdentityUrl(identity: AcademicExternalIdentity): string | undefined {
  const id = identity.externalId?.trim();
  const supplied = identity.profileUrl?.trim();
  const idAsUrl = id?.startsWith("https://") ? id : undefined;
  const generatedUrls: Partial<Record<ExternalIdentityProvider, string>> = id ? {
    ORCID: `https://orcid.org/${encodeURIComponent(id)}`,
    OPENALEX: `https://openalex.org/${encodeURIComponent(id)}`,
    SEMANTIC_SCHOLAR: `https://www.semanticscholar.org/author/${encodeURIComponent(id)}`,
  } : {};
  const generated = generatedUrls[identity.provider];
  const candidate = supplied || idAsUrl || generated;
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    const hosts: Record<string, RegExp> = {
      ORCID: /^orcid\.org$/i,
      GITHUB: /^github\.com$/i,
      OPENALEX: /^openalex\.org$/i,
      GOOGLE_SCHOLAR: /^scholar\.google\.com$/i,
      SEMANTIC_SCHOLAR: /^(www\.)?semanticscholar\.org$/i,
    };
    if (url.protocol !== "https:" || !hosts[identity.provider]?.test(url.hostname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function textOrFallback(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
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
  const { t } = useI18n();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [activeSection, setActiveSection] = useState("about");
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const authenticatedCoverSrc = useAcademicCover(profile.coverUrl);
  const owner = Boolean(editableProfile);
  const communityLevel = getLevel(profile.points);
  const isLecturer = profile.academicType === "lecturer";
  const isStudent = profile.academicType === "student";
  const institution = profile.affiliation.institutionName;
  const providerOrder: readonly string[] = isStudent
    ? ["GITHUB", "ORCID", "OPENALEX", "GOOGLE_SCHOLAR", "SEMANTIC_SCHOLAR"]
    : identityOrder;
  const orderedIdentities = [...profile.externalIdentities].sort(
    (a, b) => {
      const rank = (provider: string) => {
        const index = providerOrder.indexOf(provider);
        return index < 0 ? providerOrder.length : index;
      };
      return rank(a.provider) - rank(b.provider);
    },
  );
  const showAvailability = isLecturer && (profile.supportAvailability.enabled || profile.reviewAvailability.enabled);
  const hasResearch = profile.researchInterests.length > 0 || profile.expertiseAreas.length > 0
    || profile.skills.length > 0 || profile.researchKeywords.length > 0;
  const title = isStudent ? "Student" : profile.academicTitle || (isLecturer ? "Lecturer" : "Researcher");
  const sectionCopy = isStudent
    ? { about: "Introduce your field of study and what you want to explore.", research: "Learning and interests", interests: "Topics I'm exploring", expertise: "Developing expertise", works: "Projects and papers", affiliation: "Education", noAffiliation: "Education not listed" }
    : isLecturer
      ? { about: "Tell people about your teaching and research.", research: "Research and expertise", interests: "Research interests", expertise: "Expertise", works: "Featured work", affiliation: "Affiliation", noAffiliation: "Institution not listed" }
      : { about: "Introduce your research focus and current work.", research: "Research focus", interests: "Research interests", expertise: "Expertise", works: "Selected work", affiliation: "Affiliation", noAffiliation: "Institution not listed" };
  const sectionLinks: Array<[string, string]> = [
    ["about", "About"], ["research", "Research"], ["works", "Works"],
    ["identity", "Identity"],
  ];
  if (isLecturer) sectionLinks.push(["availability", "Availability"]);
  const coverSrc = authenticatedCoverSrc;
  const verificationLabel = {
    SELF_DECLARED: "Self declared",
    PENDING: "Pending review",
    VERIFIED: "Verified",
    REJECTED: "Rejected",
  }[profile.verificationStatus];
  const publicPath = profile.publicHandle ? `/${profile.publicHandle}` : `/academics/${profile.userId}`;
  const publicUrl = typeof window === "undefined" ? publicPath : `${window.location.origin}${publicPath}`;
  const editor = (section: EditSection) => editingSection === section && editableProfile
    ? <Suspense fallback={<div className="h-24 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />}><AcademicProfileInlineEditor key={section} section={section} profile={editableProfile} onClose={() => onCloseEdit?.()} /></Suspense>
    : null;

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActiveSection(visible[0].target.id);
    }, { rootMargin: "-100px 0px -55% 0px", threshold: 0 });
    for (const [id] of sectionLinks) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [isLecturer]);

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

  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-8">
      <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#101923]">
        <div className="relative h-36 overflow-hidden bg-[#122a3e] sm:h-44">
          {coverSrc && failedCover !== profile.coverUrl
            ? <img src={coverSrc} alt="" onError={() => setFailedCover(profile.coverUrl ?? null)} className="absolute inset-0 h-full w-full object-cover" />
            : <div aria-hidden="true" className="absolute inset-0 opacity-30" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent 0 30px, rgba(186,210,226,.16) 31px 32px), repeating-linear-gradient(90deg, transparent 0 56px, rgba(186,210,226,.10) 57px 58px)" }} />}
          {coverSrc && failedCover !== profile.coverUrl && <div aria-hidden="true" className="absolute inset-0 bg-slate-950/25" />}
          {owner && <button type="button" aria-label={profile.coverUrl ? "Change cover image" : "Add cover image"} onClick={() => onEdit?.("cover")} className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"><Camera className="h-3.5 w-3.5" />{profile.coverUrl ? "Change cover" : "Add cover"}</button>}
          <div className="absolute bottom-5 right-6 text-right text-[10px] font-semibold uppercase tracking-[0.28em] text-blue-100/70 sm:bottom-7 sm:right-9">LumiGap<br />Academic network</div>
        </div>
        <div className="relative px-5 pb-6 sm:px-8 sm:pb-8">
          <div className="-mt-12 flex flex-wrap items-end justify-between gap-4 sm:-mt-14">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-[5px] border-white bg-[#d9e4eb] text-2xl font-semibold text-[#1a3548] shadow-sm dark:border-[#101923] dark:bg-slate-700 dark:text-white sm:h-28 sm:w-28">
              {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(profile.displayName)}
            </div>
            <div className="flex flex-wrap gap-2 pb-1">
              {owner ? (
                <>
                  <Button type="button" size="sm" onClick={() => onEdit?.("intro")} className="gap-2"><Pencil className="h-3.5 w-3.5" />Edit intro</Button>
                  {profile.publicHandle
                    ? <Button asChild size="sm" variant="outline"><Link to={publicPath}>View public profile</Link></Button>
                    : <Button type="button" size="sm" variant="outline" onClick={() => { onEdit?.("link"); document.getElementById("public-link")?.scrollIntoView({ block: "center" }); }}>Set public URL</Button>}
                </>
              ) : isLecturer && canShowVerifiedLecturerBadge(profile.verificationStatus)
                ? <Button asChild size="sm" variant="outline"><Link to="/lecturers">{t("Browse verified lecturers")}</Link></Button>
                : <Button asChild size="sm" variant="outline"><Link to="/communities">{t("Explore academic communities")}</Link></Button>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-[2rem]">{profile.displayName}</h1>
            {isLecturer && canShowVerifiedLecturerBadge(profile.verificationStatus) && (
              <Badge className="gap-1.5 border border-blue-200 bg-blue-50 font-medium text-blue-800 hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200"><BadgeCheck className="h-3.5 w-3.5" />Verified Lecturer</Badge>
            )}
          </div>
          <p className="mt-1 text-base font-medium text-slate-800 dark:text-slate-200">{textOrFallback(profile.headline, title)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5"><GraduationCap className="h-4 w-4" />{title}</span>
            {institution && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{institution}</span>}
            {profile.affiliation.department && <span>{profile.affiliation.department}</span>}
          </div>
          {owner && isLecturer && profile.verificationStatus !== "VERIFIED" && (
            <p className="mt-4 max-w-2xl rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">{t("Academic type: Lecturer")} · {t("Verification:")} {t(verificationLabel)}. {t("Linked identities do not verify Lecturer status.")}</p>
          )}
          {editor("cover")}
          {editor("intro")}
        </div>
        <nav aria-label="Profile sections" className="flex flex-wrap justify-center border-t border-slate-100 px-2 dark:border-slate-800 sm:justify-start sm:px-6">
          {sectionLinks.map(([id, label]) => (
            <a key={id} href={`#${id}`} onClick={(event) => scrollToSection(event, id)} aria-current={activeSection === id ? "location" : undefined} className={`border-b-2 px-2.5 py-3 text-center text-sm font-medium transition-colors focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 sm:px-3 sm:text-left ${activeSection === id ? "border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300" : "border-transparent text-slate-600 hover:border-blue-300 hover:text-blue-700 dark:text-slate-300 dark:hover:text-blue-300"}`}>{label}</a>
          ))}
        </nav>
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-5">
          <ProfileSection id="about" title="About" icon={<BookOpen />} owner={owner} editing={editingSection === "about"} onEdit={() => onEdit?.("about")} onClose={onCloseEdit}>
            {editor("about") ?? (profile.biography || profile.bio ? (
              <p className="max-w-[70ch] whitespace-pre-wrap break-words text-sm leading-7 text-slate-700 dark:text-slate-300">{profile.biography || profile.bio}</p>
            ) : <EmptyProfileField owner={owner} text={sectionCopy.about} onEdit={() => onEdit?.("about")} />)}
          </ProfileSection>

          <ProfileSection id="research" title={sectionCopy.research} icon={<GraduationCap />} owner={owner} editing={editingSection === "research"} onEdit={() => onEdit?.("research")} onClose={onCloseEdit}>
            {editor("research") ?? (hasResearch ? (
              <div className="space-y-5">
                <ProfileTags label={sectionCopy.interests} values={profile.researchInterests} />
                <ProfileTags label={sectionCopy.expertise} values={profile.expertiseAreas} />
                <ProfileTags label="Skills" values={profile.skills} />
                <ProfileTags label="Keywords" values={profile.researchKeywords} />
              </div>
            ) : <EmptyProfileField owner={owner} text="Research topics have not been added yet." onEdit={() => onEdit?.("research")} />)}
          </ProfileSection>

          <ProfileSection id="works" title={sectionCopy.works} icon={<BriefcaseBusiness />} owner={owner} editing={editingSection === "works"} onEdit={() => onEdit?.("works")} onClose={onCloseEdit}>
            {editor("works") ?? (profile.featuredWorks.length > 0 ? (
              <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                {profile.featuredWorks.map((work, index) => (
                  <li key={`${work.paperId ?? work.doi ?? work.title}-${index}`} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">{String(index + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="break-words text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100">{work.title || work.doi || "LumiGap paper"}</h3>{work.year && <span className="text-xs tabular-nums text-slate-500">{work.year}</span>}</div>
                      <p className="mt-1 text-xs text-slate-500">{work.canonical ? "LumiGap paper" : "Self-asserted reference"}{work.doi ? ` · DOI ${work.doi}` : ""}</p>
                      {work.paperId && work.canonical && <Link to={`/papers/${work.paperId}`} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-300">View paper <ArrowRight className="h-3 w-3" /></Link>}
                    </div>
                  </li>
                ))}
              </ol>
            ) : <EmptyProfileField owner={owner} text="No featured work yet." onEdit={() => onEdit?.("works")} />)}
          </ProfileSection>

          <ProfileSection id="identity" title="Academic identity" icon={<Link2 />} owner={owner} editing={editingSection === "identity"} onEdit={() => onEdit?.("identity")} onClose={onCloseEdit}>
            {editor("identity") ?? (orderedIdentities.length > 0 ? <div className="grid gap-x-5 sm:grid-cols-2">
              {orderedIdentities.map((identity) => {
                const url = safeIdentityUrl(identity);
                return <div key={identity.provider} className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 first:pt-0 dark:border-slate-800">
                  <div className="min-w-0"><p className="text-sm font-medium text-slate-800 dark:text-slate-200">{identityLabels[identity.provider] ?? identity.provider}</p><p className="mt-0.5 text-xs text-slate-500">{identity.status === "VERIFIED" ? "Verified connection" : identity.status === "LINKED" ? "Linked" : "Added, unverified"}</p></div>
                  {url && <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${identityLabels[identity.provider] ?? identity.provider} profile`} className="rounded-md p-2 text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-300 dark:hover:bg-slate-800"><ExternalLink className="h-4 w-4" /></a>}
                </div>;
              })}
            </div> : <EmptyProfileField owner={owner} text="No academic identities added." onEdit={() => onEdit?.("identity")} />)}
            {isLecturer && editingSection !== "identity" && <p className="pt-3 text-xs leading-5 text-slate-500">External profiles and Lecturer verification are separate.</p>}
          </ProfileSection>

          {isLecturer && <ProfileSection id="availability" title="Mentoring and review" icon={<HandHeart />} owner={owner} editing={editingSection === "availability"} onEdit={() => onEdit?.("availability")} onClose={onCloseEdit}>
            {editor("availability") ?? <>
              <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div><p className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500">{t("Community activity")}</p><p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{t("Level")} {communityLevel}</p></div>
                <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
                <div><p className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500">{t("Points")}</p><p className="mt-1 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatNumber(profile.points)}</p></div>
                <p className="max-w-md text-xs leading-5 text-slate-500 sm:ml-auto">{t("Activity points show participation, not academic verification or expertise.")}</p>
              </div>
              {showAvailability ? (
                <div className="grid gap-6 sm:grid-cols-2">
                  <AvailabilityGroup title="Research support" enabled={profile.supportAvailability.enabled} types={profile.supportAvailability.types} topics={profile.supportAvailability.preferredTopics} note={profile.supportAvailability.note} />
                  <AvailabilityGroup title="Academic review" enabled={profile.reviewAvailability.enabled} types={profile.reviewAvailability.types} topics={profile.reviewAvailability.preferredTopics} note={profile.reviewAvailability.note} />
                </div>
              ) : <p className="text-sm leading-6 text-slate-500">Not currently available for research support or academic review.</p>}
            </>}
          </ProfileSection>}
        </div>

        <aside className="space-y-5">
          <section className="rounded-[18px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#101923]">
            <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{sectionCopy.affiliation}</h2>{owner && <EditButton label={sectionCopy.affiliation} editing={editingSection === "affiliation"} onClick={() => editingSection === "affiliation" ? onCloseEdit?.() : onEdit?.("affiliation")} />}</div>
            {editor("affiliation") ?? <><p className="mt-3 text-sm font-medium text-slate-800 dark:text-slate-200">{institution || sectionCopy.noAffiliation}</p>{profile.affiliation.department && <p className="mt-1 text-xs text-slate-500">{profile.affiliation.department}</p>}{!isStudent && profile.affiliation.position && <p className="mt-1 text-xs text-slate-500">{profile.affiliation.position}</p>}{owner && <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500 dark:border-slate-800">Your institutional email and verification evidence are private.</p>}</>}
            {owner && <Link to="/settings/profile" className="mt-3 inline-flex text-xs font-medium text-blue-700 hover:underline dark:text-blue-300">Account settings</Link>}
            {profile.publicHandle && <Link to={`/profile/${profile.publicHandle}/contributions`} className="mt-3 block text-xs font-medium text-blue-700 hover:underline dark:text-blue-300">Contribution archive</Link>}
          </section>
          {owner && <section id="public-link" className="scroll-mt-24 rounded-[18px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#101923]"><div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Public profile URL</h2><EditButton label="Public profile URL" editing={editingSection === "link"} onClick={() => editingSection === "link" ? onCloseEdit?.() : onEdit?.("link")} /></div>{editor("link") ?? <><p className="mt-3 break-all text-xs leading-5 text-slate-600 dark:text-slate-300">{profile.publicHandle ? publicUrl : "Choose a short link to share in your CV."}</p>{profile.publicHandle && <Button type="button" variant="outline" size="sm" className="mt-3 gap-1.5" onClick={async () => { try { await navigator.clipboard.writeText(publicUrl); setCopyState("copied"); } catch { setCopyState("failed"); } }}><Copy className="h-3.5 w-3.5" />{copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy link"}</Button>}</>}</section>}
        </aside>
      </div>
    </main>
  );
}

function ProfileSection({ id, title, icon, owner, editing, onEdit, onClose, children }: {
  id: string; title: string; icon: ReactNode; owner?: boolean; editing?: boolean;
  onEdit?: () => void; onClose?: () => void; children: ReactNode;
}) {
  return <section id={id} className="scroll-mt-24 rounded-[18px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#101923] sm:p-6"><div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-2.5 text-slate-900 dark:text-slate-100"><span className="text-blue-700 dark:text-blue-300 [&>svg]:h-4 [&>svg]:w-4">{icon}</span><h2 className="text-base font-semibold">{title}</h2></div>{owner && <EditButton label={title} editing={editing} onClick={() => editing ? onClose?.() : onEdit?.()} />}</div>{children}</section>;
}

function EditButton({ label, editing, onClick }: { label: string; editing?: boolean; onClick: () => void }) {
  return <button type="button" aria-label={`${editing ? "Close" : "Edit"} ${label}`} aria-expanded={editing} onClick={onClick} className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-300 dark:hover:bg-slate-800">{!editing && <Pencil className="h-3.5 w-3.5" />}{editing ? "Close" : "Edit"}</button>;
}

function ProfileTags({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</h3><div className="flex flex-wrap gap-2">{values.map((value) => <Badge key={value} variant="secondary" className="max-w-full break-words bg-slate-100 px-2.5 py-1 font-normal leading-5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{value}</Badge>)}</div></div>;
}

function AvailabilityGroup({ title, enabled, types, topics, note }: { title: string; enabled: boolean; types: string[]; topics: string[]; note?: string }) {
  return <div><h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3><p className={`mt-1 text-xs font-medium ${enabled ? "text-emerald-700 dark:text-emerald-300" : "text-slate-500"}`}>{enabled ? "Open to requests" : "Not currently available"}</p>{enabled && <><div className="mt-3 flex flex-wrap gap-1.5">{types.map((type) => <Badge key={type} variant="outline" className="font-normal">{supportLabels[type] ?? type.replaceAll("_", " ").toLowerCase()}</Badge>)}</div>{topics.length > 0 && <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">Preferred topics: {topics.join(", ")}</p>}{note && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600 dark:text-slate-300">{note}</p>}</>}</div>;
}

function EmptyProfileField({ owner, text, onEdit }: { owner: boolean; text: string; onEdit?: () => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 py-1"><p className="text-sm leading-6 text-slate-500">{text}</p>{owner && <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-300">Add details <ArrowRight className="h-3.5 w-3.5" /></button>}</div>;
}
