import { strings } from '../strings';

/** Maps the askPick backend error code to a short user-facing line. */
export function askPickErrorMessage(code: string): string {
  switch (code) {
    case 'disabled':
      return strings.askPick.errDisabled;
    case 'rate_limited':
      return strings.askPick.errRateLimited;
    case 'invalid':
      return strings.askPick.errInvalid;
    default:
      return strings.askPick.errModel;
  }
}
