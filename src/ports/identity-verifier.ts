export const IDENTITY_VERIFIER = Symbol('IDENTITY_VERIFIER');

/** A verified person from an external identity provider (Google today) */
export interface VerifiedIdentity {
  /** Provider's stable user id — never changes, unlike email */
  subject: string;
  email: string;
  name: string;
  pictureUrl: string | null;
}

export interface IdentityVerifier {
  readonly name: string;
  /** Throws if the token is invalid, expired, for another app, or the email isn't verified */
  verify(idToken: string): Promise<VerifiedIdentity>;
}
