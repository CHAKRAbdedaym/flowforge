import { join } from 'node:path';
import type { AppConfig } from './config.js';
import type { DB } from './db/index.js';
import { ExecutionsRepo } from './db/repositories/executions.js';
import { SessionsRepo } from './db/repositories/sessions.js';
import { UsersRepo } from './db/repositories/users.js';
import { BinaryStore } from './engine/binary-store.js';
import type { Logger } from './logger.js';
import type { NodeRegistry } from './nodes/registry.js';

/** Everything a route or service needs, created once at startup and passed explicitly (easy to test). */
export interface AppContext {
  config: AppConfig;
  db: DB;
  logger: Logger;
  startedAt: Date;
  users: UsersRepo;
  sessions: SessionsRepo;
  executionsRepo: ExecutionsRepo;
  registry: NodeRegistry;
  binaryStore: BinaryStore;
}

export function createContext(config: AppConfig, db: DB, logger: Logger, registry: NodeRegistry): AppContext {
  return {
    config,
    db,
    logger,
    startedAt: new Date(),
    users: new UsersRepo(db),
    sessions: new SessionsRepo(db),
    executionsRepo: new ExecutionsRepo(db),
    registry,
    binaryStore: new BinaryStore(join(config.dataDir, 'binary')),
  };
}
