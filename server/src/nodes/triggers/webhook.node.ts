import { timingSafeEqual } from 'node:crypto';
import type { BinaryRef, Item, JsonObject } from '@flowforge/shared';
import { NodeOperationError } from '../../engine/errors.js';
import { getPath } from '../../engine/params.js';
import { defineNode, type WebhookHandleResult, type WebhookResponseMode } from '../../engine/types.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const keyValues = (value: unknown): Record<string, string> =>
  Object.fromEntries(
    (Array.isArray(value) ? (value as Array<{ name?: string; value?: unknown }>) : [])
      .filter((h) => h?.name)
      .map((h) => [String(h.name), String(h.value ?? '')]),
  );

function parseBody(text: unknown): unknown {
  if (typeof text !== 'string' || text === '') return undefined;
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* plain text */
    }
  }
  return text;
}

export default defineNode({
  description: {
    type: 'flowforge.webhook',
    displayName: 'Webhook',
    description: 'Starts the workflow when a URL is called (any HTTP method).',
    icon: 'lucide:webhook',
    group: 'trigger',
    version: 1,
    defaults: { name: 'Webhook', color: '#ff6d5a' },
    subtitle: '{{httpMethod}} {{path}}',
    inputs: [],
    outputs: [{ type: 'main' }],
    trigger: { kind: 'webhook' },
    keywords: ['http', 'api', 'endpoint', 'url', 'callback', 'rest'],
  },
  properties: [
    { name: 'webhookUrls', displayName: 'Webhook URLs', type: 'webhookUrls', default: '', typeOptions: { urlPrefix: 'webhook' } },
    {
      name: 'httpMethod',
      displayName: 'HTTP Method',
      type: 'options',
      default: 'GET',
      options: METHODS.map((m) => ({ name: m, value: m })),
    },
    {
      name: 'path',
      displayName: 'Path',
      type: 'string',
      default: '',
      placeholder: 'e.g. orders or users/:id',
      description: 'Leave empty for a random path. Use ":name" for a variable part, available as {{ $json.params.name }}.',
      noDataExpression: true,
    },
    {
      name: 'authentication',
      displayName: 'Authentication',
      type: 'options',
      default: 'none',
      options: [
        { name: 'None', value: 'none' },
        { name: 'Basic Auth', value: 'basicAuth' },
        { name: 'Header Auth', value: 'headerAuth' },
      ],
    },
    { name: 'basicAuthUser', displayName: 'User', type: 'string', default: '', displayOptions: { show: { authentication: ['basicAuth'] } }, noDataExpression: true },
    {
      name: 'basicAuthPassword',
      displayName: 'Password',
      type: 'string',
      default: '',
      typeOptions: { password: true },
      displayOptions: { show: { authentication: ['basicAuth'] } },
      noDataExpression: true,
    },
    { name: 'headerAuthName', displayName: 'Header Name', type: 'string', default: 'X-API-Key', displayOptions: { show: { authentication: ['headerAuth'] } }, noDataExpression: true },
    {
      name: 'headerAuthValue',
      displayName: 'Header Value',
      type: 'string',
      default: '',
      typeOptions: { password: true },
      displayOptions: { show: { authentication: ['headerAuth'] } },
      noDataExpression: true,
    },
    {
      name: 'responseMode',
      displayName: 'Respond',
      type: 'options',
      default: 'onReceived',
      options: [
        { name: 'Immediately', value: 'onReceived', description: 'As soon as the request arrives' },
        { name: 'When Last Node Finishes', value: 'lastNode', description: 'Returns data of the last executed node' },
        { name: "Using 'Respond to Webhook' Node", value: 'responseNode', description: 'You decide what to send back, and when' },
      ],
    },
    {
      name: 'responseData',
      displayName: 'Response Data',
      type: 'options',
      default: 'firstEntryJson',
      displayOptions: { show: { responseMode: ['lastNode'] } },
      options: [
        { name: 'First Entry JSON', value: 'firstEntryJson' },
        { name: 'All Entries', value: 'allEntries' },
        { name: 'First Entry Binary', value: 'firstEntryBinary' },
        { name: 'No Response Body', value: 'noData' },
      ],
    },
    {
      name: 'options',
      displayName: 'Options',
      type: 'collection',
      default: {},
      placeholder: 'Add option',
      options: [
        { name: 'responseCode', displayName: 'Response Code', type: 'number', default: 200, typeOptions: { minValue: 100, maxValue: 599 } },
        {
          name: 'responseBody',
          displayName: 'Response Body (Respond Immediately)',
          type: 'string',
          default: '',
          description: 'Text or JSON sent back immediately (default: {"message":"Workflow was started"}).',
          typeOptions: { rows: 3 },
        },
        { name: 'responseHeaders', displayName: 'Response Headers', type: 'keyValue', default: [] },
        { name: 'rawBody', displayName: 'Raw Body', type: 'boolean', default: false, description: 'Also keep the request body as binary data.' },
        { name: 'binaryPropertyName', displayName: 'Binary Property', type: 'string', default: 'data' },
        { name: 'allowedOrigins', displayName: 'Allowed Origins (CORS)', type: 'string', default: '*', description: 'Comma-separated origins allowed to call this webhook from a browser.' },
      ],
    },
  ],
  webhook: {
    urlPrefix: 'webhook',
    endpoints(node, params) {
      const method = String(params.httpMethod ?? 'GET').toUpperCase();
      return { methods: [method], path: String(params.path || node.webhookId || node.id) };
    },
    cors: (params) => String(getPath(params, 'options.allowedOrigins') ?? '*') || undefined,
    async handle({ request, parameters: p, storeBinary }): Promise<WebhookHandleResult> {
      const auth = String(p.authentication ?? 'none');
      if (auth === 'basicAuth') {
        const header = request.headers.authorization ?? '';
        if (!header.startsWith('Basic ')) {
          return { response: { statusCode: 401, headers: { 'WWW-Authenticate': 'Basic realm="Webhook"' }, body: { message: 'Authorization is required!' } } };
        }
        const [user, ...rest] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
        if (!same(user ?? '', String(p.basicAuthUser ?? '')) || !same(rest.join(':'), String(p.basicAuthPassword ?? ''))) {
          return { response: { statusCode: 403, body: { message: 'Authorization data is wrong!' } } };
        }
      } else if (auth === 'headerAuth') {
        const name = String(p.headerAuthName ?? '').toLowerCase();
        const expected = String(p.headerAuthValue ?? '');
        const given = request.headers[name];
        if (!given) return { response: { statusCode: 401, body: { message: 'Authorization is required!' } } };
        if (!expected || !same(given, expected)) return { response: { statusCode: 403, body: { message: 'Authorization data is wrong!' } } };
      }

      const options = (p.options ?? {}) as JsonObject;
      const binaryProperty = String(options.binaryPropertyName || 'data');
      const binary: Record<string, BinaryRef> = {};
      for (const [i, file] of request.files.entries()) {
        const key = binary[file.field] ? `${file.field}${i}` : file.field || `${binaryProperty}${i}`;
        binary[key] = await storeBinary(file.data, file.fileName, file.mimeType);
      }
      const structured = /json|x-www-form-urlencoded|multipart|^text\/|xml/.test(request.contentType);
      if (request.rawBody.length && (options.rawBody === true || !structured)) {
        binary[binaryProperty] = await storeBinary(request.rawBody, 'body', request.contentType || 'application/octet-stream');
      }
      const item: Item = {
        json: {
          headers: request.headers,
          params: request.params,
          query: request.query,
          body: request.body as JsonObject[string],
          webhookUrl: request.webhookUrl,
          executionMode: request.executionMode,
        },
        ...(Object.keys(binary).length ? { binary } : {}),
      };
      return {
        items: [item],
        responseMode: String(p.responseMode ?? 'onReceived') as WebhookResponseMode,
        responseCode: Number(options.responseCode ?? 200) || 200,
        responseHeaders: keyValues(options.responseHeaders),
        onReceivedBody: parseBody(options.responseBody),
        lastNodeData: String(p.responseData ?? 'firstEntryJson') as 'firstEntryJson',
        binaryProperty,
      };
    },
  },
  execute() {
    throw new NodeOperationError('This node waits for an HTTP request', {
      hint: 'Click "Listen for test event" and call the test URL, or pin some data on this node.',
    });
  },
});
