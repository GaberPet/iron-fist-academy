import { Fragment } from 'react';
import type { Dir, TekkenButton } from '../../types';
import { parseNotation, type InputStep } from '../../core/notation';
import { DIR_ARROW, type PadButton, PAD_LABEL } from '../../core/input';
import { useStore } from '../store';

const PAD_CLASS: Partial<Record<PadButton, [string, string]>> = {
  square: ['sq', '□'], triangle: ['tr', '△'], cross: ['cr', '✕'], circle: ['ci', '○'],
};

/** Which physical button presses Tekken button `b` alone, per the user's mapping. */
export function usePadFor(): (b: TekkenButton) => PadButton | null {
  const { settings } = useStore();
  return (b) => {
    for (const [pad, tk] of Object.entries(settings.controller.tekken) as [PadButton, TekkenButton[]][]) {
      if (tk?.length === 1 && tk[0] === b) return pad;
    }
    return null;
  };
}

export function ButtonGlyph({ b, title }: { b: TekkenButton; title?: string }) {
  const padFor = usePadFor();
  const pad = padFor(b);
  const cls = pad ? PAD_CLASS[pad] : undefined;
  if (cls) return <span className={`pbtn ${cls[0]}`} title={title ?? `${b} = ${PAD_LABEL[pad!]}`}>{cls[1]}</span>;
  return <span className="pbtn other" title={`Tekken button ${b}${pad ? ` (${PAD_LABEL[pad]})` : ' (unmapped)'}`}>{pad ? PAD_LABEL[pad] : b}</span>;
}

export function DirGlyph({ d, hold }: { d: Dir; hold?: boolean }) {
  return (
    <span className={`dir ${hold ? 'hold' : ''} ${d === 'n' ? 'n' : ''}`} title={`${hold ? 'Hold ' : ''}${d}`}>
      {DIR_ARROW[d]}
    </span>
  );
}

export function StepGlyphs({ step }: { step: InputStep }) {
  if (step.kind === 'marker') return <>{step.marker}</>;
  const motion = step.motion;
  return (
    <>
      {motion.map((m, i) => (
        <DirGlyph key={i} d={m.dir} hold={m.hold} />
      ))}
      {step.buttons.map((b, i) => (
        <Fragment key={b}>
          {(i > 0 || motion.length > 0) && <span className="plus">+</span>}
          <ButtonGlyph b={b} />
        </Fragment>
      ))}
      {step.holdButton && <span className="plus">hold</span>}
    </>
  );
}

export type StepState = 'done' | 'cur' | 'fail' | 'hidden' | undefined;

export function StepChip({ step, state, showText = true }: { step: InputStep; state?: StepState; showText?: boolean }) {
  const cls = ['nstep', state ?? '', step.kind === 'marker' ? 'marker' : '', step.optional ? 'optional' : ''].join(' ');
  if (state === 'hidden') return <span className={cls}>?</span>;
  return (
    <span className={cls} title={step.text}>
      <StepGlyphs step={step} />
      {showText && step.kind !== 'marker' && <span className="ntext">{step.text}</span>}
    </span>
  );
}

/** Render a notation string as PlayStation icons + notation; falls back to plain text. */
export function NotationView({ notation, big, showText = true }: { notation: string; big?: boolean; showText?: boolean }) {
  let steps: InputStep[];
  try {
    steps = parseNotation(notation);
  } catch {
    return <code>{notation}</code>;
  }
  return (
    <span className={`notation ${big ? 'big' : ''}`}>
      {steps.map((s, i) => (
        <StepChip key={i} step={s} showText={showText} />
      ))}
    </span>
  );
}
