import { UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { IdentityVerifier, VerifiedIdentity } from '../../ports/identity-verifier.js';

/**
 * Verifies a Google ID token from "Sign in with Google" on the frontend.
 * Checks Google's signature, expiry, and that the token was issued for OUR client ID.
 * Needs only the public client ID — no secret.
 */
export class GoogleIdentityAdapter implements IdentityVerifier {
  readonly name = 'google';
  private readonly client: OAuth2Client;
  private readonly clientId: string;

  constructor(config: AppConfigService) {
    this.clientId = config.google.clientId;
    this.client = new OAuth2Client(this.clientId);
  }

  async verify(idToken: string): Promise<VerifiedIdentity> {
    let payload;
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.clientId });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Google sign-in failed. Please try again.');
    }

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Google account details are missing.');
    }
    if (!payload.email_verified) {
      throw new UnauthorizedException('Please verify your Google email address first.');
    }

    return {
      subject: payload.sub,
      email: payload.email.toLowerCase(),
      name: payload.name ?? payload.email.split('@')[0],
      pictureUrl: payload.picture ?? null,
    };
  }
}
