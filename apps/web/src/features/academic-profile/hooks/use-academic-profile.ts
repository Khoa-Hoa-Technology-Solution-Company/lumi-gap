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

export function useAcademicCover(coverUrl?: string) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    setObjectUrl(null);
    if (!coverUrl) return undefined;

    academicProfileApi.cover(coverUrl).then((blob) => {
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
  }, [coverUrl]);

  return objectUrl;
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

export function useDecideAcademicVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, input }: { profileId: string; input: { decision: "approve"; method?: string; note?: string } | { decision: "reject"; reason: string; note?: string } }) => academicProfileApi.decide(profileId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "academic-verifications"] }),
  });
}
