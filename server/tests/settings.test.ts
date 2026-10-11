import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { capturingLogger, makeTestApp, OWNER, type TestApp } from './helpers.js';
import { chain, node, signedIn, type Agent } from './trigger-helpers.js';

let t: TestApp | undefined;
afterEach(async () => {
  await t?.close();
  t = undefined;
});

const runCommand = async (agent: Agent, command = 'echo from-flowforge') => {
  const nodes = [node('Start', 'manualTrigger'), node('Shell', 'executeCommand', { command })];
  return (await agent.post('/api/dev/run').send({ name: 'Shell', nodes, connections: chain('Start', 'Shell') })).body as {
    status: string;
    output: Array<Array<Record<string, unknown>>>;
    error?: { message: string; hint?: string; description?: string };
  };
};

describe('instance settings', () => {
  it('needs a session; Execute Command is off by default', async () => {
    t = await makeTestApp();
    expect((await request(t.app).get('/api/settings')).status).toBe(401);
    expect((await request(t.app).patch('/api/settings').send({ executeCommandEnabled: true })).status).toBe(401);
    const agent = await signedIn(t);
    expect((await agent.get('/api/settings')).body).toEqual({ executeCommandEnabled: false });
  });

  it('only known settings with the right type are accepted', async () => {
    t = await makeTestApp();
    const agent = await signedIn(t);
    expect((await agent.patch('/api/settings').send({ executeCommandEnabled: 'yes' })).status).toBe(400);
    expect((await agent.patch('/api/settings').send({ somethingElse: true })).status).toBe(400);
    expect((await agent.patch('/api/settings').send({})).body).toEqual({ executeCommandEnabled: false });
    expect((await agent.get('/api/settings')).body).toEqual({ executeCommandEnabled: false });
  });

  it('the toggle is the only way to enable the Execute Command node; it survives a restart and is logged', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ff-data-'));
    const dbFile = join(dir, 'flowforge.db');
    const logger = capturingLogger();
    t = await makeTestApp({ dataDir: dir }, { dbFile, logger });
    const agent = await signedIn(t);

    const blocked = await runCommand(agent);
    expect(blocked.status).toBe('error');
    expect(blocked.error).toMatchObject({
      message: 'The Execute Command node is disabled',
      description: 'It runs shell commands on the computer where FlowForge is installed, so it is off by default.',
      hint: 'An administrator can turn it on in Settings → Security → "Allow the Execute Command node".',
    });

    expect((await agent.patch('/api/settings').send({ executeCommandEnabled: true })).body).toEqual({ executeCommandEnabled: true });
    expect(logger.lines.some((l) => l.startsWith('warn') && l.includes('Execute Command node ENABLED'))).toBe(true);
    const allowed = await runCommand(agent);
    expect(allowed.status).toBe('success');
    expect(allowed.output).toEqual([[{ exitCode: 0, stdout: 'from-flowforge', stderr: '' }]]);

    // Restart on the same database: still enabled.
    await t.close();
    t = await makeTestApp({ dataDir: dir }, { dbFile });
    const again = request.agent(t.app);
    await again.post('/api/auth/login').send({ email: OWNER.email, password: OWNER.password });
    expect((await again.get('/api/settings')).body).toEqual({ executeCommandEnabled: true });
    expect((await runCommand(again)).status).toBe('success');

    // Switching it off takes effect at once.
    await again.patch('/api/settings').send({ executeCommandEnabled: false });
    expect((await runCommand(again)).error?.message).toBe('The Execute Command node is disabled');
  });

  it('no environment variable or node parameter can enable it', async () => {
    t = await makeTestApp({}, { env: { FLOWFORGE_EXECUTE_COMMAND: 'true', EXECUTE_COMMAND_ENABLED: 'true' } });
    const agent = await signedIn(t);
    const nodes = [node('Start', 'manualTrigger'), node('Shell', 'executeCommand', { command: 'echo x', executeCommandEnabled: true, options: { enabled: true } })];
    const res = (await agent.post('/api/dev/run').send({ name: 'Shell', nodes, connections: chain('Start', 'Shell') })).body as { error?: { message: string } };
    expect(res.error?.message).toBe('The Execute Command node is disabled');
  });
});
