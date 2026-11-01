import { describe, expect, it, vi } from 'vitest';
import { adoptGuestSnapshot, readGuestSnapshot } from './AuthContext';
import type { WalletRepository, WalletSnapshot } from '../wallet/repository';

const GUEST = 'guest-uid';
const USER = 'user-uid';

function denied(uid: string): Error {
  const err = new Error(`permission denied reading users/${uid}`) as Error & { code: string };
  err.code = 'permission-denied';
  return err;
}

/**
 * In-memory repository that enforces owner-only access like firestore.rules:
 * reads/writes for a uid other than the currently authenticated one throw.
 * Flip `authedUid` from GUEST to USER to simulate the identity switch that
 * happens when a guest signs into a permanent account.
 */
function fakeRepo(initial: Record<string, WalletSnapshot>): WalletRepository & { authedUid: string } {
  const store = new Map<string, WalletSnapshot>(
    Object.entries(initial).map(([uid, snap]) => [uid, { ...snap, cardIds: [...snap.cardIds] }]),
  );
  const repo = {
    authedUid: GUEST,
    async subscribe(): Promise<() => void> {
      return () => {};
    },
    async addCard(): Promise<void> {},
    async removeCard(): Promise<void> {},
    async setLoyaltyUsed(): Promise<void> {},
    async setSpendProfile(): Promise<void> {},
    async readSnapshot(uid: string): Promise<WalletSnapshot> {
      if (uid !== repo.authedUid) throw denied(uid);
      const snap = store.get(uid);
      return snap ? { cardIds: [...snap.cardIds], loyaltyUsed: [...snap.loyaltyUsed] } : { cardIds: [], loyaltyUsed: [] };
    },
    async mergeSnapshot(uid: string, guest: WalletSnapshot): Promise<{ addedCards: number; addedLoyalty: number }> {
      const current = await repo.readSnapshot(uid);
      const cardIds = [...current.cardIds];
      for (const id of guest.cardIds) if (!cardIds.includes(id)) cardIds.push(id);
      const loyaltyUsed = [...current.loyaltyUsed];
      for (const id of guest.loyaltyUsed) if (!loyaltyUsed.includes(id)) loyaltyUsed.push(id);
      store.set(uid, { cardIds, loyaltyUsed });
      return {
        addedCards: cardIds.length - current.cardIds.length,
        addedLoyalty: loyaltyUsed.length - current.loyaltyUsed.length,
      };
    },
    async clearUser(uid: string): Promise<void> {
      // Rules only let an account delete its own docs; after the identity
      // switch the new account cannot delete the old guest docs.
      if (uid !== repo.authedUid) throw denied(uid);
      store.delete(uid);
    },
  };
  return repo;
}

describe('guest wallet upgrade ordering', () => {
  it('reads the guest snapshot while still authed as guest', async () => {
    const repo = fakeRepo({ [GUEST]: { cardIds: ['tangerine'], loyaltyUsed: ['scene-plus'] } });
    await expect(readGuestSnapshot(repo, GUEST)).resolves.toEqual({
      cardIds: ['tangerine'],
      loyaltyUsed: ['scene-plus'],
    });
  });

  it('merges the pre-read snapshot after the identity switch without re-reading the guest', async () => {
    const repo = fakeRepo({
      [GUEST]: { cardIds: ['amex-cobalt', 'tangerine'], loyaltyUsed: [] },
      [USER]: { cardIds: ['amex-cobalt'], loyaltyUsed: [] },
    });
    const guestSnap = await readGuestSnapshot(repo, GUEST);
    // Guest signs into the existing account: Firestore now sees USER.
    repo.authedUid = USER;
    const outcome = await adoptGuestSnapshot(repo, USER, GUEST, guestSnap);
    expect(outcome).toEqual({ mode: 'merged', addedCards: 1, addedLoyalty: 0 });
    await expect(repo.readSnapshot(USER)).resolves.toEqual({
      cardIds: ['amex-cobalt', 'tangerine'],
      loyaltyUsed: [],
    });
  });

  it('still resolves merged when guest cleanup is denied after the switch', async () => {
    const repo = fakeRepo({ [USER]: { cardIds: [], loyaltyUsed: [] } });
    const clear = vi.spyOn(repo, 'clearUser');
    repo.authedUid = USER;
    const outcome = await adoptGuestSnapshot(repo, USER, GUEST, { cardIds: ['tangerine'], loyaltyUsed: [] });
    expect(outcome).toEqual({ mode: 'merged', addedCards: 1, addedLoyalty: 0 });
    expect(clear).toHaveBeenCalledWith(GUEST);
  });

  it('reports kept when the merge adds nothing and for same-uid upgrades', async () => {
    const repo = fakeRepo({ [USER]: { cardIds: ['amex-cobalt'], loyaltyUsed: [] } });
    repo.authedUid = USER;
    await expect(
      adoptGuestSnapshot(repo, USER, GUEST, { cardIds: ['amex-cobalt'], loyaltyUsed: [] }),
    ).resolves.toEqual({ mode: 'kept' });
    const merge = vi.spyOn(repo, 'mergeSnapshot');
    await expect(adoptGuestSnapshot(repo, USER, USER, { cardIds: [], loyaltyUsed: [] })).resolves.toEqual({
      mode: 'kept',
    });
    expect(merge).not.toHaveBeenCalled();
  });
});
