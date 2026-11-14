import { Inject, Injectable } from '@nestjs/common';
import { IDENTITY_VERIFIER, type IdentityVerifier } from '../../../ports/identity-verifier.js';
import type { CitizenPrincipal } from '../../auth-core/auth-core.types.js';
import type { LoginStrategy } from '../../auth-core/login-strategy.js';
import { CitizenRepository } from '../repositories/citizen.repository.js';

/**
 * Citizens prove who they are with a Google ID token.
 * First sign-in creates the citizen; later sign-ins find them by Google id.
 */
@Injectable()
export class GoogleLoginStrategy implements LoginStrategy<'citizen', { idToken: string }> {
  readonly kind = 'citizen' as const;

  constructor(
    @Inject(IDENTITY_VERIFIER) private readonly identity: IdentityVerifier,
    private readonly citizens: CitizenRepository,
  ) {}

  async authenticate({ idToken }: { idToken: string }): Promise<CitizenPrincipal> {
    const verified = await this.identity.verify(idToken);
    const citizen = await this.citizens.upsertFromGoogle(verified);
    return { id: citizen.id, email: citizen.email, name: citizen.name };
  }
}
