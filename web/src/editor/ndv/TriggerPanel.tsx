import { useEffect, useState } from 'react';
import { Check, Copy, Play, Radio, Square } from 'lucide-react';
import type { NodeTypeInfo } from '@flowforge/shared';
import { Button } from '../../components/ui/Button';
import { listenForTestEvent, stopListening } from '../actions';
import { useEditor } from '../store';

function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.round((Date.parse(until) - now) / 1000));
  return <span className="tabular-nums">{left}s</span>;
}

export function CopyText({ text, testId }: { text: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-line bg-panel-2 px-2 py-1.5">
      <code className="min-w-0 flex-1 truncate font-mono text-[12px]" data-testid={testId} title={text}>
        {text}
      </code>
      <button
        type="button"
        title="Copy"
        onClick={() =>
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
        className="rounded p-1 text-subtle hover:bg-panel-3 hover:text-fg"
      >
        {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
      </button>
    </div>
  );
}

/** Shown in the OUTPUT panel of trigger nodes that have no data yet. */
export function TriggerPanel({ nodeName, type }: { nodeName: string; type: NodeTypeInfo }) {
  const listening = useEditor((s) => (s.listening?.nodeName === nodeName ? s.listening : null));
  const kind = type.trigger?.kind ?? 'manual';

  if (listening) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center" data-testid="trigger-listening">
        <Radio size={28} className="animate-pulse text-accent-hover" />
        <div className="text-[14px] font-medium">Listening for a test event…</div>
        {listening.testUrl ? (
          <div className="flex w-full max-w-md flex-col gap-1.5 text-left">
            <span className="text-[12px] text-subtle">Call this URL ({listening.method}) — it works once:</span>
            <CopyText text={listening.testUrl} testId="test-url" />
            <code className="rounded bg-panel-2 px-2 py-1 font-mono text-[11.5px] text-muted">
              curl -X {listening.method?.split(',')[0] ?? 'GET'} {listening.testUrl}
            </code>
          </div>
        ) : (
          <div className="text-[12.5px] text-muted">Waiting for the next event of "{nodeName}".</div>
        )}
        {listening.expiresAt && (
          <div className="text-[12px] text-subtle">
            Stops in <Countdown until={listening.expiresAt} />
          </div>
        )}
        <Button size="sm" variant="secondary" icon={<Square size={13} />} onClick={() => void stopListening()} data-testid="stop-listening">
          Stop listening
        </Button>
      </div>
    );
  }

  const listens = kind === 'webhook' || kind === 'listener';
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-[12.5px] text-subtle">
      {listens
        ? 'Start listening, then trigger the event (call the URL, add a file…). The workflow runs once with that data.'
        : kind === 'poll'
          ? 'Fetch the newest item now to see what this trigger outputs.'
          : 'Run this trigger now to see what it outputs.'}
      <Button size="sm" icon={listens ? <Radio size={14} /> : <Play size={14} />} onClick={() => void listenForTestEvent(nodeName)} data-testid="listen-test-event">
        {listens ? 'Listen for test event' : 'Fetch test event'}
      </Button>
    </div>
  );
}
