import type { PrincipalByKind, PrincipalKind } from './auth-core.types.js';

/**
 * Strategy pattern: HOW someone proves who they are is separate from WHAT happens after.
 *   staff   → PasswordLoginStrategy (email + bcrypt password, lockout)
 *   citizen → GoogleLoginStrategy   (Google ID token)
 * Both return a principal; SessionManager then issues the same kind of tokens for either.
 * Adding e.g. "staff sign in with Google" later = one more strategy, nothing else changes.
 */
export interface LoginStrategy<K extends PrincipalKind, TCredentials> {
  readonly kind: K;
  /** Throws UnauthorizedException if the credentials are wrong */
  authenticate(credentials: TCredentials): Promise<PrincipalByKind[K]>;
}
