import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  Camera,
  ExternalLink,
  Link2,
  Pencil,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import type { User } from "@trend/shared-types";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { useUpdateProfile } from "@/features/auth";
import {
  useAcademicProfile,
  useUpdateAcademicProfile as useUpdateAcademicProfileDetails,
} from "@/features/academic-profile/hooks/use-academic-profile";
import { ProfileAvatarDialog } from "@/features/academic-profile/components/profile-avatar-dialog";
import { normalizeAcademicExpertise } from "@/features/academic-profile/utils/expertise-normalization";
import { getLevel } from "@/utils/level";
import { formatNumber } from "@/utils";
import {
  SettingsFormField,
  SettingsPageHeader,
  SettingsRow,
  SettingsSaveBar,
  SettingsSection,
} from "./settings-primitives";

function roleLabelKey(role?: string | null) {
  if (role === "LECTURER") return "Lecturer";
  if (role === "RESEARCHER") return "Researcher";
  if (role === "STUDENT") return "Student";
  return "Member";
}

export function SettingsProfileSection({ user, isAdmin }: { user: User; isAdmin: boolean }) {
  const { t } = useI18n();
  const hasAcademicProfile = Boolean(user.primaryPosition || user.onboarding?.completed);
  const academicQuery = useAcademicProfile(hasAcademicProfile);
  const profile = academicQuery.data;
  const updateBasic = useUpdateProfile();
  const updateAcademic = useUpdateAcademicProfileDetails();

  const [avatarOpen, setAvatarOpen] = useState(false);
  const [fullName, setFullName] = useState(user.fullName || "");
  const [biography, setBiography] = useState("");
  const [institution, setInstitution] = useState(user.institution || "");
  const [department, setDepartment] = useState("");
  const [programName, setProgramName] = useState("");
  const [positionTitle, setPositionTitle] = useState("");

  useEffect(() => {
    setFullName(profile?.displayName || user.fullName || "");
    setBiography(profile?.biography || "");
    setInstitution(profile?.affiliation.institutionName || user.institution || "");
    setDepartment(profile?.affiliation.department || "");
    setProgramName(profile?.affiliation.programName || "");
    setPositionTitle(profile?.positionTitle || "");
  }, [profile, user.fullName, user.institution]);

  const initialFullName = profile?.displayName || user.fullName || "";
  const initialBio = profile?.biography || "";
  const initialInst = profile?.affiliation.institutionName || user.institution || "";
  const initialDept = profile?.affiliation.department || "";
  const initialProg = profile?.affiliation.programName || "";
  const initialPos = profile?.positionTitle || "";

  const dirty =
    fullName.trim() !== initialFullName.trim() ||
    biography.trim() !== initialBio.trim() ||
    institution.trim() !== initialInst.trim() ||
    department.trim() !== initialDept.trim() ||
    programName.trim() !== initialProg.trim() ||
    positionTitle.trim() !== initialPos.trim();

  const saving = updateBasic.isPending || updateAcademic.isPending;

  const academicRole = profile?.academicRole ?? user.academicRole ?? "STUDENT";
  const isStudent = academicRole === "STUDENT";
  const isLecturer = academicRole === "LECTURER";
  const publicPreviewPath = profile?.publicHandle
    ? `/u/${profile.publicHandle}?preview=public`
    : profile?.userId
      ? `/academics/${profile.userId}?preview=public`
      : "/profile";

  const expertise = useMemo(
    () =>
      profile
        ? normalizeAcademicExpertise({
            expertiseAreas: profile.expertiseAreas,
            researchSpecializations: profile.researchSpecializations,
            researchInterests: profile.researchInterests,
            skills: profile.skills,
            researchMethods: profile.researchMethods,
          })
        : { researchAreas: [], skills: [], researchMethods: [] },
    [profile],
  );
  const allExpertise = useMemo(
    () => [...expertise.researchAreas, ...expertise.skills, ...expertise.researchMethods],
    [expertise],
  );

  const initials = (fullName || user.email || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const positionVerified =
    isLecturer &&
    profile?.academicRoleVerificationStatus === "VERIFIED" &&
    profile?.verificationStatuses?.position === "VERIFIED";

  const identifiers = useMemo(() => {
    if (!profile) return [];
    const primary = profile.academicIdentityLinks.map((link) => ({
      id: link.id,
      provider: link.label || link.provider.replaceAll("_", " "),
      url: link.profileUrl,
      verified: false,
      connected: link.verificationStatus === "PROVIDER_CONNECTED",
    }));
    const legacy = profile.externalIdentities
      .filter((ext) => !profile.academicIdentityLinks.some((link) => link.provider === ext.provider))
      .map((ext) => ({
        id: `${ext.provider}-${ext.externalId}`,
        provider: ext.provider.replaceAll("_", " "),
        url: ext.profileUrl ?? "",
        verified: Boolean(ext.verifiedAt),
        connected: false,
      }));
    return [...primary, ...legacy];
  }, [profile]);

  function handleDiscard() {
    setFullName(initialFullName);
    setBiography(initialBio);
    setInstitution(initialInst);
    setDepartment(initialDept);
    setProgramName(initialProg);
    setPositionTitle(initialPos);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!fullName.trim()) {
      toast.error(t("Full name is required."));
      return;
    }
    try {
      await updateBasic.mutateAsync({
        fullName: fullName.trim(),
        institution: institution.trim(),
      });
      if (profile) {
        await updateAcademic.mutateAsync({
          displayName: fullName.trim(),
          biography: biography.trim(),
          ...(!isStudent ? { positionTitle: positionTitle.trim() } : {}),
          affiliation: {
            ...(profile.affiliation.institutionId &&
            institution.trim().toLocaleLowerCase() === initialInst.trim().toLocaleLowerCase()
              ? { institutionId: profile.affiliation.institutionId }
              : {}),
            institutionName: institution.trim(),
            department: department.trim(),
            ...(isStudent ? { programName: programName.trim() } : {}),
          },
        });
      }
      toast.success(t("settings.profile.saved"));
    } catch (error) {
      const msg = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg || t("Unable to update profile."));
    }
  }

  const projectsCount = profile?.portfolio?.projects?.length ?? 0;
  const contributionsCount = profile?.portfolio?.contributions?.length ?? 0;
  const currentLevel = getLevel(user.points ?? 0);

  return (
    <div>
      <SettingsPageHeader
        title={t("settings.profile.title")}
        description={t("settings.profile.subtitle")}
        action={
          <>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to={publicPreviewPath}>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <span>{t("settings.profile.viewPublic")}</span>
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/profile">{t("settings.profile.openFullProfile")}</Link>
            </Button>
          </>
        }
      />

      {/* Clean Academic Identity Header (No oversized level bar or gamification cards) */}
      <div className="flex flex-col gap-4 border-b border-border/75 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-primary/10 text-lg font-semibold text-primary">
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt={fullName} className="h-full w-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-foreground">{fullName || user.email}</h2>
              <Badge variant="secondary" className="font-medium">
                {t(roleLabelKey(academicRole))}
              </Badge>
              {positionVerified ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                >
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t("settings.profile.verified")}</span>
                </Badge>
              ) : null}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {[positionTitle || profile?.academicTitle, institution].filter(Boolean).join(" · ") || user.email}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setAvatarOpen(true)} className="gap-1.5">
            <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t("settings.profile.changeAvatar")}</span>
          </Button>
        </div>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)}>
        {/* 1. Personal Information */}
        <SettingsSection
          title={t("settings.profile.personalTitle")}
          description={t("settings.profile.personalDesc")}
        >
          <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
            <SettingsFormField id="settings-fullname" label={t("settings.profile.fullName")} required>
              <Input
                id="settings-fullname"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={120}
                className="h-10"
              />
            </SettingsFormField>

            <SettingsFormField
              id="settings-email"
              label={t("settings.profile.email")}
              helper={t("settings.profile.emailHint")}
            >
              <Input
                id="settings-email"
                value={user.email}
                disabled
                className="h-10 bg-muted/50 text-muted-foreground"
              />
            </SettingsFormField>

            {profile ? (
              <SettingsFormField
                id="settings-biography"
                label={t("settings.profile.biography")}
                className="sm:col-span-2"
              >
                <textarea
                  id="settings-biography"
                  rows={3}
                  maxLength={2000}
                  value={biography}
                  onChange={(e) => setBiography(e.target.value)}
                  placeholder={t("settings.profile.biographyPlaceholder")}
                  className="flex w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm leading-6 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </SettingsFormField>
            ) : null}
          </div>
        </SettingsSection>

        {/* 2. Role-Aware Academic Information */}
        <SettingsSection
          title={t("settings.profile.academicTitle")}
          description={t("settings.profile.academicDesc")}
          action={
            isLecturer ? (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/settings/verification/lecturer">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t("settings.profile.verifyLecturer")}</span>
                </Link>
              </Button>
            ) : undefined
          }
        >
          <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
            <SettingsFormField id="settings-institution" label={t("settings.profile.university")}>
              <Input
                id="settings-institution"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="e.g. FPT University"
                className="h-10"
              />
            </SettingsFormField>

            {isStudent ? (
              <SettingsFormField id="settings-program" label={t("settings.profile.program")}>
                <Input
                  id="settings-program"
                  value={programName}
                  onChange={(e) => setProgramName(e.target.value)}
                  placeholder="e.g. Software Engineering"
                  className="h-10"
                />
              </SettingsFormField>
            ) : (
              <SettingsFormField id="settings-department" label={t("settings.profile.department")}>
                <Input
                  id="settings-department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Faculty of Information Technology"
                  className="h-10"
                />
              </SettingsFormField>
            )}

            {!isStudent ? (
              <SettingsFormField id="settings-position" label={t("settings.profile.positionTitle")}>
                <Input
                  id="settings-position"
                  value={positionTitle}
                  onChange={(e) => setPositionTitle(e.target.value)}
                  placeholder="e.g. Lecturer / Associate Professor"
                  className="h-10"
                />
              </SettingsFormField>
            ) : null}

            <SettingsFormField id="settings-role" label={t("settings.profile.roleLabel")}>
              <div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-sm text-foreground">
                <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span>{t(roleLabelKey(academicRole))}</span>
              </div>
            </SettingsFormField>
          </div>

          {profile ? (
            <div className="mt-6 max-w-2xl rounded-xl border border-border/80 bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{t("settings.profile.expertiseLabel")}</p>
                  <p className="text-xs text-muted-foreground">{t("settings.profile.expertiseHint")}</p>
                </div>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to="/profile?edit=research">
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t("settings.profile.manageExpertise")}</span>
                  </Link>
                </Button>
              </div>
              {allExpertise.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {allExpertise.slice(0, 10).map((item) => (
                    <span
                      key={item}
                      className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground"
                    >
                      {t(item)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 max-w-2xl">
            <SettingsSaveBar
              dirty={dirty}
              saving={saving}
              onDiscard={handleDiscard}
              saveLabel={t("settings.profile.save")}
              savingLabel={t("settings.profile.saving")}
            />
          </div>
        </SettingsSection>
      </form>

      {/* 3. Academic Identifiers (Self-declared vs Verified) */}
      <SettingsSection
        title={t("settings.profile.identifiersTitle")}
        description={t("settings.profile.identifiersDesc")}
        action={
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/profile?edit=links">
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("settings.profile.manageIdentifiers")}</span>
            </Link>
          </Button>
        }
      >
        {identifiers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("settings.profile.noIdentifiers")}</p>
        ) : (
          <div className="divide-y divide-border/60 rounded-xl border border-border/80">
            {identifiers.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{item.provider}</p>
                    <Badge
                      variant="outline"
                      className={
                        item.verified
                          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "text-muted-foreground"
                      }
                    >
                      {t(item.verified ? "settings.profile.verified" : item.connected ? "Connected" : "settings.profile.selfDeclared")}
                    </Badge>
                  </div>
                  {item.url ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.url}</p>
                  ) : null}
                </div>
                {item.url ? (
                  <Button asChild variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                      <span>{t("View")}</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      {/* 4. Research Contributions Summary */}
      <SettingsSection
        title={t("settings.profile.contributionsTitle")}
        description={t("settings.profile.contributionsDesc")}
      >
        <SettingsRow
          label={t("settings.profile.projectsCount", { count: projectsCount })}
          description={t("settings.profile.creditsCount", { count: contributionsCount })}
        >
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/profile?tab=portfolio">
              <BriefcaseBusiness className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("settings.profile.viewPortfolio")}</span>
            </Link>
          </Button>
        </SettingsRow>

        {!isAdmin ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <UserIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {t("settings.profile.communityNote", {
                level: currentLevel,
                points: formatNumber(user.points ?? 0),
              })}
            </span>
          </p>
        ) : null}
      </SettingsSection>

      <ProfileAvatarDialog
        open={avatarOpen}
        currentAvatar={profile?.avatarUrl}
        onOpenChange={setAvatarOpen}
      />
    </div>
  );
}
