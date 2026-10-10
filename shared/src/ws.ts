/** Every server → client WebSocket message uses this envelope. */
export interface WsEnvelope<TType extends string = string, TData = unknown> {
  type: TType;
  /** Server timestamp (ms since epoch). */
  ts: number;
  /** Per-execution sequence number, lets the client detect missed events. */
  seq?: number;
  data: TData;
}

export type ServerEvent =
  | WsEnvelope<'connection.ready', { userId: string; serverVersion: string }>
  | WsEnvelope<'pong', Record<string, never>>
  | WsEnvelope<'error', { message: string }>;

export type ServerEventType = ServerEvent['type'];

export type WsRoom = `workflow:${string}` | `execution:${string}`;

export type ClientMessage =
  | { type: 'ping' }
  | { type: 'subscribe'; room: WsRoom }
  | { type: 'unsubscribe'; room: WsRoom };

export function isWsRoom(value: unknown): value is WsRoom {
  return typeof value === 'string' && /^(workflow|execution):[\w-]{1,64}$/.test(value);
}
