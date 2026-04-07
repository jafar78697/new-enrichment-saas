import jwt from 'jsonwebtoken';

export interface UserTokenPayload {
  user_id: string;
  tenant_id: string;
  workspace_id?: string;
  role: string;
  plan: string;
}

export class AuthManager {
  constructor(
    private readonly privateKey: string,
    private readonly publicKey: string
  ) {}

  signUserToken(payload: UserTokenPayload, expiresIn: string = '24h'): string {
    return jwt.sign(payload, this.privateKey, {
      algorithm: 'RS256',
      expiresIn
    });
  }

  verifyUserToken(token: string): UserTokenPayload {
    try {
      return jwt.verify(token, this.publicKey, {
        algorithms: ['RS256']
      }) as UserTokenPayload;
    } catch (err) {
      throw new Error('Unauthorized: Invalid or expired token');
    }
  }
}
