import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdateAcademicProfileDetailsRequest } from "@trend/shared-types";
import { academicProfileApi } from "../api/academic-profile.api";

export function useAcademicProfile() {
  return useQuery({ queryKey: ["academic-profile", "me"], queryFn: academicProfileApi.mine });
}

export function useUpdateAcademicProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAcademicProfileDetailsRequest) => academicProfileApi.update(input),
    onSuccess: (profile) => queryClient.setQueryData(["academic-profile", "me"], profile),
  });
}

export function useRequestAcademicVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: academicProfileApi.requestVerification,
    onSuccess: (profile) => queryClient.setQueryData(["academic-profile", "me"], profile),
  });
}

export function useAcademicVerifications(status = "PENDING") {
  return useQuery({ queryKey: ["admin", "academic-verifications", status], queryFn: () => academicProfileApi.listVerifications(status) });
}

export function useDecideAcademicVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, input }: { profileId: string; input: { decision: "approve"; note?: string } | { decision: "reject"; reason: string; note?: string } }) => academicProfileApi.decide(profileId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "academic-verifications"] }),
  });
}
