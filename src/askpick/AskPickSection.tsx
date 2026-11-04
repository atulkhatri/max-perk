import { useState, type ReactElement } from 'react';
import { Sparkles, Loader2, Wand2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { strings } from '../strings';

export interface ParsedLeg {
  merchantId?: string;
  earn: string;
  context: string;
  spendCAD?: number;
}

interface AskPickSectionProps {
  onInterpret: (legs: ParsedLeg[], interpretation: string) => void;
  onManualFallback: () => void;
}

/**
 * AI entry point for card picks. Pretty by design: sparkles, gradient-free
 * solid card, one input, one action. Sends ONLY the typed sentence to the
 * backend; ranking still happens deterministically on the client.
 */
export function AskPickSection({ onInterpret, onManualFallback }: AskPickSectionProps): ReactElement {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function ask(): Promise<void> {
    const sentence = text.trim();
    if (!sentence || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const { httpsCallable } = await import('firebase/functions');
      const { getFunctionsClient } = await import('../firebase');
      const functions = await getFunctionsClient();
      const call = httpsCallable<{ text: string }, unknown>(functions, 'askPick');
      const res = await call({ text: sentence });
      const data = res.data as {
        ok?: boolean;
        legs?: ParsedLeg[];
        interpretation?: string;
        clarification?: string;
      };
      if (data?.ok && Array.isArray(data.legs) && data.legs.length > 0) {
        onInterpret(data.legs, data.interpretation ?? '');
      } else if (data?.ok && data.clarification) {
        setNotice(data.clarification);
      } else {
        onManualFallback();
      }
    } catch {
      // Offline, timeout, disabled, or rate-limited: the manual form below
      // is the fallback, so surface a one-line pointer and stay usable.
      onManualFallback();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-b from-primary/[0.07] to-transparent p-5 shadow-md">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
        <h2 className="font-display text-[19px] font-bold tracking-tight">{strings.askPick.title}</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{strings.askPick.body}</p>
      <div className="mt-3 flex flex-col gap-2">
        <Label htmlFor="askpick-text" className="sr-only">
          {strings.askPick.label}
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="askpick-text"
            type="text"
            autoComplete="off"
            maxLength={500}
            placeholder={strings.askPick.placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void ask();
            }}
          />
          <Button type="button" onClick={() => void ask()} disabled={busy || !text.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <Wand2 />}
            {strings.askPick.action}
          </Button>
        </div>
        {notice && (
          <p role="status" className="text-[13px] text-muted-foreground">
            {notice}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{strings.askPick.consent}</p>
      </div>
    </Card>
  );
}
