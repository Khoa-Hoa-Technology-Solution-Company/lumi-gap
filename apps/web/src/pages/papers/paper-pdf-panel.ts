type UserRole = "student" | "lecturer" | "researcher" | "admin";

type PaperStatus =
  | "pending"
  | "not-downloaded"
  | "downloaded"
  | "rejected"
  | "pending-requester-acceptance";

export interface PaperPdfPanelInput {
  paper: {
    primaryProvider?: "openalex" | "semanticscholar" | "crossref" | "arxiv" | "user";
    pdfPath?: string;
    openAccessUrl?: string;
    paperStatus?: PaperStatus;
    qualityTier?: number;
    downloadCost?: number | null;
    requestedBy?: { _id: string };
    uploadedBy?: { _id: string };
  };
  currentUser?: { id: string; role?: UserRole } | null;
}

export type PaperPdfPanelMode =
  | "hidden"
  | "pending-approval"
  | "upload"
  | "available"
  | "awaiting-acceptance";

export interface PaperPdfPanelState {
  mode: PaperPdfPanelMode;
  shouldShowPanel: boolean;
  isRequester: boolean;
  isUploader: boolean;
  isOwner: boolean;
  isWaitingRequesterAccept: boolean;
  isPrivateDownload: boolean;
  canAcceptPdf: boolean;
  canDownloadPdf: boolean;
  canUploadPdf: boolean;
  externalPdfUrl?: string;
  isExternalPdf: boolean;
}

/** Only treat URLs that clearly identify a PDF as directly readable. */
export function getExternalPdfUrl(
  paper: { pdfPath?: string; openAccessUrl?: string },
): string | undefined {
  if (paper.pdfPath || !paper.openAccessUrl) return undefined;
  try {
    const url = new URL(paper.openAccessUrl);
    if (!/^https?:$/.test(url.protocol)) return undefined;
    const path = decodeURIComponent(url.pathname);
    const isPdfPath = /(?:\.pdf|\/pdf)$/i.test(path);
    const isPdfQuery = /^(?:pdf|1|true)$/i.test(
      url.searchParams.get("format") ?? url.searchParams.get("download") ?? "",
    );
    return isPdfPath || isPdfQuery ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The primary "Read PDF" action is reserved for an approved internal PDF.
 * An OpenAlex/open-access URL must not make a metadata-only "Awaiting PDF"
 * record look as if the platform already stores its PDF.
 */
export function shouldShowReadPdfAction(
  paper: { pdfPath?: string; paperStatus?: PaperStatus; openAccessUrl?: string },
  canDownloadPdf: boolean,
): boolean {
  const externalPdfUrl = getExternalPdfUrl(paper);
  return Boolean(
    externalPdfUrl ||
      (
        paper.pdfPath &&
        paper.paperStatus === "downloaded" &&
        canDownloadPdf
      ),
  );
}

export function getPaperPdfPanelState({
  paper,
  currentUser,
}: PaperPdfPanelInput): PaperPdfPanelState {
  const isAdmin = currentUser?.role === "admin";
  const isRequester = Boolean(currentUser && paper.requestedBy?._id === currentUser.id);
  const isUploader = Boolean(currentUser && paper.uploadedBy?._id === currentUser.id);
  const isOwner = isRequester || isUploader;
  const isImportedPaper = paper.primaryProvider
    ? paper.primaryProvider !== "user"
    : !paper.requestedBy;
  const externalPdfUrl = getExternalPdfUrl(paper);
  const isExternalPdf = Boolean(externalPdfUrl);
  const hasPdf = Boolean(paper.pdfPath);
  const hasReadablePdf = hasPdf || isExternalPdf;
  const isPdfAvailable = (hasPdf && paper.paperStatus === "downloaded") || isExternalPdf;
  const isWaitingRequesterAccept =
    paper.paperStatus === "pending-requester-acceptance" ||
    (
      paper.paperStatus === "pending" &&
      hasPdf &&
      Boolean(paper.requestedBy) &&
      paper.uploadedBy?._id !== paper.requestedBy?._id
    );
  const isWaitingAdminApproval = paper.paperStatus === "pending" && !isWaitingRequesterAccept;

  const canAcceptPdf = Boolean(currentUser && isRequester && isWaitingRequesterAccept && hasPdf);
  const isPrivateDownload = Boolean(isAdmin || isRequester || isUploader);
  const canPublicDownload = Boolean(
    isPdfAvailable &&
      paper.qualityTier !== 0 &&
      paper.downloadCost !== null &&
      paper.downloadCost !== undefined,
  );
  const canDownloadPdf = Boolean(isExternalPdf || (hasPdf && (isPrivateDownload || canPublicDownload)));
  const canUploadPdf = Boolean(
    currentUser &&
      !hasReadablePdf &&
      paper.paperStatus !== "rejected" &&
      (
        isAdmin ||
        paper.paperStatus === "not-downloaded" ||
        (
          isImportedPaper &&
          (
            paper.paperStatus === undefined ||
            paper.paperStatus === "pending"
          )
        )
      ),
  );
  const shouldShowPendingApproval = Boolean(
    currentUser &&
      isWaitingAdminApproval &&
      (isAdmin || isRequester),
  );

  let mode: PaperPdfPanelMode = "hidden";
  if (canUploadPdf) mode = "upload";
  else if (isExternalPdf) mode = "available";
  else if (canAcceptPdf || (isWaitingRequesterAccept && isPrivateDownload)) mode = "awaiting-acceptance";
  else if (isWaitingAdminApproval && (isPrivateDownload || !hasPdf)) mode = "pending-approval";
  else if (isPdfAvailable) mode = "available";
  else if (shouldShowPendingApproval) mode = "pending-approval";

  return {
    mode,
    shouldShowPanel: mode !== "hidden",
    isRequester,
    isUploader,
    isOwner,
    isWaitingRequesterAccept,
    isPrivateDownload,
    canAcceptPdf,
    canDownloadPdf,
    canUploadPdf,
    externalPdfUrl,
    isExternalPdf,
  };
}
