import type { ReactElement } from 'react';
import { Lock } from 'lucide-react';
import { routePath } from '../router';
import { strings } from '../strings';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';

/** Compact entry to the statements sub-page. Kept separate so the Suggest
 * chunk never pulls in the PDF/chart libraries. */
export function StatementsBanner(): ReactElement {
  return (
    <Card className="p-[18px]">
      <CardContent className="flex flex-col gap-2 p-0 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-[17px] font-bold">{strings.suggest.statementsBannerTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{strings.suggest.statementsBannerBody}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Lock className="size-3.5 flex-none" aria-hidden="true" />
            {strings.suggest.statementsBannerPrivacy}
          </p>
        </div>
        <Button size="sm" asChild className="flex-none sm:ml-auto">
          <a href={routePath('statements')} className="no-underline">
            {strings.suggest.statementsBannerAction}
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
