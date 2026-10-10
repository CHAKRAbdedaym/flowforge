import type { Item, JsonObject, WorkflowData, WorkflowNode } from '@flowforge/shared';
import { getPath, withDefaults } from '../engine/params.js';
import type { NodeType, TriggerContext } from '../engine/types.js';
import type { Logger } from '../logger.js';

export interface TriggerContextOptions {
  workflow: WorkflowData;
  node: WorkflowNode;
  type: NodeType;
  mode: 'trigger' | 'manual';
  logger: Logger;
  timezone: string;
  filesRoot: string;
  staticData: Record<string, Record<string, unknown>>;
  emit(items: Item[]): void;
  emitError(error: Error): void;
}

export function createTriggerContext(o: TriggerContextOptions): TriggerContext {
  const params: JsonObject = withDefaults(o.type.properties, o.node.parameters ?? {});
  return {
    node: o.node,
    workflow: o.workflow,
    mode: o.mode,
    logger: o.logger,
    timezone: o.timezone,
    filesRoot: o.filesRoot,
    getNodeParameter: <T>(name: string, fallback?: T): T => {
      const value = getPath(params, name);
      return (value === undefined ? fallback : value) as T;
    },
    emit: o.emit,
    emitError: o.emitError,
    getStaticData: () => (o.staticData[o.node.name] ??= {}),
  };
}
