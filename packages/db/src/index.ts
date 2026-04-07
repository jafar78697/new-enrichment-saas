import { Pool, PoolConfig } from 'pg';
export * from './repositories/base';
export * from './repositories/job';

export function createPool(config: PoolConfig): Pool {
  return new Pool(config);
}

// Additional repositories will be exported here
