// Pure-function tests for the issuer-page checker (no network).
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffSnapshots, extractSignals, htmlToTextLines, robotsAllows } from './fetch-issuer-pages.mjs';

const SAMPLE = `<!doctype html><html><head><title>Sample Cash Back Card | Test Bank</title>
<script>var x = 1;</script><style>.a{color:red}</style></head>
<body><h1>Sample Cash Back Card</h1>
<p>Annual fee: $120 per year. Additional cards $50.</p>
<p>Earn 5% cash back on groceries and 2% on gas.</p>
<p>Earn 1 point for every $1 spent elsewhere.</p>
<p>A 2.5% foreign transaction fee applies to converted amounts.</p>
<script type="application/ld+json">{"@type":"CreditCard","name":"Sample"}</script>
</body></html>`;

describe('htmlToTextLines', () => {
  it('strips scripts and tags deterministically', () => {
    const lines = htmlToTextLines(SAMPLE);
    expect(lines).toContain('Annual fee: $120 per year. Additional cards $50.');
    expect(lines.join('\n')).not.toContain('var x');
    expect(htmlToTextLines(SAMPLE)).toEqual(lines);
  });
});

describe('html noise', () => {
  it('drops data-layer attributes containing > inside quotes', () => {
    const html = '<div data-cmp-data-layer="{&quot;a&quot;:&quot;x > y&quot;}" class="t">Annual fee $0</div>';
    expect(htmlToTextLines(html)).toEqual(['Annual fee $0']);
  });

  it('decodes numeric entities', () => {
    expect(htmlToTextLines('<p>2% cash back &#43; 0.5% elsewhere</p>')).toEqual([
      '2% cash back + 0.5% elsewhere',
    ]);
  });
});

describe('extractSignals', () => {
  it('picks fee, earn, fx and JSON-LD signals', () => {
    const s = extractSignals(SAMPLE);
    expect(s.title).toContain('Sample Cash Back Card');
    expect(s.fees).toHaveLength(1);
    expect(s.fees[0]).toContain('$120');
    expect(s.earn.some((l) => l.includes('5%'))).toBe(true);
    expect(s.fx).toHaveLength(1);
    expect(s.jsonLdTypes).toEqual(['CreditCard']);
  });

  it('is deterministic on repeat runs', () => {
    expect(extractSignals(SAMPLE)).toEqual(extractSignals(SAMPLE));
  });
});

describe('robotsAllows', () => {
  it('honours Disallow prefixes for the wildcard group', () => {
    const txt = 'User-agent: *\nDisallow: /private/\nDisallow: /tmp';
    expect(robotsAllows(txt, '/private/card').allowed).toBe(false);
    expect(robotsAllows(txt, '/public/card').allowed).toBe(true);
  });

  it('treats unreachable robots as allowed (advisory)', () => {
    expect(robotsAllows(null, '/anything').allowed).toBe(true);
  });
});

describe('diffSnapshots', () => {
  function writeMeta(dir, key, signals) {
    writeFileSync(
      join(dir, `${key}.meta.json`),
      JSON.stringify({ cardId: key, ok: true, bytes: 10, signals }),
    );
  }

  it('reports changed, unchanged and new snapshots', () => {
    const dirA = mkdtempSync(join(tmpdir(), 'snap-a-'));
    const dirB = mkdtempSync(join(tmpdir(), 'snap-b-'));
    const steady = { title: 'T', fees: ['Annual fee $0'], earn: [], fx: [], jsonLdTypes: [] };
    writeMeta(dirA, 'same', steady);
    writeMeta(dirB, 'same', steady);
    writeMeta(dirA, 'moved', steady);
    writeMeta(dirB, 'moved', { ...steady, fees: ['Annual fee $120'] });
    writeMeta(dirB, 'added', steady);

    const rows = diffSnapshots(dirA, dirB);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    expect(byKey.get('same').status).toBe('unchanged');
    expect(byKey.get('moved').status).toBe('CHANGED');
    expect(byKey.get('moved').detail).toContain('$120');
    expect(byKey.get('added').status).toBe('new');
  });
});
