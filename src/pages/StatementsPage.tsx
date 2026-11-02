import { useMemo, useState, type ReactElement } from 'react';
import { Lock } from 'lucide-react';
import { Cell, Pie, PieChart } from 'recharts';
import { formatCAD } from '../format';
import { useCatalog } from '../data/catalogStore';
import type { EarnCategory } from '../data/types';
import {
  suggestFromStatements,
  transactionCoverageMonths,
  valueOfTransactions,
  type StatementGroup,
} from '../ranking/rank';
import { routePath } from '../router';
import { strings } from '../strings';
import { categorizeTransactions, type CategorizedTransaction } from '../statements/categorize';
import { dedupeTransactions, isAccountPayment, parseCsvTransactions, parsePdfLines, type RawTransaction } from '../statements/parse';
import { pdfToLines } from '../statements/pdf';
import { useStatementsSession } from '../statements/session';
import { useWallet } from '../wallet/useWallet';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../components/ui/chart';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const MAX_FILES = 24;
const MAX_BYTES = 5 * 1024 * 1024;

const CATEGORY_COLORS: Record<string, string> = {
  grocery: '#5f8f52',
  dining: '#c07a3f',
  gas: '#5b84a8',
  travel: '#3f8f8a',
  drugstore: '#a95d75',
  transit: '#7d8590',
  recurring: '#9a8548',
  foreign: '#6e7f99',
  other: '#9aa1a9',
};

import type { FileOutcome, UploadedFile } from '../statements/session';

const STAGES = [
  strings.statements.stageReading,
  strings.statements.stageParsing,
  strings.statements.stageCategorizing,
  strings.statements.stageScoring,
];

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 30));

export function StatementsPage(): ReactElement {
  const { cardIds, loading } = useWallet();
  const { catalog, loading: catalogLoading } = useCatalog();
  const { files, setFiles, takeId, phase, setPhase, outcomes, setOutcomes, results, setResults } =
    useStatementsSession();
  const [notice, setNotice] = useState<string | null>(null);
  const [stage, setStage] = useState(0);

  const ownedCards = useMemo(() => catalog.cards.filter((c) => cardIds.includes(c.id)), [catalog, cardIds]);
  const bestStmtOwned = useMemo(() => {
    if (!results) return null;
    const entry = Object.entries(results.ownValues).sort((a, b) => b[1] - a[1])[0];
    const card = entry ? catalog.cards.find((c) => c.id === entry[0]) : undefined;
    return entry && card ? { card, value: entry[1] } : null;
  }, [results, catalog]);

  if (loading || catalogLoading)
    return <p className="text-sm text-muted-foreground">{strings.common.loading}</p>;

  if (cardIds.length === 0) {
    return (
      <div className="flex flex-col gap-3.5">
        <h1 className="font-display mt-0.5 text-[32px] leading-[1.1] font-bold tracking-tight">
          {strings.statements.title}
        </h1>
        <Card className="p-[18px]">
          <h2 className="text-[17px] font-bold">{strings.check.noWalletTitle}</h2>
          <p className="mt-1 mb-3 text-sm text-muted-foreground">{strings.check.noWalletBody}</p>
          <Button size="sm" asChild>
            <a href={routePath('wallet')} className="no-underline">
              {strings.check.goToWallet}
            </a>
          </Button>
        </Card>
      </div>
    );
  }

  const addFiles = (list: FileList | null): void => {
    if (!list) return;
    setNotice(null);
    const picked = [...list];
    if (files.length + picked.length > MAX_FILES) {
      setNotice(strings.statements.errTooMany);
      return;
    }
    const accepted: UploadedFile[] = [];
    for (const file of picked) {
      const lower = file.name.toLowerCase();
      if (!lower.endsWith('.pdf') && !lower.endsWith('.csv')) continue;
      if (file.size > MAX_BYTES) {
        setNotice(`${file.name} ${strings.statements.errTooBig}`);
        continue;
      }
      accepted.push({ id: takeId(), file, cardId: cardIds[0] });
    }
    setFiles((current) => [...current, ...accepted]);
  };

  // Attributed cards can leave the wallet mid-session; fall back to the first owned card.
  const validCardId = (cardId: string): string =>
    ownedCards.some((c) => c.id === cardId) ? cardId : cardIds[0];

  const runAnalysis = async (): Promise<void> => {
    setPhase('analyzing');
    setStage(0);
    setOutcomes([]);
    setNotice(null);
    const attributed = files.map((f) => ({ ...f, cardId: validCardId(f.cardId) }));
    // Stage 0: read bytes.
    const raws: { id: number; name: string; cardId: string; kind: 'pdf' | 'csv'; data: ArrayBuffer }[] = [];
    for (const f of attributed) {
      try {
        raws.push({
          id: f.id,
          name: f.file.name,
          cardId: f.cardId,
          kind: f.file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'csv',
          data: await f.file.arrayBuffer(),
        });
      } catch {
        setOutcomes((o) => [...o, { id: f.id, name: f.file.name, ok: false, detail: strings.statements.errUnreadable }]);
      }
      await tick();
    }
    // Stage 1: parse to transactions.
    setStage(1);
    const parsed: { id: number; name: string; cardId: string; txns: RawTransaction[]; error?: string }[] = [];
    for (const r of raws) {
      if (r.kind === 'pdf') {
        const pdf = await pdfToLines(r.data);
        if (pdf.error === 'password') parsed.push({ ...r, txns: [], error: strings.statements.errPassword });
        else if (pdf.error === 'scanned') parsed.push({ ...r, txns: [], error: strings.statements.errScanned });
        else if (pdf.error) parsed.push({ ...r, txns: [], error: strings.statements.errUnreadable });
        else parsed.push({ ...r, txns: parsePdfLines(pdf.lines ?? []).transactions });
      } else {
        parsed.push({ ...r, txns: parseCsvTransactions(new TextDecoder().decode(r.data)).transactions });
      }
      await tick();
    }
    // Stage 2: dedupe across files, then categorize per attributed card.
    setStage(2);
    await tick();
    const seen = new Set<string>();
    const groups = new Map<string, CategorizedTransaction[]>();
    const done: FileOutcome[] = [];
    let excluded = 0;
    for (const p of parsed) {
      if (p.error) {
        done.push({ id: p.id, name: p.name, ok: false, detail: p.error });
        continue;
      }
      const fresh = dedupeTransactions(p.txns).filter((t) => {
        const key = `${t.date}|${t.description.toLowerCase().replace(/\s+/g, ' ')}|${t.amountCAD.toFixed(2)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const spend = fresh.filter((t) => {
        const payment = isAccountPayment(t.description, t.amountCAD);
        if (payment) excluded++;
        return !payment;
      });
      const categorized = categorizeTransactions(catalog, spend);
      const list = groups.get(p.cardId) ?? [];
      list.push(...categorized);
      groups.set(p.cardId, list);
      done.push({ id: p.id, name: p.name, ok: true, detail: `${categorized.length} transactions` });
      await tick();
    }
    setOutcomes(done);
    const allTxns = [...groups.values()].flat();
    if (allTxns.length === 0) {
      setNotice(strings.statements.errNoTxns);
      setPhase('upload');
      return;
    }
    // Stage 3: score.
    setStage(3);
    await tick();
    const groupList: StatementGroup[] = [...groups.entries()].map(([cardId, txns]) => ({
      cardId,
      transactions: txns.map((t) => ({ date: t.date, amountCAD: t.amountCAD, category: t.category, merchantId: t.merchantId })),
    }));
    const suggestions = suggestFromStatements(catalog, cardIds, groupList);
    const totals = new Map<EarnCategory, number>();
    let matched = 0;
    let minDay = Number.POSITIVE_INFINITY;
    let maxDay = Number.NEGATIVE_INFINITY;
    for (const t of allTxns) {
      totals.set(t.category, (totals.get(t.category) ?? 0) + t.amountCAD);
      if (t.matched) matched++;
      const day = Date.parse(`${t.date}T00:00:00Z`);
      if (Number.isFinite(day)) {
        minDay = Math.min(minDay, day);
        maxDay = Math.max(maxDay, day);
      }
    }
    const months = transactionCoverageMonths(
      allTxns.map((t) => ({ date: t.date, amountCAD: t.amountCAD, category: t.category })),
    );
    const days = Number.isFinite(minDay) ? Math.max(1, Math.round((maxDay - minDay) / 86400000) + 1) : months * 30;
    const cardNames: Record<string, string> = {};
    const ownValues: Record<string, number> = {};
    for (const [cardId, txns] of groups) {
      const card = catalog.cards.find((c) => c.id === cardId);
      if (!card) continue;
      cardNames[cardId] = card.name;
      ownValues[cardId] = valueOfTransactions(
        catalog,
        card,
        txns.map((t) => ({ date: t.date, amountCAD: t.amountCAD, category: t.category, merchantId: t.merchantId })),
      );
    }
    const categoryTotals = [...totals.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
    const unmatched = allTxns.filter((t) => !t.matched);
    setResults({
      suggestions,
      categoryTotals,
      uncategorized: unmatched.length,
      uncategorizedTotal: unmatched.reduce((sum, t) => sum + t.amountCAD, 0),
      paymentsExcluded: excluded,
      txnCount: allTxns.length,
      matchedPct: Math.round((matched / allTxns.length) * 100),
      months,
      days,
      cardNames,
      ownValues,
    });
    setPhase('results');
  };

  const feeNote = (annualValueCAD: number, annualFeeCAD: number): string =>
    annualFeeCAD === 0
      ? strings.suggest.noAnnualFee
      : strings.suggest.afterFeeNote
          .replace('{value}', formatCAD(annualValueCAD - annualFeeCAD, 0))
          .replace('{fee}', formatCAD(annualFeeCAD, 0));

  const chartData = (results?.categoryTotals ?? [])
    .filter((c) => c.total > 0)
    .map((c) => ({ key: c.category, name: strings.categories[c.category], value: Math.round(c.total * 100) / 100 }));
  const chartConfig: ChartConfig = Object.fromEntries(
    chartData.map((d) => [d.key, { label: d.name, color: CATEGORY_COLORS[d.key] ?? '#9aa1a9' }]),
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display mt-0.5 text-[32px] leading-[1.1] font-bold tracking-tight">
        {strings.statements.title}
      </h1>

      <Card className="p-[18px]">
        <h2 className="flex items-center gap-2 text-[17px] font-bold">
          <Lock className="size-4 flex-none" aria-hidden="true" />
          {strings.statements.privacyTitle}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{strings.statements.privacyBody}</p>
      </Card>

      {phase !== 'results' && (
        <Card className="p-[18px]">
          <h2 className="text-[17px] font-bold">{strings.statements.uploadTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{strings.statements.uploadBody}</p>
          <div className="mt-3 flex flex-col gap-1.5">
            <Label htmlFor="statement-files">{strings.statements.uploadTitle}</Label>
            <Input
              id="statement-files"
              type="file"
              accept=".pdf,.csv"
              multiple
              disabled={phase === 'analyzing'}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          {notice && <p className="mt-2 text-[13px] text-destructive">{notice}</p>}
          {files.map((f) => {
            const outcome = outcomes.find((o) => o.id === f.id);
            return (
              <div key={f.id} className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
                <div className="flex items-center justify-between gap-2.5">
                  <span className="truncate text-sm font-semibold">{f.file.name}</span>
                  {phase === 'upload' && (
                    <Button
                      variant="link"
                      size="sm"
                      type="button"
                      className="flex-none px-0"
                      onClick={() => setFiles((current) => current.filter((x) => x.id !== f.id))}
                    >
                      {strings.statements.removeFile}
                    </Button>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`statement-card-${f.id}`}>{strings.statements.fileFor}</Label>
                  <Select
                    value={validCardId(f.cardId)}
                    disabled={phase === 'analyzing'}
                    onValueChange={(value) =>
                      setFiles((current) => current.map((x) => (x.id === f.id ? { ...x, cardId: value } : x)))
                    }
                  >
                    <SelectTrigger id={`statement-card-${f.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ownedCards.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {outcome && (
                  <p className={outcome.ok ? 'text-[13px] text-muted-foreground' : 'text-[13px] text-destructive'}>
                    {outcome.detail}
                  </p>
                )}
              </div>
            );
          })}
          {phase === 'upload' ? (
            <Button
              type="button"
              className="mt-4"
              disabled={files.length === 0}
              onClick={() => void runAnalysis()}
            >
              {strings.statements.analyze}
            </Button>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <ol className="m-0 flex flex-col gap-2 p-0">
                {STAGES.map((label, i) => (
                  <li key={label} className="flex list-none items-center gap-2.5 text-sm">
                    <span
                      aria-hidden="true"
                      className={
                        i < stage
                          ? 'size-2.5 flex-none rounded-full bg-primary'
                          : i === stage
                            ? 'size-2.5 flex-none rounded-full bg-primary motion-safe:animate-pulse'
                            : 'size-2.5 flex-none rounded-full bg-muted-foreground/30'
                      }
                    />
                    <span className={i <= stage ? 'font-semibold' : 'text-muted-foreground'}>{label}</span>
                  </li>
                ))}
              </ol>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={STAGES.length}
                aria-valuenow={stage + 1}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${((stage + 1) / STAGES.length) * 100}%` }}
                />
              </div>
              <p className="text-[13px] text-muted-foreground">{strings.statements.keepOpen}</p>
            </div>
          )}
        </Card>
      )}

      {phase === 'results' && results && (
        <>
          <Card className="p-[18px]">
            <h2 className="text-[17px] font-bold">{strings.statements.spendChartTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {strings.statements.coverageLine
                .replace('{n}', String(results.txnCount))
                .replace('{m}', String(results.months))
                .replace('{k}', String(results.matchedPct))}
            </p>
            {results.days < 28 && (
              <p className="mt-1 text-[13px] text-muted-foreground">{strings.statements.thinData}</p>
            )}
            {results.paymentsExcluded > 0 && (
              <p className="mt-1 text-[13px] text-muted-foreground">
                {strings.statements.paymentsExcluded.replace('{n}', String(results.paymentsExcluded))}
              </p>
            )}
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <ChartContainer config={chartConfig}>
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} animationDuration={0} />
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={88}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {chartData.map((d) => (
                      <Cell key={d.key} fill={`var(--color-${d.key})`} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <ul className="m-0 flex flex-col gap-1.5 p-0">
                {results.categoryTotals
                  .filter((c) => c.total !== 0)
                  .map((c) => (
                    <li key={c.category} className="flex list-none items-center gap-2 text-sm">
                      <span
                        aria-hidden="true"
                        className="size-2.5 flex-none rounded-full"
                        style={{ backgroundColor: CATEGORY_COLORS[c.category] ?? '#9aa1a9' }}
                      />
                      <span className="text-muted-foreground">{strings.categories[c.category]}</span>
                      <span className="ml-auto font-bold tabular-nums">{formatCAD(c.total, 0)}</span>
                    </li>
                  ))}
                {results.uncategorized > 0 && (
                  <li className="flex list-none items-center gap-2 text-sm">
                    <span aria-hidden="true" className="size-2.5 flex-none rounded-full bg-muted-foreground/40" />
                    <span className="text-muted-foreground">
                      {strings.statements.uncategorizedLabel} ({results.uncategorized})
                    </span>
                    <span className="ml-auto font-bold tabular-nums">{formatCAD(results.uncategorizedTotal, 0)}</span>
                  </li>
                )}
              </ul>
            </div>
          </Card>

          {bestStmtOwned && (
            <Card className="border-transparent bg-winner p-4 text-winner-foreground shadow-md">
              <div className="flex items-center justify-between gap-2.5">
                <div>
                  <div className="text-[13px] font-bold tracking-wide uppercase opacity-80">
                    {strings.suggest.closestTitle}
                  </div>
                  <div className="mt-0.5 text-[16px] font-bold tracking-tight">
                    {bestStmtOwned.card.name} · {formatCAD(bestStmtOwned.value, 0)}
                    {strings.suggest.perYear}
                  </div>
                  <div className="mt-0.5 text-[13px] opacity-80">
                    {feeNote(bestStmtOwned.value, bestStmtOwned.card.annualFeeCAD)}
                  </div>
                </div>
                <span className="flex-none rounded-full bg-winner-foreground px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-winner">
                  {strings.suggest.ownedBadge}
                </span>
              </div>
            </Card>
          )}
          <h2 className="mt-2 text-[13px] font-bold tracking-wide text-muted-foreground uppercase">
            {strings.statements.picksTitle}
          </h2>
          {results.suggestions.length === 0 && (
            <Card className="p-[18px]">
              <p className="text-sm text-muted-foreground">{strings.statements.noPicks}</p>
            </Card>
          )}
          {results.suggestions.map((s) => (
            <Card key={`${s.forCardId}-${s.card.id}`} className="p-[18px]">
              <div className="text-[16px] font-bold tracking-tight">{s.card.name}</div>
              <div className="mt-0.5 text-[13px] text-muted-foreground">
                {s.card.issuer} · {s.card.network} ·{' '}
                {s.card.annualFeeCAD === 0
                  ? strings.common.free
                  : `${formatCAD(s.card.annualFeeCAD)}${strings.wallet.feePerYear}`}
              </div>
              <div className="mt-3 grid grid-cols-2 border-t border-border pt-2.5">
                <div className="py-0.5 pr-3">
                  <div className="text-xs font-semibold text-muted-foreground">
                    {strings.suggest.totalValue}
                    {strings.suggest.perYear}
                  </div>
                  <div className="font-display text-[28px] leading-[1.2] tracking-tight tabular-nums">
                    {formatCAD(s.annualValueCAD, 0)}
                  </div>
                </div>
                <div className="border-l border-border py-0.5 pl-3">
                  <div className="text-xs font-semibold text-muted-foreground">
                    {strings.suggest.extraValue}
                    {strings.suggest.perYear}
                  </div>
                  <div className="font-display text-[28px] leading-[1.2] tracking-tight tabular-nums">
                    +{formatCAD(s.incrementalCAD, 0)}
                  </div>
                </div>
              </div>
              <div className="mt-2 border-t border-border pt-2 text-[13px] text-muted-foreground">
                <div>{feeNote(s.annualValueCAD, s.card.annualFeeCAD)}</div>
                <div className="mt-1">
                  {strings.statements.yourCardLine
                    .replace('{card}', results.cardNames[s.forCardId] ?? s.forCardId)
                    .replace('{value}', formatCAD(s.bestOwnedAnnualCAD, 0))}
                </div>
                <div className="mt-1">
                  {strings.statements.wouldEarnLine
                    .replace('{card}', s.card.name)
                    .replace('{value}', formatCAD(s.annualValueCAD, 0))
                    .replace('{extra}', formatCAD(s.incrementalCAD, 0))}
                </div>
              </div>
            </Card>
          ))}

          <Button
            variant="secondary"
            type="button"
            className="self-start"
            onClick={() => {
              setResults(null);
              setOutcomes([]);
              setPhase('upload');
            }}
          >
            {strings.statements.backToUpload}
          </Button>
        </>
      )}
    </div>
  );
}
