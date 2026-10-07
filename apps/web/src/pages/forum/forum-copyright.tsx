import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { forumApi, type ForumCopyrightInput } from "@/features/forum/api/forum.api";
import { useI18n } from "@/i18n";

const fields = [
  { name: "claimantName", label: "Your name", max: 200, min: 2 },
  { name: "claimantEmail", label: "Email for verification", max: 320, type: "email" },
  { name: "claimantOrganization", label: "Organisation (optional)", max: 240, optional: true },
  { name: "targetId", label: "Content identifier", max: 36 },
  { name: "originalSourceUrl", label: "Original source URL (optional)", max: 2000, type: "url", optional: true },
  { name: "copyrightedWorkDescription", label: "Describe the copyrighted work", max: 10000, min: 10, multiline: true },
  { name: "ownershipBasis", label: "Explain your ownership or authority to act", max: 5000, min: 10, multiline: true },
  { name: "details", label: "Describe the concern and the content involved", max: 10000, min: 10, multiline: true },
] as const;

export function ForumCopyrightPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [values, setValues] = useState<ForumCopyrightInput>({ claimantName: "", claimantEmail: "", targetType: params.get("type") === "RESPONSE" ? "RESPONSE" : "THREAD", targetId: params.get("id") ?? "", copyrightedWorkDescription: "", ownershipBasis: "", details: "" });
  const submit = useMutation({ mutationFn: () => forumApi.submitCopyrightClaim({ ...values, claimantOrganization: values.claimantOrganization?.trim() || undefined, originalSourceUrl: values.originalSourceUrl?.trim() || undefined }) });
  return <main className="mx-auto w-full max-w-2xl px-5 py-10">
    <Link to="/forum" className="text-sm text-primary hover:underline">{t("Back to forum")}</Link>
    <h1 className="mt-6 text-2xl font-semibold">{t("Submit a copyright claim")}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{t("Provide the content identifier and supporting details. We will send a verification email before the claim enters Admin review.")}</p>
    {submit.isSuccess ? <div role="status" className="mt-8 rounded-xl border p-6"><CheckCircle2 className="mb-3 h-6 w-6 text-primary" /><h2 className="font-semibold">{t("Check your email")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("Use the verification link to complete your claim submission.")}</p></div> : <form className="mt-8 space-y-5" onSubmit={(event) => { event.preventDefault(); submit.mutate(); }}>
      <label className="block space-y-2 text-sm"><span className="font-medium">{t("Content type")}</span><select value={values.targetType} onChange={(event) => setValues((current) => ({ ...current, targetType: event.target.value as ForumCopyrightInput["targetType"] }))} className="w-full rounded-md border bg-background p-3"><option value="THREAD">{t("Thread")}</option><option value="RESPONSE">{t("Response")}</option></select></label>
      {fields.map((field) => {
        const props = { required: !("optional" in field), maxLength: field.max, minLength: "min" in field ? field.min : undefined, value: values[field.name] ?? "", onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((current) => ({ ...current, [field.name]: event.target.value })), className: "w-full rounded-md border bg-background p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" };
        return <label key={field.name} className="block space-y-2 text-sm"><span className="font-medium">{t(field.label)}</span>{"multiline" in field ? <textarea {...props} rows={4} /> : <input {...props} type={"type" in field ? field.type : "text"} autoComplete={field.name === "claimantName" ? "name" : field.name === "claimantEmail" ? "email" : "off"} />}</label>;
      })}
      <label className="hidden" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" name="website" value={values.honeypot ?? ""} onChange={(event) => setValues((current) => ({ ...current, honeypot: event.target.value }))} /></label>
      {submit.isError ? <p role="alert" className="text-sm text-destructive">{t("Could not submit the claim. Check the content identifier and try again.")}</p> : null}
      <Button type="submit" disabled={submit.isPending}>{t(submit.isPending ? "Working…" : "Submit claim")}</Button>
    </form>}
  </main>;
}
