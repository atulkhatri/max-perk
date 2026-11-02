import type { Firestore } from 'firebase/firestore';
import type { ValidCardReport } from './validateCardReport';

const fx = (): Promise<typeof import('firebase/firestore')> => import('firebase/firestore');

/** File one card-data report; Firestore rules enforce shape and authorship. */
export async function submitCardReport(
  db: Promise<Firestore>,
  uid: string,
  value: ValidCardReport,
): Promise<string> {
  const [{ addDoc, collection, serverTimestamp }, firestore] = await Promise.all([fx(), db]);
  const ref = await addDoc(collection(firestore, 'cardReports'), {
    ...value,
    uid,
    status: 'new',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
