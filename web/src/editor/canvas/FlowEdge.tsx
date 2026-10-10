import { memo, useEffect, useRef } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { plural } from '../../lib/format';
import type { EdgeRef } from '../graph';
import { editor, isRunning, useEditor } from '../store';

const MAX_PARTICLES = 8;

/** One dot travelling along the edge. SVG animations are started explicitly when mounted. */
function Particle({ path, delay }: { path: string; delay: number }) {
  const motion = useRef<SVGAnimateMotionElement>(null);
  const fade = useRef<SVGAnimateElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      motion.current?.beginElement();
      fade.current?.beginElement();
    }, delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <circle r={3.5} fill="#ff8757" opacity={0} className="ff-particle">
      <animateMotion ref={motion} dur="0.85s" begin="indefinite" fill="remove" path={path} />
      <animate ref={fade} attributeName="opacity" values="0;1;1;0" dur="0.85s" begin="indefinite" fill="remove" />
    </circle>
  );
}

export const FlowEdge = memo(function FlowEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data } = props;
  const ref = (data as { ref?: EdgeRef; key?: string; error?: boolean } | undefined) ?? {};
  const live = useEditor((s) => (ref.key ? s.execution.edges[ref.key] : undefined));
  const running = useEditor((s) => isRunning(s.execution.status));
  const isError = ref.error === true;
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.35 });
  const stroke = selected ? 'var(--color-accent)' : live?.count ? 'var(--color-success)' : isError ? 'rgba(240,82,79,0.7)' : '#5b5b69';

  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke, strokeWidth: selected ? 2.5 : 2 }} interactionWidth={18} />
      {running && live && live.key > 0 && (
        <g key={live.key}>
          {Array.from({ length: Math.min(MAX_PARTICLES, Math.max(1, live.count)) }).map((_, i) => (
            <Particle key={i} path={path} delay={i * 90} />
          ))}
        </g>
      )}
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute flex items-center gap-1"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {live && live.count > 0 && (
            <span className="rounded-full bg-panel px-1.5 text-[10.5px] font-medium text-success" data-testid="edge-count">
              {plural(live.count, 'item')}
            </span>
          )}
          {selected && ref.ref && (
            <button
              type="button"
              title="Delete connection"
              data-testid="edge-delete"
              onClick={() => editor.disconnect([ref.ref!])}
              className="rounded border border-line-strong bg-panel-3 p-1 text-muted hover:border-danger hover:text-danger"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
