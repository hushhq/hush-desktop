export const IPC_CHANNEL = {
  GET_APP_VERSION: 'app:get-version',
  VAULT_SET_SESSION_KEY: 'vault:set-session-key',
  VAULT_GET_SESSION_KEY: 'vault:get-session-key',
  VAULT_CLEAR_SESSION_KEY: 'vault:clear-session-key',
  WINDOW_SET_MIN_FLOOR: 'window:set-min-floor',
  NETWORK_MEASURE_INSTANCE_HEALTH: 'network:measure-instance-health',
} as const;

export type IpcChannelKey = keyof typeof IPC_CHANNEL;
export type IpcChannelValue = (typeof IPC_CHANNEL)[IpcChannelKey];
