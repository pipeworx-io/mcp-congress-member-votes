/**
 * Pure derivations over a member-by-roll matrix. Every figure returned here
 * carries its denominator and what was left out of it -- a bare percentage is
 * never produced. No I/O.
 */
import type { CmvRoll } from './cmv-index-data.js';

export interface Work {
  chamber: 'house' | 'senate';
  congress: number;
  session: number;
  year: number;
  rolls: CmvRoll[];
  /** keyed by bioguide */
  members: Map<string, { id: string; last: string; party: string; state: string; speaker?: boolean; pos: string }>;
}

export const POS_LABEL: Record<string, string> = {
  Y: 'Yea',
  N: 'Nay',
  P: 'Present',
  X: 'Not Voting',
  C: 'Voted for a candidate (election roll, not a yes/no position)',
  '-': 'Not on this roll call (not a sitting member at the time)',
};

export function pct(num: number, den: number): number | null {
  return den > 0 ? Math.round((num / den) * 1000) / 10 : null;
}

/** Per roll index: the position (Y/N) that a strict majority of the party's yea/nay voters took; null if tied or nobody voted. */
export function partyMajorities(w: Work, party: string, lo: number, hi: number): (('Y' | 'N') | null)[] {
  const out: (('Y' | 'N') | null)[] = [];
  for (let i = lo; i <= hi; i++) {
    let y = 0;
    let n = 0;
    for (const m of w.members.values()) {
      if (m.party !== party) continue;
      const p = m.pos[i];
      if (p === 'Y') y++;
      else if (p === 'N') n++;
    }
    out.push(y > n ? 'Y' : n > y ? 'N' : null);
  }
  return out;
}

export interface MemberFigures {
  rolls_in_range: number;
  excluded_rolls: { quorum_calls: number; election_rolls: number; not_derivable_rolls: number };
  attendance: {
    denominator: number;
    voted_yea_or_nay: number;
    answered_present: number;
    not_voting: number;
    not_on_roll_excluded: number;
    attended_pct: number | null;
    missed_pct: number | null;
    reason?: string;
  };
  party_line: {
    party: string;
    with_party_majority: {
      denominator: number;
      agreed: number;
      pct: number | null;
      not_in_denominator: { not_voting_or_present: number; party_position_tied: number; not_on_roll: number };
      reason?: string;
    };
    party_unity: {
      denominator: number;
      agreed: number;
      pct: number | null;
      party_unity_rolls_in_range: number;
      reason?: string;
    };
  } | null;
  party_line_reason?: string;
}

/**
 * lo/hi are 0-based roll indexes (inclusive). Only kind 'r' rolls are used;
 * quorum calls and Speaker/election rolls are counted and named, never
 * silently dropped, and never counted as attendance or as a party position.
 * Senate rolls whose record could not be derived (kind 's') are excluded the
 * same way and counted in not_derivable_rolls.
 */
export function figuresFor(w: Work, id: string, lo: number, hi: number): MemberFigures {
  const m = w.members.get(id)!;
  const excluded = { quorum_calls: 0, election_rolls: 0, not_derivable_rolls: 0 };
  const att = { voted: 0, present: 0, nv: 0, off: 0 };
  const rec: number[] = [];
  for (let i = lo; i <= hi; i++) {
    const k = w.rolls[i].k;
    if (k === 'q') excluded.quorum_calls++;
    else if (k === 'e') excluded.election_rolls++;
    else if (k === 's') excluded.not_derivable_rolls++;
    else rec.push(i);
  }
  for (const i of rec) {
    const p = m.pos[i];
    if (p === 'Y' || p === 'N') att.voted++;
    else if (p === 'P') att.present++;
    else if (p === 'X') att.nv++;
    else att.off++;
  }
  const den = att.voted + att.present + att.nv;
  const attendance: MemberFigures['attendance'] = {
    denominator: den,
    voted_yea_or_nay: att.voted,
    answered_present: att.present,
    not_voting: att.nv,
    not_on_roll_excluded: att.off,
    attended_pct: pct(att.voted + att.present, den),
    missed_pct: pct(att.nv, den),
  };
  if (m.speaker) {
    // The Clerk lists the Speaker on a roll only when the Speaker votes, so "absent from the roll" cannot be told apart from "did not vote".
    attendance.attended_pct = null;
    attendance.missed_pct = null;
    attendance.reason = `The Speaker is listed on a roll call only when voting, so a missed-vote count cannot be derived: of the ${rec.length} recorded roll call(s) in this range the Speaker appears on ${den}, and was absent from the roll on ${att.off}, which may mean did not vote or may not.`;
  } else if (den === 0) {
    attendance.reason = rec.length === 0
      ? 'No recorded roll call (quorum calls and Speaker elections excluded) falls in this range, so attendance is not computable. It is not 0% and not 100%.'
      : `The member was absent from the roll on all ${rec.length} recorded roll call(s) in this range (not yet seated or already gone), so attendance is not computable. It is not 0% and not 100%.`;
  }

  const fig: MemberFigures = {
    rolls_in_range: hi - lo + 1,
    excluded_rolls: excluded,
    attendance,
    party_line: null,
  };

  if (m.party !== 'D' && m.party !== 'R') {
    fig.party_line_reason = `Party "${m.party || 'unknown'}" has no D-versus-R majority to compare against, so a party-line share is not computed for this member.`;
    return fig;
  }
  const other = m.party === 'D' ? 'R' : 'D';
  const mine = partyMajorities(w, m.party, lo, hi);
  const theirs = partyMajorities(w, other, lo, hi);
  let wDen = 0, wAgree = 0, tied = 0, notVoted = 0, off = 0;
  let uRolls = 0, uDen = 0, uAgree = 0;
  for (const i of rec) {
    const p = m.pos[i];
    const mm = mine[i - lo];
    const tm = theirs[i - lo];
    const unity = mm !== null && tm !== null && mm !== tm;
    if (unity) uRolls++;
    if (p === '-') { off++; continue; }
    if (p !== 'Y' && p !== 'N') { notVoted++; continue; }
    if (mm === null) { tied++; continue; }
    wDen++;
    if (p === mm) wAgree++;
    if (unity) {
      uDen++;
      if (p === mm) uAgree++;
    }
  }
  const wp = { denominator: wDen, agreed: wAgree, pct: pct(wAgree, wDen), not_in_denominator: { not_voting_or_present: notVoted, party_position_tied: tied, not_on_roll: off } } as NonNullable<MemberFigures['party_line']>['with_party_majority'];
  if (wDen === 0) wp.reason = 'The member cast no yea/nay vote on a roll call with a defined party majority in this range, so the share is not computable (not 0%, not 100%).';
  const pu = { denominator: uDen, agreed: uAgree, pct: pct(uAgree, uDen), party_unity_rolls_in_range: uRolls } as NonNullable<MemberFigures['party_line']>['party_unity'];
  if (uDen === 0) pu.reason = uRolls === 0 ? 'No roll call in this range split the two parties (a majority of Democrats against a majority of Republicans), so party unity is not defined here.' : 'The member cast no yea/nay vote on any of the party-unity roll calls in this range.';
  fig.party_line = { party: m.party, with_party_majority: wp, party_unity: pu };
  return fig;
}
