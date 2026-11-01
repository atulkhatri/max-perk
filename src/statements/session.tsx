import { createContext, useContext, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { EarnCategory } from '../data/types';
import type { StatementSuggestion } from '../ranking/rank';

export interface UploadedFile {
  id: number;
  file: File;
  cardId: string;
}

export interface FileOutcome {
  id: number;
  name: string;
  ok: boolean;
  detail: string;
}

export interface StatementResults {
  suggestions: StatementSuggestion[];
  categoryTotals: { category: EarnCategory; total: number }[];
  uncategorized: number;
  uncategorizedTotal: number;
  paymentsExcluded: number;
  txnCount: number;
  matchedPct: number;
  months: number;
  days: number;
  cardNames: Record<string, string>;
  ownValues: Record<string, number>;
}

export type StatementsPhase = 'upload' | 'analyzing' | 'results';

interface StatementsSession {
  files: UploadedFile[];
  setFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  takeId: () => number;
  phase: StatementsPhase;
  setPhase: (phase: StatementsPhase) => void;
  outcomes: FileOutcome[];
  setOutcomes: React.Dispatch<React.SetStateAction<FileOutcome[]>>;
  results: StatementResults | null;
  setResults: (results: StatementResults | null) => void;
}

const Ctx = createContext<StatementsSession | null>(null);

/**
 * Statement analysis lives here — above the router — so leaving the page
 * (and coming back) keeps uploaded files and results for the session.
 * In-memory only: a reload still starts fresh, like the rest of the app.
 */
export function StatementsSessionProvider({ children }: { children: ReactNode }): ReactElement {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const nextId = useRef(1);
  const [phase, setPhase] = useState<StatementsPhase>('upload');
  const [outcomes, setOutcomes] = useState<FileOutcome[]>([]);
  const [results, setResults] = useState<StatementResults | null>(null);

  const takeId = (): number => nextId.current++;

  return (
    <Ctx.Provider value={{ files, setFiles, takeId, phase, setPhase, outcomes, setOutcomes, results, setResults }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStatementsSession(): StatementsSession {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStatementsSession must be used within StatementsSessionProvider');
  return ctx;
}
