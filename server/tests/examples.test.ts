import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { JsonObject, WorkflowNode, WorkflowRecord } from '@flowforge/shared';
import { telegramHub } from '../src/integrations/telegram-hub.js';
import { startDiscordMock, type DiscordMock } from './discord-mock.js';
import { answer, functionCallReply, startGeminiMock, type GeminiMock } from './gemini-mock.js';
import { makeTestApp, waitFor, type TestApp } from './helpers.js';
import { startOpenMeteoMock, type OpenMeteoMock } from './open-meteo-mock.js';
import { smtpData, startFakeSmtp, type FakeSmtp } from './smtp-helpers.js';
import { startTelegramMock, textUpdate, TG_TOKEN, type TelegramMock } from './telegram-mock.js';
import { activate, executions, finished, signedIn, type Agent } from './trigger-helpers.js';

const LOGIN = { user: 'shop@flowforge.test', pass: 'app-password' };

let t: TestApp;
let agent: Agent;
let smtp: FakeSmtp;
let meteo: OpenMeteoMock;
let discord: DiscordMock;
let gemini: GeminiMock;
let telegram: TelegramMock;
const hubOptions = telegramHub.options;

beforeEach(async () => {
  [smtp, meteo, discord, gemini, telegram] = await Promise.all([startFakeSmtp(LOGIN), startOpenMeteoMock(), startDiscordMock(), startGeminiMock(), startTelegramMock()]);
  telegramHub.configure({ pollTimeoutSeconds: 1, backoffBaseMs: 20, backoffMaxMs: 100 });
  t = await makeTestApp();
  agent = await signedIn(t);
});
afterEach(async () => {
  await t.close();
  telegramHub.configure(hubOptions);
  await Promise.all([smtp.close(), meteo.close(), discord.close(), gemini.close(), telegram.close()]);
});

const credential = (name: string, type: string, data: JsonObject) => agent.post('/api/credentials').send({ name, type, data }).expect(201);

async function importExample(id: string): Promise<WorkflowRecord> {
  const res = await agent.post(`/api/examples/${id}/import`);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as WorkflowRecord;
}

/** The examples call the real Open-Meteo: the tests send them to the local mock instead. */
function useWeatherMock(wf: WorkflowRecord): WorkflowRecord {
  const nodes = wf.nodes.map((n): WorkflowNode => (n.type === 'flowforge.openMeteo' || n.type === 'flowforge.weatherTool' ? { ...n, parameters: { ...n.parameters, options: { forecastUrl: meteo.forecastUrl, geocodingUrl: meteo.geocodingUrl } } } : n));
  return t.ctx.workflowsRepo.update(wf.id, { name: wf.name, nodes, connections: wf.connections, settings: wf.settings })!;
}

describe('example workflows', () => {
  it('lists the seven examples with a description', async () => {
    const list = (await agent.get('/api/examples')).body as { id: string; name: string; description: string; nodeCount: number }[];
    expect(list.map((e) => e.id)).toEqual(['contact-form-discord', 'daily-weather-email', 'form-to-email', 'telegram-ai-assistant', 'telegram-assistant', 'website-chatbot-agent', 'website-chatbot']);
    for (const example of list) expect(example.description.length, example.id).toBeGreaterThan(40);
    // Every node type and every credential-free default of the examples exists in this build.
    for (const example of list) {
      const wf = await importExample(example.id);
      for (const n of wf.nodes) expect(t.ctx.registry.get(n.type), `${example.id}: ${n.type}`).toBeDefined();
    }
  });

  it('Daily weather → HTML email: sends the forecast of the city as a designed email', async () => {
    await credential('Mail', 'smtp', smtpData(smtp.port, LOGIN));
    const wf = useWeatherMock(await importExample('daily-weather-email'));
    const run = await agent.post('/api/dev/run').send({ name: wf.name, nodes: wf.nodes, connections: wf.connections });
    expect(run.body.status, JSON.stringify(run.body.error)).toBe('success');
    expect(meteo.geocodingRequests()[0]!.query.name).toBe('Paris');
    expect(smtp.messages).toHaveLength(1);
    const { mail, envelope } = smtp.messages[0]!;
    expect(envelope.to).toEqual(['you@example.com']);
    expect(mail.subject).toMatch(/^⛅ Weather in Paris: 19\.8 °C, Partly cloudy$/);
    expect(mail.html).toContain('Next days');
    expect(mail.html).toContain('Paris, France');
    expect(mail.html).toMatch(/2026-10-1\d: [\d.]+ to [\d.]+ °C, Partly cloudy/);
    expect(mail.html).toContain('Weather data by Open-Meteo.com');

    // It can be activated: the schedule is valid.
    expect((await activate(agent, wf.id)).status).toBe(200);
  });

  it('Contact form → Discord embed + confirmation email', async () => {
    await credential('Mail', 'smtp', smtpData(smtp.port, LOGIN));
    await credential('Channel', 'discordWebhookApi', { webhookUri: discord.url });
    const wf = await importExample('contact-form-discord');
    expect((await activate(agent, wf.id)).status).toBe(200);
    const form = wf.nodes.find((n) => n.type === 'flowforge.formTrigger')!;
    const res = await request(t.app)
      .post(`/form/${form.webhookId}`)
      .set('Accept', 'application/json')
      .type('form')
      .send({ 'field-0': 'Ada Lovelace', 'field-1': 'ada@example.com', 'field-2': 'Hello from the phone!' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const done = await finished(t, executions(t, wf.id)[0]!.id);
    expect(done.status, JSON.stringify(done.error)).toBe('success');

    const post = discord.requests.find((r) => r.method === 'POST')!;
    const body = post.body as { content: string; username: string; embeds: { title: string; description: string; color: number; timestamp: string; footer: { text: string }; fields: { name: string; value: string; inline: boolean }[] }[] };
    expect(body.content).toBe('📬 **New contact form message**');
    expect(body.username).toBe('FlowForge');
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0]).toMatchObject({ title: 'Ada Lovelace', description: 'Hello from the phone!', color: 0x5865f2, footer: { text: 'FlowForge contact form' } });
    expect(body.embeds[0]!.fields[0]).toEqual({ name: 'Email', value: 'ada@example.com', inline: true });
    expect(Date.parse(body.embeds[0]!.timestamp)).toBeGreaterThan(Date.now() - 60_000);

    expect(smtp.messages).toHaveLength(1);
    expect(smtp.messages[0]!.envelope.to).toEqual(['ada@example.com']);
    expect(smtp.messages[0]!.mail.html).toContain('Thanks, Ada Lovelace!');
  });

  it('Telegram assistant: /weather <city> is answered in the same chat, unknown cities get a friendly reply', async () => {
    await credential('Bot', 'telegramApi', { accessToken: TG_TOKEN, baseUrl: telegram.url });
    const wf = useWeatherMock(await importExample('telegram-assistant'));
    expect((await activate(agent, wf.id)).status, 'activation').toBe(200);

    telegram.push(textUpdate('hello bot', { chat: 777 }));
    telegram.push(textUpdate('/weather Lyon', { chat: 777 }));
    const sent = await waitFor(() => telegram.calls('sendMessage')[0], 8000, 'weather reply');
    expect(sent.body.chat_id).toBe('777');
    expect(String(sent.body.text)).toMatch(/^Lyon, France: ⛅ Partly cloudy, 19\.8 °C/);
    expect(String(sent.body.text)).toMatch(/\n⛅ 2026-10-1\d: [\d.]+ to [\d.]+ °C/);
    expect(sent.body.parse_mode).toBeUndefined();
    // "hello bot" is not the command: one execution only.
    expect(executions(t, wf.id)).toHaveLength(1);

    telegram.push(textUpdate('/weather Xyzzyqq', { chat: 777 }));
    const sorry = await waitFor(() => telegram.calls('sendMessage')[1], 8000, 'not found reply');
    expect(String(sorry.body.text)).toBe('🤔 I could not find "Xyzzyqq". Try: /weather Paris');

    telegram.push(textUpdate('/weather', { chat: 777 }));
    const fallback = await waitFor(() => telegram.calls('sendMessage')[2], 8000, 'default city reply');
    expect(String(fallback.body.text)).toMatch(/^Paris, France:/);
    await waitFor(() => executions(t, wf.id).length === 3 && executions(t, wf.id).every((e) => e.status === 'success'), 5000, 'executions finished');
  });

  it('Website chatbot: the chat page talks to Gemini and remembers the conversation', async () => {
    await credential('Gemini', 'googlePalmApi', { apiKey: 'AIzaSy-example-key-123456', host: gemini.url });
    const wf = await importExample('website-chatbot');
    expect((await activate(agent, wf.id)).status).toBe(200);
    const chat = wf.nodes.find((n) => n.type === 'flowforge.chatTrigger')!;
    const page = await request(t.app).get(`/chat/${chat.webhookId}`);
    expect(page.text).toContain('FlowForge assistant');

    gemini.enqueue(answer('Hi! I am the assistant.'), answer('You said hello.'));
    const say = (chatInput: string) => request(t.app).post(`/chat/${chat.webhookId}`).set('Accept', 'application/json').send({ chatInput, sessionId: 'visitor-1' });
    expect((await say('Hello')).body.output).toBe('Hi! I am the assistant.');
    expect((await say('What did I say?')).body.output).toBe('You said hello.');
    const second = gemini.calls[1]!.body as { contents: { role: string }[]; systemInstruction: { parts: { text: string }[] } };
    expect(second.contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(second.systemInstruction.parts[0]!.text).toContain('friendly assistant');
    expect(gemini.calls[0]!.model).toBe('gemini-3.8-flash');
  });

  type Part = { text?: string; functionCall?: { name: string; args: JsonObject }; functionResponse?: { name: string; response: { summary?: string; location?: string; result?: unknown; error?: string } } };
  const partsOf = (call: { body?: unknown }) => (call.body as { contents: { role: string; parts: Part[] }[] }).contents;

  it('Website chatbot with AI Agent: answers a weather question through the Weather Tool and remembers the session', async () => {
    await credential('Gemini', 'googlePalmApi', { apiKey: 'AIzaSy-example-key-123456', host: gemini.url });
    const wf = useWeatherMock(await importExample('website-chatbot-agent'));
    expect((await activate(agent, wf.id)).status).toBe(200);
    const chat = wf.nodes.find((n) => n.type === 'flowforge.chatTrigger')!;
    const say = (chatInput: string) => request(t.app).post(`/chat/${chat.webhookId}`).set('Accept', 'application/json').send({ chatInput, sessionId: 'visitor-7' });

    gemini.enqueue(functionCallReply([{ name: 'get_weather', args: { city: 'Lyon' } }]), answer('It is partly cloudy in Lyon, about 20 °C.'), functionCallReply([{ name: 'calculator', args: { expression: '19.8 * 9 / 5 + 32' } }]), answer('That is 67.64 °F.'));
    const first = await say('What is the weather in Lyon?');
    expect(first.body.output).toBe('It is partly cloudy in Lyon, about 20 °C.');
    // Turn 1 declares both tools; turn 2 carries the real result of the Weather Tool.
    const declared = (gemini.calls[0]!.body as { tools: { functionDeclarations: { name: string }[] }[] }).tools[0]!.functionDeclarations.map((d) => d.name);
    expect(declared).toEqual(['get_weather', 'calculator']);
    const weatherResult = partsOf(gemini.calls[1]!).at(-1)!.parts[0]!.functionResponse!;
    expect(weatherResult.name).toBe('get_weather');
    expect(weatherResult.response.location).toBe('Lyon, France');
    expect(weatherResult.response.summary).toMatch(/Partly cloudy, 19\.8 °C/);
    expect(meteo.geocodingRequests()[0]!.query.name).toBe('Lyon');

    const second = await say('Convert that to Fahrenheit');
    expect(second.body.output).toBe('That is 67.64 °F.');
    // Memory: the second conversation starts with the first question and answer.
    expect(partsOf(gemini.calls[2]!).map((c) => `${c.role}: ${c.parts[0]!.text}`)).toEqual(['user: What is the weather in Lyon?', 'model: It is partly cloudy in Lyon, about 20 °C.', 'user: Convert that to Fahrenheit']);
    expect(partsOf(gemini.calls[3]!).at(-1)!.parts[0]!.functionResponse!.response.result).toBeCloseTo(67.64);

    // Every sub-node shows what it did in the execution.
    const done = await finished(t, executions(t, wf.id)[0]!.id);
    expect(done.status).toBe('success');
    expect(Object.keys(done.runData).sort()).toEqual(['AI Agent', 'Calculator', 'Chat', 'Gemini Chat Model', 'Simple Memory']);
    expect(done.runData['Gemini Chat Model']).toHaveLength(2);
    expect(done.runData.Calculator![0]!.data.main[0]![0]!.json).toMatchObject({ tool: 'calculator', input: { expression: '19.8 * 9 / 5 + 32' } });
  });

  it('Telegram AI assistant: the agent answers in the chat that asked, with one memory per chat', async () => {
    await credential('Gemini', 'googlePalmApi', { apiKey: 'AIzaSy-example-key-123456', host: gemini.url });
    await credential('Bot', 'telegramApi', { accessToken: TG_TOKEN, baseUrl: telegram.url });
    const wf = useWeatherMock(await importExample('telegram-ai-assistant'));
    expect((await activate(agent, wf.id)).status, 'activation').toBe(200);

    gemini.enqueue(functionCallReply([{ name: 'get_weather', args: { city: 'Paris', days: 2 } }]), answer('Paris: partly cloudy, take a light jacket.'), answer('Hello! How can I help?'));
    telegram.push(textUpdate('Do I need a jacket in Paris?', { chat: 501 }));
    const reply = await waitFor(() => telegram.calls('sendMessage')[0], 8000, 'agent reply');
    expect(reply.body).toMatchObject({ chat_id: '501', text: 'Paris: partly cloudy, take a light jacket.' });
    expect(partsOf(gemini.calls[1]!).at(-1)!.parts[0]!.functionResponse!.response.location).toBe('Paris, France');

    // Another chat has its own (empty) memory.
    telegram.push(textUpdate('Hi', { chat: 502 }));
    const other = await waitFor(() => telegram.calls('sendMessage')[1], 8000, 'second chat reply');
    expect(other.body).toMatchObject({ chat_id: '502', text: 'Hello! How can I help?' });
    expect(partsOf(gemini.calls[2]!).map((c) => c.parts[0]!.text)).toEqual(['Hi']);
    expect(t.ctx.chatMemory.count(`${wf.id}:501`)).toBe(2);
    expect(t.ctx.chatMemory.count(`${wf.id}:502`)).toBe(2);
  });
});

