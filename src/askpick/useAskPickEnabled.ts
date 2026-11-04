import { useEffect, useState } from 'react';
import { db } from '../firebase';

/**
 * Remote kill switch for the ask-pick entry point. Defaults ON: the AI
 * section renders unless config/askPick explicitly carries enabled:false.
 * One console edit disables it with no deploy; the function re-checks too.
 */
export function useAskPickEnabled(): boolean {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    let cancelled = false;
    void db
      .then(async (firestore) => {
        const { doc, getDoc } = await import('firebase/firestore');
        const snap = await getDoc(doc(firestore, 'config', 'askPick'));
        if (!cancelled && snap.exists() && snap.get('enabled') === false) {
          setEnabled(false);
        }
      })
      .catch(() => {
        // Unreachable config must not remove the feature: stay on.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return enabled;
}
