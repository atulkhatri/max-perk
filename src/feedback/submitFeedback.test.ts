import { describe, expect, it, vi } from 'vitest';

const captured: unknown[] = [];
vi.mock('firebase/firestore', () => ({
  addDoc: (_col: unknown, data: unknown) => {
    captured.push(data);
    return Promise.resolve({ id: 'doc-1' });
  },
  collection: () => ({}),
  serverTimestamp: () => 'SERVER_TIME',
}));

import { submitFeedback } from './submitFeedback';
import { submitCardReport } from '../cardReports/submitCardReport';

describe('submit payload shapes (must exactly match firestore.rules key sets)', () => {
  it('feedback sends only the allowed keys with status new', async () => {
    captured.length = 0;
    const fakeDb = Promise.resolve({} as never);
    await submitFeedback(fakeDb, 'uid-1', { kind: 'bug', text: 'a long enough report', contact: 'a@example.com' });
    expect(captured).toHaveLength(1);
    const data = captured[0] as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(['contact', 'createdAt', 'kind', 'status', 'text', 'uid']);
    expect(data['status']).toBe('new');
    expect(data['uid']).toBe('uid-1');
    expect(data['contact']).toBe('a@example.com');
  });

  it('card report sends only the allowed keys with status new', async () => {
    captured.length = 0;
    const fakeDb = Promise.resolve({} as never);
    await submitCardReport(fakeDb, 'uid-2', { cardId: 'amex-cobalt', contact: 'b@example.com' });
    expect(captured).toHaveLength(1);
    const data = captured[0] as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(['cardId', 'contact', 'createdAt', 'status', 'uid']);
    expect(data['status']).toBe('new');
  });
});
