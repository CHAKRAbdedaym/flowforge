import type { AppConfig } from './config.js';
import type { DB } from './db/index.js';
import { SessionsRepo } from './db/repositories/sessions.js';
import { UsersRepo } from './db/repositories/users.js';
import type { Logger } from './logger.js';

/** Everything a route or service needs, created once at startup and passed explicitly (easy to test). */
export interface AppContext {
  config: AppConfig;
  db: DB;
  logger: Logger;
  startedAt: Date;
  users: UsersRepo;
  sessions: SessionsRepo;
}

export function createContext(config: AppConfig, db: DB, logger: Logger): AppContext {
  return {
    config,
    db,
    logger,
    startedAt: new Date(),
    users: new UsersRepo(db),
    sessions: new SessionsRepo(db),
  };
}
