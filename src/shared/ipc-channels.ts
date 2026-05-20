export const IPC_CHANNEL = {
  GET_APP_VERSION: 'app:get-version',
  VAULT_SET_SESSION_KEY: 'vault:set-session-key',
  VAULT_GET_SESSION_KEY: 'vault:get-session-key',
  VAULT_CLEAR_SESSION_KEY: 'vault:clear-session-key',
  WINDOW_SET_MIN_FLOOR: 'window:set-min-floor',
  WINDOW_SET_GLASS_MATERIAL: 'window:set-glass-material',
  WINDOW_GET_GLASS_CAPABILITIES: 'window:get-glass-capabilities',
  NETWORK_MEASURE_INSTANCE_HEALTH: 'network:measure-instance-health',
  UPDATE_GET_STATE: 'update:get-state',
  UPDATE_CHECK_NOW: 'update:check-now',
  UPDATE_STATE_EVENT: 'update:state',
} as const;

export type IpcChannelKey = keyof typeof IPC_CHANNEL;
export type IpcChannelValue = (typeof IPC_CHANNEL)[IpcChannelKey];
