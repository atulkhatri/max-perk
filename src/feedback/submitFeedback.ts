import type { Firestore } from 'firebase/firestore';
import type { ValidFeedback } from './validateFeedback';

const fx = (): Promise<typeof import('firebase/firestore')> => import('firebase/firestore');

/** File one feedback report; Firestore rules enforce shape and authorship. */
export async function submitFeedback(
  db: Promise<Firestore>,
  uid: string,
  value: ValidFeedback,
): Promise<string> {
  const [{ addDoc, collection, serverTimestamp }, firestore] = await Promise.all([fx(), db]);
  const ref = await addDoc(collection(firestore, 'feedback'), {
    ...value,
    uid,
    status: 'new',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
