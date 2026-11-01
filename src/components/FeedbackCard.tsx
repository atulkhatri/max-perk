import { useState, type ReactElement } from 'react';
import { useAuth } from '../auth/AuthContext';
import { submitFeedback } from '../feedback/submitFeedback';
import { validateFeedback } from '../feedback/validateFeedback';
import { db } from '../firebase';
import { strings } from '../strings';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from './ui/toaster';

const DAY_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 30 * 1000;
const SENDS_KEY = 'feedback-sends';

function recentSends(now: number): number[] {
  try {
    const raw = localStorage.getItem(SENDS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter((t): t is number => typeof t === 'number' && now - t < DAY_MS);
  } catch {
    return [];
  }
}

/** Feedback form for signed-in (non-guest) users; guests get a sign-in prompt. */
export function FeedbackCard(): ReactElement {
  const { user, isGuest } = useAuth();
  const [kind, setKind] = useState('feature');
  const [text, setText] = useState('');
  const [contact, setContact] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = strings.settings.feedback;

  if (isGuest || !user) {
    return (
      <Card className="p-[18px]">
        <h2 className="text-[17px] font-bold">{t.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.signinPrompt}</p>
      </Card>
    );
  }

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const now = Date.now();
    const sends = recentSends(now);
    if (sends.length >= 5 || (sends.length > 0 && now - sends[sends.length - 1] < COOLDOWN_MS)) {
      setError(t.errRateLimited);
      return;
    }
    const checked = validateFeedback({ kind, text, contact }, { uid: user.uid, isAnonymous: user.isAnonymous });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitFeedback(db, user.uid, checked.value);
      localStorage.setItem(SENDS_KEY, JSON.stringify([...sends, now]));
      setText('');
      setKind('feature');
      toast({ title: t.sentTitle, description: t.sentBody });
    } catch {
      setError(strings.auth.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-[18px]">
      <h2 className="text-[17px] font-bold">{t.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
      <form className="mt-3 flex flex-col gap-3" onSubmit={(e) => void submit(e)}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="feedback-kind">{t.kindLabel}</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger id="feedback-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="feature">{t.kindFeature}</SelectItem>
              <SelectItem value="bug">{t.kindBug}</SelectItem>
              <SelectItem value="correction">{t.kindCorrection}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="feedback-text">{t.textLabel}</Label>
          <textarea
            id="feedback-text"
            className="flex min-h-[96px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            placeholder={t.textPlaceholder}
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">{t.count.replace('{n}', String(text.length))}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="feedback-contact">{t.contactLabel}</Label>
          <Input
            id="feedback-contact"
            type="email"
            autoComplete="email"
            placeholder={t.contactPlaceholder}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
        </div>
        <p className="text-[13px] text-muted-foreground">{t.hint}</p>
        {error && <p className="text-[13px] text-destructive">{error}</p>}
        <Button type="submit" disabled={busy}>
          {t.submit}
        </Button>
      </form>
    </Card>
  );
}
