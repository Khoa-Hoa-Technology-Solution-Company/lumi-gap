import { describe, expect, it } from "vitest";
import {
  getPaperPdfPanelState,
  shouldShowReadPdfAction,
  type PaperPdfPanelInput,
} from "../paper-pdf-panel";

const basePaper: PaperPdfPanelInput["paper"] = {
  pdfPath: undefined,
  paperStatus: "not-downloaded",
  qualityTier: 1,
  downloadCost: 10,
  requestedBy: { _id: "requester" },
  uploadedBy: undefined,
};

describe("getPaperPdfPanelState", () => {
  it("hides the internal PDF panel from anonymous visitors when no PDF exists", () => {
    const state = getPaperPdfPanelState({
      paper: basePaper,
      currentUser: null,
    });

    expect(state.shouldShowPanel).toBe(false);
    expect(state.canUploadPdf).toBe(false);
  });

  it("does not show Read PDF for Awaiting PDF even when an open-access URL exists", () => {
    expect(shouldShowReadPdfAction(
      {
        ...basePaper,
        openAccessUrl: "https://example.org/open-access-paper",
      },
      false,
    )).toBe(false);
  });

  it("shows Read PDF only for an approved downloadable internal PDF", () => {
    expect(shouldShowReadPdfAction(
      {
        ...basePaper,
        pdfPath: "papers/demo.pdf",
        paperStatus: "downloaded",
      },
      true,
    )).toBe(true);
  });

  it("shows a pending approval notice without upload for requesters", () => {
    const state = getPaperPdfPanelState({
      paper: { ...basePaper, paperStatus: "pending" },
      currentUser: { id: "requester", role: "student" },
    });

    expect(state.shouldShowPanel).toBe(true);
    expect(state.mode).toBe("pending-approval");
    expect(state.canUploadPdf).toBe(false);
  });

  it("allows requester upload only after the request is ready for PDF", () => {
    const state = getPaperPdfPanelState({
      paper: { ...basePaper, paperStatus: "not-downloaded" },
      currentUser: { id: "requester", role: "student" },
    });

    expect(state.shouldShowPanel).toBe(true);
    expect(state.mode).toBe("upload");
    expect(state.canUploadPdf).toBe(true);
  });

  it("shows the same Read PDF state for a direct external Open Access PDF", () => {
    const paper = {
      ...basePaper,
      primaryProvider: "openalex" as const,
      paperStatus: "pending" as const,
      openAccessUrl: "https://repository.example.org/papers/study.pdf",
    };
    const state = getPaperPdfPanelState({ paper, currentUser: null });

    expect(state.isExternalPdf).toBe(true);
    expect(state.mode).toBe("available");
    expect(state.canDownloadPdf).toBe(true);
    expect(state.canUploadPdf).toBe(false);
    expect(shouldShowReadPdfAction(paper, state.canDownloadPdf)).toBe(true);
  });

  it("allows admins to upload a missing PDF for imported papers without a workflow status", () => {
    const state = getPaperPdfPanelState({
      paper: {
        ...basePaper,
        paperStatus: undefined,
        requestedBy: undefined,
      },
      currentUser: { id: "admin", role: "admin" },
    });

    expect(state.shouldShowPanel).toBe(true);
    expect(state.mode).toBe("upload");
    expect(state.canUploadPdf).toBe(true);
  });

  it("allows signed-in users to contribute a PDF for imported papers", () => {
    const state = getPaperPdfPanelState({
      paper: {
        ...basePaper,
        paperStatus: undefined,
        requestedBy: undefined,
      },
      currentUser: { id: "contributor", role: "student" },
    });

    expect(state.shouldShowPanel).toBe(true);
    expect(state.mode).toBe("upload");
    expect(state.canUploadPdf).toBe(true);
  });

  it("allows a user to contribute to a pending OpenAlex record", () => {
    const state = getPaperPdfPanelState({
      paper: {
        ...basePaper,
        primaryProvider: "openalex",
        paperStatus: "pending",
        requestedBy: { _id: "original-requester" },
      },
      currentUser: { id: "contributor", role: "student" },
    });

    expect(state.canUploadPdf).toBe(true);
    expect(state.mode).toBe("upload");
  });

  it("does not let another user upload to an unapproved user submission", () => {
    const state = getPaperPdfPanelState({
      paper: {
        ...basePaper,
        primaryProvider: "user",
        paperStatus: "pending",
        requestedBy: { _id: "requester" },
      },
      currentUser: { id: "other-user", role: "student" },
    });

    expect(state.canUploadPdf).toBe(false);
  });

  it("does not require requester acceptance for an imported PDF awaiting admin approval", () => {
    const state = getPaperPdfPanelState({
      paper: {
        ...basePaper,
        pdfPath: "papers/contributed.pdf",
        paperStatus: "pending",
        requestedBy: undefined,
        uploadedBy: { _id: "contributor" },
      },
      currentUser: { id: "contributor", role: "student" },
    });

    expect(state.mode).toBe("pending-approval");
    expect(state.isWaitingRequesterAccept).toBe(false);
    expect(state.canAcceptPdf).toBe(false);
  });

  it("hides a contributed PDF from public readers until admin approval", () => {
    const state = getPaperPdfPanelState({
      paper: {
        ...basePaper,
        pdfPath: "papers/contributed.pdf",
        paperStatus: "pending",
        requestedBy: undefined,
        uploadedBy: { _id: "contributor" },
      },
      currentUser: null,
    });

    expect(state.shouldShowPanel).toBe(false);
    expect(state.canDownloadPdf).toBe(false);
  });

  it("allows signed-in users to contribute a PDF when a paper is awaiting PDF", () => {
    const state = getPaperPdfPanelState({
      paper: basePaper,
      currentUser: { id: "contributor", role: "student" },
    });

    expect(state.mode).toBe("upload");
    expect(state.canUploadPdf).toBe(true);
  });

  it("does not allow admins to upload a PDF for rejected papers", () => {
    const state = getPaperPdfPanelState({
      paper: { ...basePaper, paperStatus: "rejected" },
      currentUser: { id: "admin", role: "admin" },
    });

    expect(state.canUploadPdf).toBe(false);
  });

  it("shows available PDF download state for accessible uploaded files", () => {
    const state = getPaperPdfPanelState({
      paper: { ...basePaper, pdfPath: "papers/demo.pdf", paperStatus: "downloaded" },
      currentUser: { id: "reader", role: "student" },
    });

    expect(state.shouldShowPanel).toBe(true);
    expect(state.mode).toBe("available");
    expect(state.canDownloadPdf).toBe(true);
  });

  it("does not allow public internal PDF download before download cost is set", () => {
    const state = getPaperPdfPanelState({
      paper: {
        ...basePaper,
        pdfPath: "papers/demo.pdf",
        paperStatus: "downloaded",
        downloadCost: undefined,
      },
      currentUser: { id: "reader", role: "student" },
    });

    expect(state.shouldShowPanel).toBe(true);
    expect(state.mode).toBe("available");
    expect(state.canDownloadPdf).toBe(false);
  });

  it("lets requester accept or reject a pending uploaded PDF", () => {
    const state = getPaperPdfPanelState({
      paper: {
        ...basePaper,
        pdfPath: "papers/demo.pdf",
        paperStatus: "pending-requester-acceptance",
        uploadedBy: { _id: "uploader" },
      },
      currentUser: { id: "requester", role: "student" },
    });

    expect(state.shouldShowPanel).toBe(true);
    expect(state.mode).toBe("awaiting-acceptance");
    expect(state.canAcceptPdf).toBe(true);
  });
});
