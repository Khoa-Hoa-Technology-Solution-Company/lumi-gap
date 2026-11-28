import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdateAcademicProfileDetailsRequest, AcademicVerificationDecision } from "@trend/shared-types";
import { useAuthStore } from "@/stores/auth-store";
import { isLecturerWorkspaceEligible } from "@/features/auth/utils/lecturer-eligibility";
import { academicProfileApi } from "../api/academic-profile.api";

export function useAcademicProfile(enabled = true) {
  return useQuery({ queryKey: ["academic-profile", "me"], queryFn: academicProfileApi.mine, enabled });
}

export function useUpdateAcademicProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAcademicProfileDetailsRequest) => academicProfileApi.update(input),
    onSuccess: (profile) => {
      queryClient.setQueryData(["academic-profile", "me"], profile);
      queryClient.invalidateQueries({ queryKey: ["academic-profile", "institutional-email"] });
      queryClient.invalidateQueries({ queryKey: ["academic-profile", "public", profile.userId] });
      queryClient.invalidateQueries({ queryKey: ["academic-profile", "handle"] });
      queryClient.invalidateQueries({ queryKey: ["academic-profiles", "lecturers"] });
      queryClient.invalidateQueries({ queryKey: ["academic-support"] });
      queryClient.invalidateQueries({ queryKey: ["mentor-workspace"] });
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
    },
    onError: (_error, input) => {
      if (input.displayName !== undefined) queryClient.invalidateQueries({ queryKey: ["academic-profile", "me"] });
    },
  });
}

export function useAcademicIdentityLinks(enabled = true) {
  return useQuery({
    queryKey: ["academic-profile", "academic-identities"],
    queryFn: academicProfileApi.listAcademicIdentities,
    enabled,
  });
}

function refreshAcademicIdentityQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["academic-profile", "academic-identities"] });
  queryClient.invalidateQueries({ queryKey: ["academic-profile", "orcid"] });
  queryClient.invalidateQueries({ queryKey: ["academic-profile", "me"] });
  queryClient.invalidateQueries({ queryKey: ["academic-profile", "public"] });
  queryClient.invalidateQueries({ queryKey: ["academic-profile", "handle"] });
}

export function useOrcidConnectionStatus(enabled = true) {
  return useQuery({
    queryKey: ["academic-profile", "orcid"],
    queryFn: ({ signal }) => academicProfileApi.orcidStatus(signal),
    enabled,
  });
}

export function useStartOrcidConnection() {
  return useMutation({
    mutationFn: (returnTo?: string) => academicProfileApi.startOrcidConnection(returnTo),
  });
}

export function useCompleteOrcidConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: academicProfileApi.completeOrcidConnection,
    onSuccess: () => refreshAcademicIdentityQueries(queryClient),
  });
}

export function useDisconnectOrcid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: academicProfileApi.disconnectOrcid,
    onSuccess: () => refreshAcademicIdentityQueries(queryClient),
  });
}

export function useCreateAcademicIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: academicProfileApi.createAcademicIdentity,
    onSuccess: () => refreshAcademicIdentityQueries(queryClient),
  });
}

export function useUpdateAcademicIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ identityId, input }: { identityId: string; input: Parameters<typeof academicProfileApi.updateAcademicIdentity>[1] }) => academicProfileApi.updateAcademicIdentity(identityId, input),
    onSuccess: () => refreshAcademicIdentityQueries(queryClient),
  });
}

export function useDeleteAcademicIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (identityId: string) => academicProfileApi.deleteAcademicIdentity(identityId),
    onSuccess: () => refreshAcademicIdentityQueries(queryClient),
  });
}

export function useRequestAcademicVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: academicProfileApi.requestVerification,
    onSuccess: (profile) => {
      queryClient.setQueryData(["academic-profile", "me"], profile);
      queryClient.invalidateQueries({ queryKey: ["academic-profile", "public", profile.userId] });
      queryClient.invalidateQueries({ queryKey: ["academic-profile", "handle"] });
    },
    onError: (error) => {
      if ((error as { response?: { status?: number } }).response?.status === 409) queryClient.invalidateQueries({ queryKey: ["academic-profile", "me"] });
    },
  });
}
export function useSubmitLecturerVerification() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: Parameters<typeof academicProfileApi.submitLecturerVerification>[0]) => academicProfileApi.submitLecturerVerification(input), onSuccess: () => {
    void queryClient.invalidateQueries({ queryKey: ["academic-profile", "me"] });
    void queryClient.invalidateQueries({ queryKey: ["academic-profile", "verification-status"] });
  }, onError: error => {
    if ((error as { response?: { status?: number } }).response?.status === 409) void queryClient.invalidateQueries({ queryKey: ["academic-profile", "me"] });
  } });
}
export function useAcademicVerificationStatus(enabled = true) {
  return useQuery({ queryKey: ["academic-profile", "verification-status"], queryFn: () => academicProfileApi.verificationStatus(), enabled, refetchInterval: 30000 });
}
export function useLecturerVerificationTracking(requestId?: string, page = 1) {
  const queryClient = useQueryClient();
  const authUser = useAuthStore((state) => state.user);
  const query = useQuery({
    queryKey: ["academic-profile", "verification-status", requestId ?? "current", page],
    queryFn: () => academicProfileApi.lecturerTracking(requestId, page),
    staleTime: 10000,
    refetchOnWindowFocus: "always",
    refetchOnMount: "always",
    refetchInterval: 60000,
  });

  // Immediately synchronize authoritative user & capability caches when verification status
  // transitions to VERIFIED or loses eligibility so Lecturer Workspace activates/deactivates without re-login.
  const lecturerStatus = query.data?.lecturer?.status;
  const allowsWorkspace = Boolean(query.data?.lecturer?.allowedActions?.includes("WORKSPACE"));
  useEffect(() => {
    if (!lecturerStatus || !authUser) return;
    const trackingVerified = lecturerStatus === "VERIFIED" && allowsWorkspace;
    if (trackingVerified !== isLecturerWorkspaceEligible(authUser)) {
      void queryClient.invalidateQueries({ queryKey: ["current-user"] });
      void queryClient.invalidateQueries({ queryKey: ["academic-profile", "me"] });
    }
  }, [lecturerStatus, allowsWorkspace, authUser, queryClient]);

  return query;
}

export function useAcademicVerificationEvidenceFile() {
  return useMutation({ mutationFn: academicProfileApi.verificationEvidenceFile });
}

export function useInstitutionalEmailStatus(enabled = true) {
  return useQuery({
    queryKey: ["academic-profile", "institutional-email"],
    queryFn: academicProfileApi.institutionalEmailStatus,
    enabled,
  });
}

export function useRequestInstitutionalEmailChallenge() {
  return useMutation({ mutationFn: academicProfileApi.requestInstitutionalEmailChallenge });
}

export function useVerifyInstitutionalEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: string | { code: string; email: string }) => typeof input === "string" ? academicProfileApi.verifyInstitutionalEmail(input) : academicProfileApi.verifyInstitutionalEmail(input.code, input.email),
    onSuccess: (status) => {
      queryClient.setQueryData(["academic-profile", "institutional-email"], status);
      queryClient.invalidateQueries({ queryKey: ["academic-profile", "me"] });
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
    },
  });
}

export function usePublicAcademicProfile(userId: string, preview?: "public") {
  return useQuery({
    queryKey: ["academic-profile", "public", userId, preview ?? "default"],
    queryFn: () => academicProfileApi.publicProfile(userId, preview ? { preview } : undefined),
    enabled: Boolean(userId),
  });
}

export function usePublicAcademicProfileByHandle(handle: string, preview?: "public") {
  return useQuery({
    queryKey: ["academic-profile", "handle", handle, preview ?? "default"],
    queryFn: () => academicProfileApi.publicProfileByHandle(handle, preview ? { preview } : undefined),
    enabled: Boolean(handle),
  });
}

export function useSetPublicHandle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (handle: string) => academicProfileApi.setPublicHandle(handle),
    onSuccess: (profile) => {
      queryClient.setQueryData(["academic-profile", "me"], profile);
      queryClient.invalidateQueries({ queryKey: ["academic-profile", "handle"] });
      queryClient.invalidateQueries({ queryKey: ["academic-profile", "public", profile.userId] });
      queryClient.invalidateQueries({ queryKey: ["academic-profiles", "lecturers"] });
    },
  });
}

function refreshCoverProfile(queryClient: ReturnType<typeof useQueryClient>, profile: Awaited<ReturnType<typeof academicProfileApi.mine>>) {
  queryClient.setQueryData(["academic-profile", "me"], profile);
  queryClient.invalidateQueries({ queryKey: ["academic-profile", "public", profile.userId] });
  queryClient.invalidateQueries({ queryKey: ["academic-profile", "handle"] });
}

export function useUploadAcademicAvatar() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (file: File) => academicProfileApi.uploadAvatar(file), onSuccess: (profile) => refreshCoverProfile(queryClient, profile) });
}

export function useRemoveAcademicAvatar() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: academicProfileApi.removeAvatar, onSuccess: (profile) => refreshCoverProfile(queryClient, profile) });
}

export function useUploadAcademicCover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => academicProfileApi.uploadCover(file),
    onSuccess: (profile) => refreshCoverProfile(queryClient, profile),
  });
}

export function useRemoveAcademicCover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: academicProfileApi.removeCover,
    onSuccess: (profile) => refreshCoverProfile(queryClient, profile),
  });
}

function useAcademicMedia(mediaUrl?: string) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    setObjectUrl(null);
    if (!mediaUrl) return undefined;

    academicProfileApi.media(mediaUrl).then((blob) => {
      createdUrl = URL.createObjectURL(blob);
      if (active) setObjectUrl(createdUrl);
      else URL.revokeObjectURL(createdUrl);
    }).catch(() => {
      if (active) setObjectUrl(null);
    });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [mediaUrl]);

  return objectUrl;
}

export function useAcademicCover(coverUrl?: string) { return useAcademicMedia(coverUrl); }
export function useAcademicAvatar(avatarUrl?: string) {
  const isManaged = avatarUrl?.startsWith("/academic-profiles/");
  const managed = useAcademicMedia(isManaged ? avatarUrl : undefined);
  return isManaged ? managed : avatarUrl ?? null;
}

export function useLecturers(filters: Parameters<typeof academicProfileApi.lecturers>[0] = {}) {
  return useQuery({
    queryKey: ["academic-profiles", "lecturers", filters],
    queryFn: () => academicProfileApi.lecturers(filters),
  });
}

export function useAcademicVerifications(
  status = "ALL",
  page = 1,
  pageSize = 10,
  options?: { search?: string; verificationType?: "ALL" | "POSITION" | "AFFILIATION"; sortOrder?: "asc" | "desc" },
) {
  return useQuery({
    queryKey: ["admin", "academic-verifications", status, page, pageSize, options?.search ?? "", options?.verificationType ?? "ALL", options?.sortOrder ?? "desc"],
    queryFn: () => academicProfileApi.listVerifications(status, page, pageSize, options),
  });
}

export function useAcademicVerificationDetails(requestId: string | null) {
  return useQuery({
    queryKey: ["admin", "academic-verification", requestId],
    queryFn: () => academicProfileApi.verificationDetails(requestId!),
    enabled: Boolean(requestId),
  });
}

export function useDecideAcademicVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, input }: { requestId: string; input: AcademicVerificationDecision }) => academicProfileApi.decide(requestId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "academic-verifications"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "academic-verification"] });
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      queryClient.invalidateQueries({ queryKey: ["academic-profile", "me"] });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "academic-verifications"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "academic-verification"] });
    },
  });
}

export function useRevokeAcademicVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, input }: { requestId: string; input: { reason: string; note?: string } }) =>
      academicProfileApi.revoke(requestId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "academic-verifications"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "academic-verification"] });
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      queryClient.invalidateQueries({ queryKey: ["academic-profile", "me"] });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "academic-verifications"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "academic-verification"] });
    },
  });
}

export function useOrcidAvailability(enabled = true) {
  return useQuery({ queryKey: ["academic-profile", "orcid-availability"], queryFn: academicProfileApi.orcidAvailability, enabled, retry: false });
}
