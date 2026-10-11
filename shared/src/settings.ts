// Instance settings switched on the Settings page.

export interface InstanceSettings {
  /** The Execute Command node may run shell commands on this computer. Off by default. */
  executeCommandEnabled: boolean;
}

export const DEFAULT_INSTANCE_SETTINGS: InstanceSettings = {
  executeCommandEnabled: false,
};
