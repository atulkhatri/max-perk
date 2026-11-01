import { strings } from '../strings';

export type FeedbackKind = 'feature' | 'bug' | 'correction';

export interface FeedbackInput {
  kind: string;
  text: string;
  contact: string;
}

export interface FeedbackAuth {
  uid: string | null;
  isAnonymous: boolean;
}

export interface ValidFeedback {
  kind: FeedbackKind;
  text: string;
  contact?: string;
}

function isEmailShape(value: string): boolean {
  return value.length <= 254 && /.+@.+\..+/.test(value);
}

/**
 * Client mirror of the firestore.rules feedback guards (plus the auth gate).
 * Rules remain the authority; this only shapes the form before sending.
 */
export function validateFeedback(
  input: FeedbackInput,
  auth: FeedbackAuth,
): { ok: true; value: ValidFeedback } | { ok: false; message: string } {
  if (!auth.uid || auth.isAnonymous) {
    return { ok: false, message: strings.settings.feedback.errSignin };
  }
  if (input.kind !== 'feature' && input.kind !== 'bug' && input.kind !== 'correction') {
    return { ok: false, message: strings.settings.feedback.errKind };
  }
  const text = input.text.trim();
  if (text.length < 10) {
    return { ok: false, message: strings.settings.feedback.errTooShort };
  }
  if (text.length > 2000) {
    return { ok: false, message: strings.settings.feedback.errTooLong };
  }
  const contact = input.contact.trim();
  if (contact !== '' && !isEmailShape(contact)) {
    return { ok: false, message: strings.settings.feedback.errEmail };
  }
  return { ok: true, value: { kind: input.kind, text, ...(contact === '' ? {} : { contact }) } };
}
