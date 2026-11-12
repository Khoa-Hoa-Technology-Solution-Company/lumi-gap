import { useId, useState } from "react";
import { creditRoles, creditRoleMetadata, type CreditRole } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { Input } from "@/components/ui/input";

export function CreditRolePicker({ value, onChange, disabled = false }: { value: CreditRole[]; onChange: (roles: CreditRole[]) => void; disabled?: boolean }) {
  const { t, language } = useI18n(), id = useId();
  const [search, setSearch] = useState("");
  if (disabled) return <div data-no-i18n className="space-y-2"><p className="text-sm font-medium">{t("CRediT roles")}</p><ul className="flex flex-wrap gap-2">{creditRoles.filter(role => value.includes(role)).map(role => <li key={role}><a className="inline-block rounded-md border px-2 py-1 text-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2" href={creditRoleMetadata[role].source} target="_blank" rel="noreferrer">{language === "vi" ? creditRoleMetadata[role].nameVi : creditRoleMetadata[role].name}</a></li>)}</ul></div>;
  const visible = creditRoles.filter(role => `${creditRoleMetadata[role].name} ${creditRoleMetadata[role].nameVi} ${creditRoleMetadata[role].definition}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()));
  return <fieldset data-no-i18n disabled={disabled} className="min-w-0 space-y-3"><legend className="text-sm font-medium">{t("CRediT roles")}</legend>
    <label className="sr-only" htmlFor={id}>{t("Search CRediT roles")}</label><Input id={id} type="search" value={search} maxLength={100} onChange={e => setSearch(e.target.value)} placeholder={t("Search CRediT roles")} />
    <p className="text-xs text-muted-foreground">{t("Choose only roles supported by the actual work. Multiple people may share a role.")}</p>
    {value.length > 0 && <p className="text-xs font-medium">{value.map(role => language === "vi" ? creditRoleMetadata[role].nameVi : creditRoleMetadata[role].name).join(" · ")}</p>}
    <div className="max-h-64 space-y-2 overflow-y-auto pr-2">{visible.map(role => { const meta = creditRoleMetadata[role]; return <div key={role} className="rounded-md border p-3"><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={value.includes(role)} onChange={e => onChange(e.target.checked ? [...value, role] : value.filter(item => item !== role))} /><span><strong>{language === "vi" ? meta.nameVi : meta.name}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{language === "vi" ? meta.explanationVi : meta.definition}</span></span></label><details className="ml-5 mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">{t("Example and official definition")}</summary><p className="my-2">{language === "vi" ? meta.exampleVi : meta.example}</p><p>{meta.definition}</p><a className="mt-2 inline-block text-primary underline" href={meta.source} target="_blank" rel="noreferrer">NISO CRediT</a></details></div>; })}{!visible.length && <p className="text-sm text-muted-foreground">{t("No roles match your search.")}</p>}</div>
  </fieldset>;
}
