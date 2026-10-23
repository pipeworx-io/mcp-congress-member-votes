/**
 * Pure parser for one House roll-call record (U.S. House Clerk, roll-call votes).
 * Shared by the pack (live top-up) and scripts/bake-congress-member-votes.mjs
 * so the baked table and the live path can never disagree about what a
 * position is. No I/O here.
 */

/** Y=Yea/Aye  N=Nay/No  P=Present  X=Not Voting  C=a candidate name (Speaker election; not a yes/no position) */
export type Pos = 'Y' | 'N' | 'P' | 'X' | 'C';
/** r = recorded yea/nay-type vote  q = quorum call  e = election (positions are candidate names) */
export type RollKind = 'r' | 'q' | 'e';

export interface ParsedVote {
  id: string; // bioguide
  last: string;
  party: string;
  state: string;
  pos: Pos;
  /** the Clerk's role attribute: "legislator" or "speaker" (the Speaker is listed on a roll only when voting) */
  role: string;
}

export interface ParsedRoll {
  congress: number;
  session: number;
  n: number;
  d: string; // ISO date YYYY-MM-DD
  k: RollKind;
  t: string; // vote-type as published
  l: string; // legislation number as published ('' if none)
  q: string; // vote question
  r: string; // result as published
  x: string; // description (trimmed)
  votes: ParsedVote[];
}

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

function tag(block: string, name: string): string {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? decode(m[1].trim()) : '';
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function attr(s: string, name: string): string {
  const m = new RegExp(`${name}="([^"]*)"`).exec(s);
  return m ? decode(m[1]) : '';
}

export function isoDate(s: string): string {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s);
  return m && MONTHS[m[2]] ? `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, '0')}` : s;
}

function posOf(v: string): Pos {
  const x = v.trim().toLowerCase();
  if (x === 'yea' || x === 'aye') return 'Y';
  if (x === 'nay' || x === 'no') return 'N';
  if (x === 'present') return 'P';
  if (x === 'not voting') return 'X';
  return 'C';
}

/**
 * Throws if the body is not a roll-call record (e.g. an HTML error page): a
 * parse that "succeeds" with zero votes is exactly the silent-zero class.
 */
export function parseHouseRoll(xml: string): ParsedRoll {
  if (!xml.includes('<rollcall-vote>') || !xml.includes('<vote-metadata>')) {
    throw new Error('not a House roll-call record (no <rollcall-vote>/<vote-metadata>)');
  }
  const meta = /<vote-metadata>([\s\S]*?)<vote-totals>/.exec(xml)?.[1] ?? xml.slice(0, 3000);
  const congress = Number(tag(meta, 'congress'));
  const session = tag(meta, 'session').startsWith('2') ? 2 : 1;
  const n = Number(tag(meta, 'rollcall-num'));
  if (!Number.isFinite(congress) || !Number.isFinite(n) || n < 1) throw new Error('roll-call record has no congress/roll number');

  const votes: ParsedVote[] = [];
  const re = /<recorded-vote>\s*<legislator([^>]*)>([^<]*)<\/legislator>\s*<vote>([^<]*)<\/vote>\s*<\/recorded-vote>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    votes.push({
      id: attr(m[1], 'name-id'),
      last: attr(m[1], 'unaccented-name') || decode(m[2]),
      party: attr(m[1], 'party'),
      state: attr(m[1], 'state'),
      pos: posOf(decode(m[3])),
      role: attr(m[1], 'role') || 'legislator',
    });
  }
  const declared = (xml.match(/<recorded-vote>/g) ?? []).length;
  if (votes.length === 0 || votes.length !== declared) {
    throw new Error(`roll ${n}: parsed ${votes.length} of ${declared} recorded votes`);
  }
  const type = tag(meta, 'vote-type');
  const k: RollKind = /quorum/i.test(type) ? 'q' : votes.some((v) => v.pos === 'C') ? 'e' : 'r';
  return {
    congress,
    session,
    n,
    d: isoDate(tag(meta, 'action-date')),
    k,
    t: type,
    l: tag(meta, 'legis-num'),
    q: tag(meta, 'vote-question'),
    r: tag(meta, 'vote-result'),
    x: tag(meta, 'vote-desc').slice(0, 240),
    votes,
  };
}
