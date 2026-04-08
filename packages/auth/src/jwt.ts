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

  signUserToken(payload: UserTokenPayload, expiresIn = 86400): string {
    return jwt.sign(payload as object, this.privateKey, {
      algorithm: 'HS256',
      expiresIn
    });
  }

  signUserTokenStr(payload: UserTokenPayload): string {
    return this.signUserToken(payload);
  }

  verifyUserToken(token: string): UserTokenPayload {
    try {
      return jwt.verify(token, this.publicKey, {
        algorithms: ['HS256']
      }) as UserTokenPayload;
    } catch (err) {
      throw new Error('Unauthorized: Invalid or expired token');
    }
  }
}
