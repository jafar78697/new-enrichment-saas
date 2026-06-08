export declare class ApiKeyManager {
    private readonly saltRounds;
    generateKey(): {
        key: string;
        prefix: string;
        hash: string;
    };
    verifyKey(key: string, hash: string): boolean;
}
//# sourceMappingURL=api_keys.d.ts.map