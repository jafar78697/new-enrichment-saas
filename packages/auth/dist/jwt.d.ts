export interface UserTokenPayload {
    user_id: string;
    tenant_id: string;
    workspace_id?: string;
    role: string;
    plan: string;
}
export declare class AuthManager {
    private readonly privateKey;
    private readonly publicKey;
    constructor(privateKey: string, publicKey: string);
    signUserToken(payload: UserTokenPayload, expiresIn?: number): string;
    signUserTokenStr(payload: UserTokenPayload): string;
    verifyUserToken(token: string): UserTokenPayload;
}
//# sourceMappingURL=jwt.d.ts.map