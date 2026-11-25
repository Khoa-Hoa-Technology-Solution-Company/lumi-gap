import { MentorInvitationBrief } from "./mentor-invitation-brief";
import { useState } from "react";
import type {
  DossierCompetencyItem,
  DossierFeaturedWork,
  DossierProvenance,
  DossierStudentProfile,
  InvitationDossier,
  MentorPermission,
  MentorProjectPreview,
  MentorshipAttachment,
  MentorshipPerson,
  ResearchSupportType,
} from "@trend/shared-types";
import {
  BadgeCheck,
  BookOpen,
  Calendar,
  ChevronDown,
  ExternalLink,
  Info,
  Lock,
  MessageSquareQuote,
  Paperclip,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { InvitationAttachments } from "./mentorship-invitation-content";
import {
  MentorInvitationAccessNotice,
  MentorInvitationSender,
  MentorPreviewContent,
} from "./mentor-preview";

const STAGE_LABELS: Record<string, string> = {
  PLANNING: "Đang lập kế hoạch",
  ACTIVE: "Đang triển khai",
  ON_HOLD: "Tạm dừng",
  COMPLETED: "Đã hoàn thành",
  ARCHIVED: "Đã lưu trữ",
};

export const SUPPORT_TYPE_LABELS: Record<ResearchSupportType | string, string> = {
  RESEARCH_DIRECTION: "Định hướng đề tài & câu hỏi nghiên cứu",
  LITERATURE_REVIEW: "Tổng quan tài liệu & khoảng trống nghiên cứu",
  RESEARCH_GAP_VALIDATION: "Thẩm định khoảng trống nghiên cứu",
  RESEARCH_METHODOLOGY: "Thiết kế phương pháp nghiên cứu",
  EXPERIMENT_DESIGN: "Thiết kế thực nghiệm / khảo sát",
  DATA_ANALYSIS: "Phân tích & diễn giải dữ liệu",
  ACADEMIC_WRITING: "Viết & phản biện bản thảo học thuật",
  SOFTWARE_TECHNICAL_GUIDANCE: "Hướng dẫn kỹ thuật & công cụ nghiên cứu",
};

const PROVENANCE_LABELS: Record<DossierProvenance, string> = {
  SELF_DECLARED: "Tự khai báo",
  VERIFIED_AFFILIATION: "Đã xác minh đơn vị",
  VERIFIED_IDENTITY: "Định danh đã xác minh",
  PUBLIC_WORK: "Công bố công khai",
  PROJECT_METADATA: "Thông tin dự án",
};

const PRESET_LABELS: Record<string, string> = {
  ADVISOR: "Cố vấn đồng hành (Advisor)",
  REVIEWER: "Phản biện học thuật (Reviewer)",
  OBSERVER: "Quan sát viên (Observer)",
};

const PERMISSION_LABELS: Record<MentorPermission, string> = {
  OVERVIEW_VIEW: "Xem tổng quan & kế hoạch được chia sẻ",
  PAPERS_VIEW: "Xem tài liệu nghiên cứu được chia sẻ",
  PAPERS_COMMENT: "Nhận xét tài liệu nghiên cứu",
  PAPERS_SUGGEST: "Đề xuất tài liệu bổ sung",
  GAPS_VIEW: "Xem phân tích khoảng trống nghiên cứu",
  GAPS_COMMENT: "Nhận xét khoảng trống nghiên cứu",
  GAPS_RECOMMEND: "Đề xuất hướng nghiên cứu mới",
  TASKS_VIEW: "Xem công việc & cột mốc được chia sẻ",
  TASKS_SUGGEST: "Đề xuất điều chỉnh kế hoạch công việc",
  MANUSCRIPTS_VIEW: "Xem bản thảo được chia sẻ",
  MANUSCRIPTS_COMMENT: "Góp ý trên bản thảo",
  MANUSCRIPTS_SUGGEST: "Đề xuất chỉnh sửa bản thảo",
  MANUSCRIPTS_REVIEW: "Đánh giá phản biện bản thảo",
  SUBMISSIONS_VIEW: "Xem hồ sơ nộp bài được chia sẻ",
  CONTRIBUTIONS_VIEW: "Xem đóng góp & phân công nhóm",
  MENTOR_CHAT: "Trao đổi trong kênh cố vấn",
};

function ProvenanceBadge({ provenance }: { provenance: DossierProvenance }) {
  const verified = provenance === "VERIFIED_AFFILIATION" || provenance === "VERIFIED_IDENTITY";
  const publicRecord = provenance === "PUBLIC_WORK";
  return (
    <span
      className={
        verified
          ? "inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
          : publicRecord
            ? "inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300"
            : "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
      }
    >
      {verified && <BadgeCheck size={12} aria-hidden="true" />}
      {PROVENANCE_LABELS[provenance] ?? provenance}
    </span>
  );
}

function ExpandableText({
  text,
  emptyLabel,
  threshold = 320,
}: {
  text?: string;
  emptyLabel?: string;
  threshold?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const content = text?.trim() || "";
  if (!content) {
    return emptyLabel ? <p className="text-sm italic text-muted-foreground">{emptyLabel}</p> : null;
  }
  const long = content.length > threshold;
  const shown = !long || expanded ? content : `${content.slice(0, threshold).trimEnd()}…`;
  return (
    <div className="space-y-1.5">
      <p className="max-w-prose whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">{shown}</p>
      {long && (
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setExpanded(v => !v)}>
          {expanded ? "Thu gọn" : "Xem đầy đủ"}
          <ChevronDown size={14} className={`ml-1 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

function RepresentativeCard({ profile }: { profile: DossierStudentProfile }) {
  const initials = profile.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("") || "SV";
  const metaParts = [
    profile.academicRole === "STUDENT" ? "Sinh viên nghiên cứu" : profile.academicRole,
    profile.positionTitle,
    profile.institutionName,
    profile.department,
    profile.programName,
    profile.academicYearLabel,
  ].filter(Boolean);

  return (
    <div className="rounded-lg border bg-card p-3.5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-xs font-semibold text-foreground"
            aria-hidden="true"
          >
            {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{profile.fullName}</p>
              {profile.affiliationVerified && <ProvenanceBadge provenance="VERIFIED_AFFILIATION" />}
            </div>
            {metaParts.length > 0 && (
              <p className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">{metaParts.join(" · ")}</p>
            )}
            {profile.headline && (
              <p className="text-xs font-medium text-foreground/90 [overflow-wrap:anywhere]">{profile.headline}</p>
            )}
          </div>
        </div>
        {!profile.redacted && profile.provenance[0] && !profile.affiliationVerified && (
          <ProvenanceBadge provenance={profile.provenance[0]} />
        )}
      </div>

      {profile.redacted ? (
        <p className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
          <Lock size={13} aria-hidden="true" />
          Hồ sơ học thuật chi tiết đang được giới hạn theo cài đặt quyền riêng tư của thành viên.
        </p>
      ) : (
        <div className="space-y-2.5">
          {profile.shortBio && <ExpandableText text={profile.shortBio} threshold={220} />}
          {profile.researchInterests.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Hướng quan tâm:</span>
              {profile.researchInterests.map(item => (
                <span key={item} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                  {item}
                </span>
              ))}
            </div>
          )}
          {profile.skills.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Kỹ năng:</span>
              {profile.skills.map(skill => (
                <span key={skill} className="rounded-md border px-2 py-0.5 text-xs">
                  {skill}
                </span>
              ))}
            </div>
          )}
          {profile.publicLinks.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {profile.publicLinks.map(link => (
                <a
                  key={`${link.provider}-${link.profileUrl}`}
                  href={link.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs font-medium text-primary hover:bg-muted/50"
                >
                  {link.label || link.provider}
                  {link.verified && <BadgeCheck size={12} className="text-emerald-600" aria-hidden="true" />}
                  <ExternalLink size={11} aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CompetencyGroup({ title, items }: { title: string; items: DossierCompetencyItem[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map(item => (
          <span key={`${item.category}-${item.name}`} className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs">
            <span className="font-medium text-foreground">{item.name}</span>
            <span className="text-[10px] text-muted-foreground">· {PROVENANCE_LABELS[item.provenance]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function FeaturedWorkRow({ work }: { work: DossierFeaturedWork }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-xs">
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium text-foreground [overflow-wrap:anywhere]">{work.title}</p>
        <p className="text-muted-foreground">
          {[work.kind, work.year, work.doi ? `DOI: ${work.doi}` : undefined].filter(Boolean).join(" · ")}
        </p>
      </div>
      <ProvenanceBadge provenance={work.provenance} />
    </li>
  );
}

export function InvitationDossierView({
  dossier,
  legacyProject,
  legacySender,
  legacyMessage,
  attachments,
  showAccessNotice = true,
}: {
  dossier?: InvitationDossier;
  legacyProject?: MentorProjectPreview;
  legacySender?: MentorshipPerson;
  legacyMessage?: string;
  attachments?: MentorshipAttachment[];
  showAccessNotice?: boolean;
}) {
  const { t, language } = useI18n();

  if (dossier?.presentation === "BRIEF") return <div className="space-y-5"><MentorInvitationBrief context={{ title: dossier.project.title, researchField: dossier.project.researchField, researchAreas: dossier.project.researchAreas, senderDisplayName: dossier.senderDisplayName ?? "", memberCount: dossier.team.teamMemberCount }} summary={dossier.project.abstract} message={dossier.whyThisLecturer.message} support={dossier.expectations.supportAreas} />{showAccessNotice && <div className="rounded-md border bg-muted/30 p-3 text-xs leading-5"><p className="font-medium">{t("supervisor.ifAccepted")}</p><p className="mt-1 text-muted-foreground">{t("supervisor.acceptedAccess")}</p></div>}</div>;

  if (!dossier) {
    return (
      <div className="min-w-0 space-y-3.5 text-sm [overflow-wrap:anywhere]">
        {legacyProject && <MentorPreviewContent preview={legacyProject} />}
        {legacySender && <MentorInvitationSender sender={legacySender} />}
        {legacyMessage && (
          <div className="rounded-xl border border-primary/25 border-l-4 border-l-primary bg-primary/[0.04] p-3.5 space-y-1.5">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <MessageSquareQuote size={13} aria-hidden="true" />
              <span>{t("Guidance requested")}</span>
            </p>
            <p className="whitespace-pre-wrap text-sm font-medium leading-6 text-foreground">{legacyMessage}</p>
          </div>
        )}
        {attachments?.length ? (
          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Paperclip size={13} aria-hidden="true" />
              <span>{language === "vi" ? `Tệp đính kèm (${attachments.length})` : `Attachments (${attachments.length})`}</span>
            </p>
            <InvitationAttachments attachments={attachments} />
          </div>
        ) : null}
        {showAccessNotice && <MentorInvitationAccessNotice />}
      </div>
    );
  }

  const { project, team, competencies, whyThisLecturer, expectations, accessPreview } = dossier;
  const hasCompetencies = Boolean(
    competencies.researchMethods.length ||
    competencies.technicalSkills.length ||
    competencies.researchTools.length ||
    competencies.experienceHighlights.length ||
    competencies.teamStrengthsNote,
  );
  const hasExpectations = Boolean(
    expectations.supportAreas.length ||
    expectations.expectedPeriod ||
    expectations.meetingFrequency ||
    expectations.expectedMilestone ||
    expectations.preferredChannel ||
    expectations.proposedNote,
  );

  return (
    <div className="min-w-0 space-y-5 text-sm [overflow-wrap:anywhere]">
      {/* Section A — Research Project Information */}
      <section className="space-y-3 rounded-lg border bg-card/60 p-4" aria-label="Thông tin đề tài nghiên cứu">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <BookOpen size={14} aria-hidden="true" />
            <span>A. Thông tin đề tài nghiên cứu</span>
          </div>
          <span className="rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium">
            {STAGE_LABELS[project.stage] ?? project.stage}
          </span>
        </div>

        <div className="space-y-1.5">
          <h3 className="text-base font-semibold leading-snug text-foreground">{project.title}</h3>
          {(project.researchField || project.researchAreas.length > 0) && (
            <p className="text-xs text-muted-foreground">
              {[project.researchField, ...project.researchAreas.filter(a => a !== project.researchField)].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Tóm tắt nghiên cứu được phép chia sẻ</p>
          <ExpandableText
            text={project.abstract}
            emptyLabel="Nhóm chưa cập nhật tóm tắt giới thiệu được phép chia sẻ."
          />
        </div>

        {project.primaryObjective && (
          <div className="space-y-1 rounded-md bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground">Mục tiêu nghiên cứu chính (được nhóm phê duyệt chia sẻ)</p>
            <p className="whitespace-pre-wrap text-sm leading-6">{project.primaryObjective}</p>
          </div>
        )}

        {project.keywords.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Từ khóa:</span>
            {project.keywords.map(kw => (
              <span key={kw} className="rounded-full border bg-background px-2.5 py-0.5 text-xs">
                {kw}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Section B — Student Research Team */}
      <section className="space-y-3 rounded-lg border bg-card/60 p-4" aria-label="Nhóm nghiên cứu">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Users size={14} aria-hidden="true" />
            <span>B. Nhóm nghiên cứu</span>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
            Quy mô: {team.teamMemberCount} thành viên (gồm trưởng nhóm)
          </span>
        </div>

        {team.representative ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Đại diện nhóm gửi lời mời</p>
            <RepresentativeCard profile={team.representative} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Thông tin đại diện nhóm hiện được giới hạn.</p>
        )}

        {team.sharedMembers.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Thành viên đồng ý chia sẻ hồ sơ ({team.sharedMembers.length})</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {team.sharedMembers.map(member => (
                <div key={member._id} className="rounded-md border bg-background p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{member.fullName}</p>
                    <ProvenanceBadge provenance={member.provenance} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[member.institutionName, member.programName, member.academicYearLabel].filter(Boolean).join(" · ") || "Thành viên nghiên cứu"}
                  </p>
                  {member.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {member.skills.map(skill => (
                        <span key={skill} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{skill}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {team.privacyRedactedCount > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock size={12} aria-hidden="true" />
            {team.privacyRedactedCount} thành viên khác không hiển thị thông tin cá nhân để bảo vệ quyền riêng tư.
          </p>
        )}
      </section>

      {/* Section C — Team Competencies & Experience */}
      <section className="space-y-3 rounded-lg border bg-card/60 p-4" aria-label="Năng lực và kinh nghiệm của nhóm">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          C. Năng lực và kinh nghiệm của nhóm
        </div>

        {hasCompetencies ? (
          <div className="space-y-3">
            <CompetencyGroup title="Phương pháp nghiên cứu" items={competencies.researchMethods} />
            <CompetencyGroup title="Kỹ năng chuyên môn & kỹ thuật" items={competencies.technicalSkills} />
            <CompetencyGroup title="Công cụ & nền tảng" items={competencies.researchTools} />
            {competencies.experienceHighlights.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Công bố / sản phẩm tiêu biểu của đại diện nhóm</p>
                <ul className="space-y-1.5">
                  {competencies.experienceHighlights.map(work => (
                    <FeaturedWorkRow key={work.id} work={work} />
                  ))}
                </ul>
              </div>
            )}
            {competencies.teamStrengthsNote && (
              <div className="rounded-md bg-muted/40 p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Ghi chú kinh nghiệm nghiên cứu</p>
                <p className="whitespace-pre-wrap text-sm leading-6">{competencies.teamStrengthsNote}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Nhóm chưa kê khai thêm phương pháp hoặc kỹ năng chi tiết trong hồ sơ này.</p>
        )}

        <p className="flex items-start gap-1.5 rounded-md bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
          <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{competencies.integrityNotice}</span>
        </p>
      </section>

      {/* Section D — Why This Lecturer? */}
      <section className="space-y-2.5 rounded-lg border border-primary/20 bg-primary/[0.03] p-4" aria-label="Lý do mời Thầy/Cô hướng dẫn">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">
          D. Vì sao nhóm muốn được Thầy/Cô hướng dẫn?
        </div>
        {whyThisLecturer.lecturerName && (
          <p className="text-xs text-muted-foreground">
            Lời nhắn gửi riêng tới <span className="font-medium text-foreground">{whyThisLecturer.lecturerName}</span>
            {whyThisLecturer.lecturerInstitution ? ` (${whyThisLecturer.lecturerInstitution})` : ""}
          </p>
        )}
        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
          {whyThisLecturer.message || "Chưa có lời nhắn cá nhân hóa."}
        </p>
      </section>

      {dossier.additionalMessage && <section className="space-y-2 rounded-lg border p-4"><h3 className="text-sm font-semibold">Lời nhắn bổ sung</h3><ExpandableText text={dossier.additionalMessage} /></section>}
      {/* Section E — Mentorship Expectations */}
      <section className="space-y-3 rounded-lg border bg-card/60 p-4" aria-label="Nhu cầu và kỳ vọng hướng dẫn">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Calendar size={14} aria-hidden="true" />
            <span>E. Nhu cầu và kỳ vọng hướng dẫn</span>
          </div>
          <span className="text-[11px] text-muted-foreground">Kỳ vọng đề xuất (có thể trao đổi lại)</span>
        </div>

        {hasExpectations ? (
          <div className="space-y-3">
            {expectations.supportAreas.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Nội dung mong muốn được hỗ trợ</p>
                <div className="flex flex-wrap gap-1.5">
                  {expectations.supportAreas.map(area => (
                    <span key={area} className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      {SUPPORT_TYPE_LABELS[area] ?? area}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {expectations.expectedPeriod && (
                <div className="rounded-md border bg-background p-2.5">
                  <dt className="text-[11px] text-muted-foreground">Thời gian dự kiến</dt>
                  <dd className="mt-0.5 text-xs font-medium">{expectations.expectedPeriod}</dd>
                </div>
              )}
              {expectations.meetingFrequency && (
                <div className="rounded-md border bg-background p-2.5">
                  <dt className="text-[11px] text-muted-foreground">Tần suất trao đổi dự kiến</dt>
                  <dd className="mt-0.5 text-xs font-medium">{expectations.meetingFrequency}</dd>
                </div>
              )}
              {expectations.expectedMilestone && (
                <div className="rounded-md border bg-background p-2.5">
                  <dt className="text-[11px] text-muted-foreground">Cột mốc kỳ vọng</dt>
                  <dd className="mt-0.5 text-xs font-medium">{expectations.expectedMilestone}</dd>
                </div>
              )}
              {expectations.preferredChannel && (
                <div className="rounded-md border bg-background p-2.5">
                  <dt className="text-[11px] text-muted-foreground">Hình thức trao đổi ưu tiên</dt>
                  <dd className="mt-0.5 text-xs font-medium">{expectations.preferredChannel}</dd>
                </div>
              )}
            </dl>

            {expectations.proposedNote && (
              <div className="rounded-md bg-muted/40 p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Nhu cầu chi tiết</p>
                <p className="whitespace-pre-wrap text-sm leading-6">{expectations.proposedNote}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Nhóm chưa ghi rõ kỳ vọng thời gian/lịch họp; hai bên có thể trao đổi sau khi kết nối.</p>
        )}
      </section>

      {/* Attachments */}
      {Boolean(attachments?.length) && (
        <section className="space-y-2 rounded-lg border bg-card/60 p-4" aria-label="Tệp đính kèm lời mời">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tệp đính kèm được chia sẻ riêng với lời mời này
          </p>
          <InvitationAttachments attachments={attachments!} />
        </section>
      )}

      {/* Section F — Proposed Role & Access Permissions */}
      {showAccessNotice && <section className="space-y-3 rounded-lg border bg-muted/30 p-4" aria-label="Vai trò và quyền truy cập đề xuất">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ShieldCheck size={14} className="text-primary" aria-hidden="true" />
            <span>F. Vai trò và quyền truy cập đề xuất</span>
          </div>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {accessPreview.mentorRole === "UNASSIGNED" ? "Cố vấn (chưa phân vai)" : accessPreview.mentorRole === "SECONDARY" ? "Cố vấn phụ (Secondary)" : "Cố vấn chính (Primary)"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
          <div className="rounded-md border bg-background p-2.5">
            <p className="text-muted-foreground">Gói quyền đề xuất</p>
            <p className="mt-0.5 font-medium text-foreground">
              {PRESET_LABELS[accessPreview.preset] ?? accessPreview.preset} · {accessPreview.permissionCount} quyền
            </p>
          </div>
          <div className="rounded-md border bg-background p-2.5">
            <p className="text-muted-foreground">Hạn phản hồi / truy cập</p>
            <p className="mt-0.5 font-medium text-foreground">
              {accessPreview.expiresAt
                ? `Hết hạn truy cập: ${new Date(accessPreview.expiresAt).toLocaleDateString("vi-VN")}`
                : "Truy cập duy trì đến khi một trong hai bên kết thúc"}
            </p>
          </div>
        </div>

        {accessPreview.permissions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Quyền được cấp nếu Thầy/Cô chấp nhận:</p>
            <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 text-xs">
              {accessPreview.permissions.map(perm => (
                <li key={perm} className="flex items-center gap-1.5 text-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" aria-hidden="true" />
                  <span>{PERMISSION_LABELS[perm] ?? perm}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Tài nguyên dự kiến chia sẻ:</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {accessPreview.sharedResourceSummary.map((line, i) => (
              <li key={i}>• {line}</li>
            ))}
          </ul>
        </div>

        <div className="space-y-1 rounded-md border bg-background/80 p-3 text-xs leading-5 text-muted-foreground">
          <p className="font-medium text-foreground">Phân tách trước và sau khi chấp nhận</p>
          <p>{accessPreview.beforeAcceptNotice}</p>
          <p>{accessPreview.afterAcceptNotice}</p>
        </div>
      </section>}
    </div>
  );
}
