import { strings } from '../strings';

export interface CardReportAuth {
  uid: string | null;
  isAnonymous: boolean;
  /** Account email, attached to the report by us — never typed by the sender. */
  email: string | null;
}

export interface ValidCardReport {
  cardId: string;
  contact: string;
}

function isEmailShape(value: string): boolean {
  return value.length <= 254 && /.+@.+\..+/.test(value);
}

/**
 * Client mirror of the firestore.rules cardReports guards (plus the auth
 * gate). Rules remain the authority; this only shapes the form before sending.
 */
export function validateCardReport(
  cardId: unknown,
  auth: CardReportAuth,
): { ok: true; value: ValidCardReport } | { ok: false; message: string } {
  if (!auth.uid || auth.isAnonymous) {
    return { ok: false, message: strings.report.signinPrompt };
  }
  if (typeof cardId !== 'string' || cardId.length < 1 || cardId.length > 128) {
    return { ok: false, message: strings.report.errSubmit };
  }
  const contact = (auth.email ?? '').trim();
  if (!isEmailShape(contact)) {
    return { ok: false, message: strings.report.errNoEmail };
  }
  return { ok: true, value: { cardId, contact } };
}
