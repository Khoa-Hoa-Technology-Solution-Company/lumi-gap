import { useState } from "react";
import type {
  DossierExpectations,
  InvitationDossierInput,
  MentorDiscoverySettings,
  ResearchSupportType,
} from "@trend/shared-types";
import { BadgeCheck, Check, ChevronDown, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const SUPPORT_AREA_OPTIONS: Array<{ value: ResearchSupportType; label: string; primary?: boolean }> = [
  { value: "RESEARCH_DIRECTION", label: "Định hướng đề tài", primary: true },
  { value: "LITERATURE_REVIEW", label: "Đánh giá tài liệu và research gap", primary: true },
  { value: "RESEARCH_METHODOLOGY", label: "Phương pháp nghiên cứu", primary: true },
  { value: "ACADEMIC_WRITING", label: "Hướng dẫn viết và review paper", primary: true },
  { value: "RESEARCH_GAP_VALIDATION", label: "Thẩm định khoảng trống" },
  { value: "EXPERIMENT_DESIGN", label: "Thiết kế thực nghiệm" },
  { value: "DATA_ANALYSIS", label: "Phân tích dữ liệu" },
  { value: "SOFTWARE_TECHNICAL_GUIDANCE", label: "Kỹ thuật & công cụ" },
];

export function SupportAreasChecklist({
  selected,
  onToggle,
  disabled,
  labels,
  moreLabel,
  groupLabel,
}: {
  selected: string[];
  onToggle: (area: string) => void;
  disabled?: boolean;
  labels?: Partial<Record<ResearchSupportType, string>>;
  moreLabel?: string;
  groupLabel?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const primaryOptions = SUPPORT_AREA_OPTIONS.filter(opt => opt.primary);
  const extraOptions = SUPPORT_AREA_OPTIONS.filter(opt => !opt.primary);
  const visible = showAll || extraOptions.some(opt => selected.includes(opt.value))
    ? SUPPORT_AREA_OPTIONS
    : primaryOptions;

  return (
    <div className="space-y-2">
      <div className="space-y-1.5" role="group" aria-label={groupLabel ?? "Loại hỗ trợ mong muốn"}>
        {visible.map(opt => {
          const active = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onToggle(opt.value)}
              className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                active
                  ? "border-foreground/30 bg-muted/40 font-medium text-foreground"
                  : "border-border/70 bg-background text-foreground/90 hover:bg-muted/30"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-muted-foreground/45 bg-background"
                }`}
              >
                {active && <Check size={11} strokeWidth={3} />}
              </span>
              <span>{labels?.[opt.value] ?? opt.label}</span>
            </button>
          );
        })}
      </div>
      {extraOptions.length > 0 && !showAll && (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setShowAll(true)}
        >
          <span>{moreLabel ?? "Thêm lựa chọn hỗ trợ khác"} ({extraOptions.length})</span>
          <ChevronDown size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export interface DossierDraftState {
  approvedObjective: string;
  keywordsText: string;
  shareRepresentativeProfile: boolean;
  shareRepresentativeLinks: boolean;
  shareRepresentativeWorks: boolean;
  shareTeamOverview: boolean;
  shareCompetencies: boolean;
  researchMethodsText: string;
  researchToolsText: string;
  teamOverviewNote: string;
  supportAreas: string[];
  expectedPeriod: string;
  meetingFrequency: string;
  expectedMilestone: string;
  preferredChannel: string;
  proposedNote: string;
}

export function createInitialDossierState(settings?: MentorDiscoverySettings): DossierDraftState {
  return {
    approvedObjective: "",
    keywordsText: settings?.dossierDefaults?.keywords.join(", ") ?? "",
    shareRepresentativeProfile: true,
    shareRepresentativeLinks: true,
    shareRepresentativeWorks: true,
    shareTeamOverview: false,
    shareCompetencies: true,
    researchMethodsText: "",
    researchToolsText: "",
    teamOverviewNote: "",
    supportAreas: [],
    expectedPeriod: "",
    meetingFrequency: "",
    expectedMilestone: "",
    preferredChannel: "",
    proposedNote: settings?.mentoringNeeds ?? "",
  };
}

function splitCommaTags(raw: string, max = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

export function toInvitationDossierInput(state: DossierDraftState): InvitationDossierInput {
  const expectations: DossierExpectations = {
    supportAreas: state.supportAreas,
    ...(state.expectedPeriod.trim() ? { expectedPeriod: state.expectedPeriod.trim() } : {}),
    ...(state.meetingFrequency.trim() ? { meetingFrequency: state.meetingFrequency.trim() } : {}),
    ...(state.expectedMilestone.trim() ? { expectedMilestone: state.expectedMilestone.trim() } : {}),
    ...(state.preferredChannel.trim() ? { preferredChannel: state.preferredChannel.trim() } : {}),
    ...(state.proposedNote.trim() ? { proposedNote: state.proposedNote.trim() } : {}),
  };

  return {
    ...(state.approvedObjective.trim() ? { approvedObjective: state.approvedObjective.trim() } : {}),
    keywords: splitCommaTags(state.keywordsText, 12),
    shareRepresentativeProfile: state.shareRepresentativeProfile,
    shareRepresentativeLinks: state.shareRepresentativeLinks,
    shareRepresentativeWorks: state.shareRepresentativeWorks,
    shareTeamOverview: state.shareTeamOverview,
    shareCompetencies: state.shareCompetencies,
    ...(state.teamOverviewNote.trim() ? { teamOverviewNote: state.teamOverviewNote.trim() } : {}),
    researchMethods: splitCommaTags(state.researchMethodsText, 12),
    researchTools: splitCommaTags(state.researchToolsText, 12),
    expectations,
  };
}

export function InvitationDossierForm({
  state,
  onChange,
  settings,
  disabled,
  onEditProjectBrief,
  hideSupportAreas = false,
}: {
  state: DossierDraftState;
  onChange: (updater: (prev: DossierDraftState) => DossierDraftState) => void;
  settings?: MentorDiscoverySettings;
  disabled?: boolean;
  onEditProjectBrief: () => void;
  hideSupportAreas?: boolean;
}) {
  const [showAdvancedCompetencies, setShowAdvancedCompetencies] = useState(false);
  const rep = settings?.dossierDefaults?.representative;
  const shareableMembers = settings?.dossierDefaults?.shareableMemberCount ?? 0;

  const toggleSupportArea = (area: string) => {
    onChange(prev => ({
      ...prev,
      supportAreas: prev.supportAreas.includes(area)
        ? prev.supportAreas.filter(x => x !== area)
        : [...prev.supportAreas, area],
    }));
  };

  return (
    <div className="space-y-4 text-sm">
      {/* Project Brief & Approved Objective */}
      <section className="space-y-2.5 rounded-lg border bg-card/50 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            1. Thông tin đề tài được chia sẻ
          </p>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onEditProjectBrief}>
            Chỉnh sửa giới thiệu đề tài
          </Button>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Mục tiêu nghiên cứu chính muốn chia sẻ (tùy chọn — không tự sao chép ghi chú nội bộ)
          </span>
          <textarea
            aria-label="Mục tiêu nghiên cứu chính"
            className="min-h-16 w-full rounded-md border bg-background p-2.5 text-sm leading-5"
            value={state.approvedObjective}
            maxLength={500}
            disabled={disabled}
            placeholder="Ví dụ: Đề xuất và đánh giá phương pháp giảm nhiễu cho mô hình ngôn ngữ lớn trong bài toán..."
            onChange={e => onChange(prev => ({ ...prev, approvedObjective: e.target.value }))}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Từ khóa đề tài (phân cách bằng dấu phẩy)</span>
          <Input
            aria-label="Từ khóa đề tài"
            value={state.keywordsText}
            maxLength={300}
            disabled={disabled}
            placeholder="Ví dụ: LLM Evaluation, NLP, Systematic Review"
            onChange={e => onChange(prev => ({ ...prev, keywordsText: e.target.value }))}
          />
        </label>
      </section>

      {/* Representative & Team Sharing */}
      <section className="space-y-2.5 rounded-lg border bg-card/50 p-3.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          2. Hồ sơ học thuật & Quy mô nhóm
        </p>

        {rep && (
          <div className="rounded-md border bg-background p-2.5 text-xs space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-foreground">{rep.fullName}</span>
              {rep.affiliationVerified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  <BadgeCheck size={12} aria-hidden="true" />
                  Đã xác minh đơn vị
                </span>
              )}
              {rep.redacted && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Lock size={12} aria-hidden="true" /> Hồ sơ đang đặt riêng tư
                </span>
              )}
            </div>
            {(rep.institutionName || rep.programName || rep.academicYearLabel) && (
              <p className="text-muted-foreground">
                {[rep.institutionName, rep.programName, rep.academicYearLabel].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2 text-xs">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={state.shareRepresentativeProfile}
              disabled={disabled}
              onChange={e => onChange(prev => ({ ...prev, shareRepresentativeProfile: e.target.checked }))}
            />
            <span>Chia sẻ hồ sơ học thuật đại diện (trường, ngành, hướng nghiên cứu, kỹ năng công khai)</span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={state.shareRepresentativeLinks}
              disabled={disabled || !state.shareRepresentativeProfile}
              onChange={e => onChange(prev => ({ ...prev, shareRepresentativeLinks: e.target.checked }))}
            />
            <span>Chia sẻ liên kết học thuật công khai (ORCID, Scholar, Portfolio nếu có)</span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={state.shareRepresentativeWorks}
              disabled={disabled || !state.shareRepresentativeProfile}
              onChange={e => onChange(prev => ({ ...prev, shareRepresentativeWorks: e.target.checked }))}
            />
            <span>Chia sẻ công bố / sản phẩm nghiên cứu tiêu biểu từ hồ sơ</span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={state.shareTeamOverview}
              disabled={disabled}
              onChange={e => onChange(prev => ({ ...prev, shareTeamOverview: e.target.checked }))}
            />
            <span>
              Hiển thị thông tin tóm tắt của thành viên đồng ý công khai hồ sơ (khả dụng: {shareableMembers} thành viên; email/SĐT/mã SV luôn bị ẩn)
            </span>
          </label>
        </div>
      </section>

      {/* Competencies */}
      <section className="space-y-2.5 rounded-lg border bg-card/50 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            3. Năng lực, phương pháp & kinh nghiệm nhóm
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary"
            onClick={() => setShowAdvancedCompetencies(v => !v)}
          >
            {showAdvancedCompetencies ? "Thu gọn" : "Bổ sung phương pháp / công cụ"}
            <ChevronDown size={13} className={showAdvancedCompetencies ? "rotate-180 transition-transform" : "transition-transform"} aria-hidden="true" />
          </button>
        </div>

        <label className="flex items-start gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={state.shareCompetencies}
            disabled={disabled}
            onChange={e => onChange(prev => ({ ...prev, shareCompetencies: e.target.checked }))}
          />
          <span>Hiển thị kỹ năng và năng lực tự khai báo của nhóm kèm nhãn nguồn dữ liệu rõ ràng</span>
        </label>

        {showAdvancedCompetencies && state.shareCompetencies && (
          <div className="space-y-2.5 pt-1">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Phương pháp nghiên cứu (phân cách bằng dấu phẩy)</span>
              <Input
                value={state.researchMethodsText}
                maxLength={300}
                disabled={disabled}
                placeholder="Ví dụ: Systematic Literature Review, Thực nghiệm A/B"
                onChange={e => onChange(prev => ({ ...prev, researchMethodsText: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Công cụ & kỹ thuật sử dụng</span>
              <Input
                value={state.researchToolsText}
                maxLength={300}
                disabled={disabled}
                placeholder="Ví dụ: Python, PyTorch, LaTeX, SPSS"
                onChange={e => onChange(prev => ({ ...prev, researchToolsText: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Ghi chú thêm về kinh nghiệm liên quan của nhóm</span>
              <textarea
                className="min-h-16 w-full rounded-md border bg-background p-2.5 text-sm leading-5"
                value={state.teamOverviewNote}
                maxLength={400}
                disabled={disabled}
                placeholder="Tóm tắt ngắn gọn các đồ án hoặc kết quả sơ bộ nhóm đã thực hiện..."
                onChange={e => onChange(prev => ({ ...prev, teamOverviewNote: e.target.value }))}
              />
            </label>
          </div>
        )}
      </section>

      {/* Expectations */}
      <section className="space-y-3 rounded-lg border bg-card/50 p-3.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {hideSupportAreas ? "Kỳ vọng lịch trình đồng hành (tùy chọn)" : "4. Nhu cầu và kỳ vọng hướng dẫn (đề xuất, có thể trao đổi lại)"}
        </p>
        {!hideSupportAreas && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Nội dung mong muốn hỗ trợ">
            {SUPPORT_AREA_OPTIONS.map(opt => {
              const active = state.supportAreas.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  disabled={disabled}
                  onClick={() => toggleSupportArea(opt.value)}
                  className={
                    active
                      ? "rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                      : "rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Thời gian đồng hành dự kiến</span>
            <Input
              value={state.expectedPeriod}
              maxLength={120}
              disabled={disabled}
              placeholder="Ví dụ: 1 học kỳ (09/2026 – 12/2026)"
              onChange={e => onChange(prev => ({ ...prev, expectedPeriod: e.target.value }))}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Tần suất trao đổi mong muốn</span>
            <Input
              value={state.meetingFrequency}
              maxLength={120}
              disabled={disabled}
              placeholder="Ví dụ: 2 tuần / lần (30–45 phút)"
              onChange={e => onChange(prev => ({ ...prev, meetingFrequency: e.target.value }))}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Cột mốc mục tiêu</span>
            <Input
              value={state.expectedMilestone}
              maxLength={200}
              disabled={disabled}
              placeholder="Ví dụ: Hoàn thành bài báo hội nghị / khóa luận"
              onChange={e => onChange(prev => ({ ...prev, expectedMilestone: e.target.value }))}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Hình thức liên hệ ưu tiên</span>
            <Input
              value={state.preferredChannel}
              maxLength={120}
              disabled={disabled}
              placeholder="Ví dụ: Online qua Google Meet hoặc tại văn phòng"
              onChange={e => onChange(prev => ({ ...prev, preferredChannel: e.target.value }))}
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Ghi chú thêm về nhu cầu hỗ trợ</span>
          <textarea
            className="min-h-14 w-full rounded-md border bg-background p-2.5 text-sm leading-5"
            value={state.proposedNote}
            maxLength={500}
            disabled={disabled}
            placeholder="Ví dụ: Nhóm đang cần góp ý về tiêu chí chọn bài và thiết kế thử nghiệm..."
            onChange={e => onChange(prev => ({ ...prev, proposedNote: e.target.value }))}
          />
        </label>
      </section>
    </div>
  );
}
