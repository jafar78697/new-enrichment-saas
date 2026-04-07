import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export class ApiKeyManager {
  private readonly saltRounds = 10;

  generateKey(): { key: string; prefix: string; hash: string } {
    // Standard secure format: enr_live_xxxxxx...
    const prefix = 'enr_live_';
    const randomBytes = crypto.randomBytes(32).toString('hex');
    const key = `${prefix}${randomBytes}`;
    const hash = bcrypt.hashSync(key, this.saltRounds);
    
    return { 
      key, 
      prefix: prefix + randomBytes.substring(0, 8), 
      hash 
    };
  }

  verifyKey(key: string, hash: string): boolean {
    return bcrypt.compareSync(key, hash);
  }
}
