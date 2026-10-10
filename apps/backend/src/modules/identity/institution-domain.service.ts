import { domainToASCII } from "node:url";
import { isIP } from "node:net";
import type { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { normalizeEmail } from "./identity-foundation.rules.js";
import { AppError } from "../../common/exceptions/app-error.js";

type DomainDb = Pick<Prisma.TransactionClient, "institutionDomain" | "institution">;
export function normalizedInstitutionHost(value: string): string | null {
  const host = domainToASCII(value.toLowerCase());
  if (!host || host.endsWith(".") || host.length > 253 || isIP(host) || !host.includes(".") || /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) return null;
  return host.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ? host : null;
}
export function institutionHostMatches(host: string, domain: string, allowSubdomains: boolean) {
  return host === domain || allowSubdomains && host.endsWith(`.${domain}`);
}
export async function approvedInstitutionDomains(institutionId: string, purpose: "EMAIL" | "WEBSITE", db: DomainDb = getPrisma()) {
  const institution = await db.institution.findUnique({ where: { id: institutionId } });
  if (!institution?.isActive || institution.status !== "ACTIVE") return [];
  return db.institutionDomain.findMany({ where: { institutionId, trusted: true, status: "ACTIVE", type: { in: [purpose, "BOTH"] } } });
}
export async function trustedInstitutionForEmail(emailInput: string, db: DomainDb = getPrisma()) {
  const email = normalizeEmail(emailInput), domain = normalizedInstitutionHost(email.split("@")[1] ?? "");
  if (!domain) return null;
  // Mail ownership is scoped to the exact approved domain, not arbitrary subdomains.
  const configured = await db.institutionDomain.findUnique({ where: { domain } });
  if (!configured?.trusted || configured.status !== "ACTIVE" || !["EMAIL", "BOTH"].includes(configured.type)) return null;
  const institution = await db.institution.findUnique({ where: { id: configured.institutionId } });
  if (!institution?.isActive || institution.status !== "ACTIVE") return null;
  return { email, domain, institution, verificationMethod: configured.verificationMethod };
}

export async function officialInstitutionUrl(value: string, institutionId: string, db: DomainDb = getPrisma()) {
  let url: URL;
  try { url = new URL(value); } catch { throw AppError.badRequest("Use a valid HTTPS institution URL"); }
  const host = normalizedInstitutionHost(url.hostname);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !host || url.hash) throw AppError.badRequest("Use a valid public HTTPS institution URL without credentials or fragments");
  const domains = await approvedInstitutionDomains(institutionId, "WEBSITE", db);
  if (!domains.some(domain => institutionHostMatches(host, domain.domain, domain.allowSubdomains))) throw AppError.badRequest("This URL is not on an approved website domain for your institution. Use institution-issued documents or ask support to register the official domain.");
  return url.href;
}

/** No fetching: unregistered domains remain a claim requiring explicit Admin validation. */
export async function lecturerEvidenceUrl(value: string, institutionId: string, db: DomainDb = getPrisma()) {
  let url: URL;
  try { url = new URL(value); } catch { throw AppError.badRequest("Use a valid HTTPS institution URL"); }
  const host = normalizedInstitutionHost(url.hostname);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !host || url.hash) throw AppError.badRequest("Use a valid public HTTPS institution URL without credentials or fragments");
  const approved = await approvedInstitutionDomains(institutionId, "WEBSITE", db);
  if (approved.some(domain => institutionHostMatches(host, domain.domain, domain.allowSubdomains))) return { reference: url.href, urlTrustStatus: "REGISTRY_APPROVED" as const };
  const configured = await db.institutionDomain.findMany();
  if (approved.length || configured.some(domain => (domain.institutionId !== institutionId || domain.status !== "ACTIVE") && institutionHostMatches(host, domain.domain, true) || host.includes(`${domain.domain}.`))) {
    throw AppError.badRequest("This URL is not on an approved website domain for your institution. Use institution-issued documents or ask support to register the official domain.");
  }
  return { reference: url.href, urlTrustStatus: "PENDING_ADMIN_VALIDATION" as const };
}
