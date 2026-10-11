import { DEFAULT_INSTANCE_SETTINGS, type InstanceSettings } from '@flowforge/shared';
import type { SettingsRepo } from '../db/repositories/settings.js';

const KEY = (name: string) => `instance.${name}`;

/** Typed access to the switches of the Settings page (stored in the `settings` table). */
export class InstanceSettingsService {
  constructor(private readonly repo: SettingsRepo) {}

  all(): InstanceSettings {
    const out = { ...DEFAULT_INSTANCE_SETTINGS };
    for (const name of Object.keys(out) as (keyof InstanceSettings)[]) out[name] = this.repo.get(KEY(name), DEFAULT_INSTANCE_SETTINGS[name]);
    return out;
  }

  /** Value of one setting; unknown names are undefined. */
  get(name: string): unknown {
    return name in DEFAULT_INSTANCE_SETTINGS ? this.repo.get(KEY(name), DEFAULT_INSTANCE_SETTINGS[name as keyof InstanceSettings]) : undefined;
  }

  update(patch: Partial<InstanceSettings>): InstanceSettings {
    for (const [name, value] of Object.entries(patch)) {
      if (name in DEFAULT_INSTANCE_SETTINGS && value !== undefined) this.repo.set(KEY(name), value);
    }
    return this.all();
  }
}
