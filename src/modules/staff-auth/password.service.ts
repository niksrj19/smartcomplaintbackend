import { Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';

const COST = 12;

@Injectable()
export class PasswordService {
  /**
   * A real hash of a random string. Comparing against it when the email doesn't exist
   * makes "wrong email" take as long as "wrong password", so attackers can't
   * discover which emails are registered by timing the response.
   */
  private readonly dummyHash = bcrypt.hashSync(crypto.randomUUID(), COST);

  hash(password: string): Promise<string> {
    return bcrypt.hash(password, COST);
  }

  verify(password: string, hash: string | null | undefined): Promise<boolean> {
    return bcrypt.compare(password, hash ?? this.dummyHash);
  }
}
