import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdateAcademicProfileDetailsRequest } from "@trend/shared-types";
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
  queryClient.invalidateQueries({ queryKey: ["academic-profile", "me"] });
  queryClient.invalidateQueries({ queryKey: ["academic-profile", "public"] });
  queryClient.invalidateQueries({ queryKey: ["academic-profile", "handle"] });
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
  });
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
    mutationFn: (code: string) => academicProfileApi.verifyInstitutionalEmail(code),
    onSuccess: (status) => {
      queryClient.setQueryData(["academic-profile", "institutional-email"], status);
      queryClient.invalidateQueries({ queryKey: ["academic-profile", "me"] });
    },
  });
}

export function usePublicAcademicProfile(userId: string) {
  return useQuery({
    queryKey: ["academic-profile", "public", userId],
    queryFn: () => academicProfileApi.publicProfile(userId),
    enabled: Boolean(userId),
  });
}

export function usePublicAcademicProfileByHandle(handle: string) {
  return useQuery({
    queryKey: ["academic-profile", "handle", handle],
    queryFn: () => academicProfileApi.publicProfileByHandle(handle),
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

export function useAcademicVerifications(status = "PENDING") {
  return useQuery({ queryKey: ["admin", "academic-verifications", status], queryFn: () => academicProfileApi.listVerifications(status) });
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
    mutationFn: ({ requestId, input }: { requestId: string; input: { decision: "approve"; method?: string; note?: string } | { decision: "reject"; reason: string; note?: string } }) => academicProfileApi.decide(requestId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "academic-verifications"] }),
  });
}
