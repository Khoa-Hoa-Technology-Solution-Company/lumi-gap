export type AccountIdentityProvider = "GOOGLE" | "FEID";

export interface VerifiedProviderIdentity {
  provider: AccountIdentityProvider;
  subject: string;
  email?: string;
  emailVerified?: boolean;
}

/**
 * Provider-neutral account identity contract. FEID is deliberately only a
 * contract until official OAuth2/OIDC metadata and credentials are supplied.
 */
export interface AccountIdentityProviderAdapter {
  readonly provider: AccountIdentityProvider;
  exchangeAuthorizationCode(code: string, state: string): Promise<VerifiedProviderIdentity>;
}

