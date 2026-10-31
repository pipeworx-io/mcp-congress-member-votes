# @pipeworx/congress-member-votes

How each U.S. House member and senator voted, how often they were there, and how often they vote with their party — House from the U.S. House Clerk's roll-call votes, Senate from the Congressional Record (U.S. Government Publishing Office).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1863+ live data sources. This is an independent, unofficial integration — not affiliated with, endorsed by, or published by the upstream provider.

## Tools

- `member_vote_positions(chamber?, bioguide_id | name [+ state], bill?, question_contains?, from_roll?, to_roll?, limit?, congress?, session?)` — one member's position (Yea, Nay, Present, Not Voting, or not on the roll) on roll calls, newest first. Answers "how did Rep. X vote on bill Y".
- `member_attendance_party_line(chamber?, bioguide_id | name [+ state], from_roll?, to_roll?, congress?, session?)` — attendance and party-line share for one member over a session or roll range. Every figure carries its denominator and exclusions; a figure that cannot be computed is `null` with a stated reason, never 0% or 100%.
- `roll_call_positions(chamber?, roll_number, party?, state?, position?, congress?, session?)` — every member's position on one roll call, with party tallies.

## What the derived figures mean

- **Attendance denominator**: recorded roll calls in the range on which the member was on the roll. Quorum calls and Speaker elections are excluded (and counted in `excluded_rolls`). `attended` = Yea + Nay + Present; `missed` = Not Voting.
- **Not on the roll is not Not Voting.** A member absent from a roll entirely (not yet seated, or already gone) is excluded from the denominator and counted separately as `not_on_roll_excluded`.
- **`with_party_majority`**: of the member's Yea/Nay votes, the share matching what a strict majority of their own party's Yea/Nay voters did. Includes lopsided votes, so it runs high. Party-tied rolls are excluded and counted.
- **`party_unity`**: the same, restricted to rolls where a majority of Democrats opposed a majority of Republicans.
- **The Speaker** is listed on a roll only when voting, so a Speaker's missed-vote count cannot be derived; attendance is returned as null with that reason (party-line is still computed over the votes cast).
- Party is the member's party at their latest roll call. Independents have no D-versus-R majority, so no party-line figure is computed for them.

## Auth

Keyless for the House. The Senate's live top-up uses the api.data.gov key the gateway supplies; without it the Senate answers from the stored rolls and says so in `live_topup`.

## Coverage

119th Congress, sessions 1 and 2, both chambers (`chamber: "house"` is the default; `"senate"` for the Senate). Other Congresses return a named reason.

**Senate.** The Secretary of the Senate's own site refuses automated requests (HTTP 403 from a web-application firewall, root page included, 2026-10-23), so the Senate's roll calls are taken from the Congressional Record, which prints each one with its Yeas / Nays / Present / Not Voting lists. Those lists carry surnames, not ids, so each name is resolved to a bioguide id against the congress-legislators roster. A Senate roll is kept only when

- the Yeas and Nays lists match the counts the Record announces, in two places (the announcement and the list headings);
- every name resolves to exactly one senator seated that day, and no senator is listed twice;
- the number of names equals the number of senators seated that day.

A roll that fails any of these is kept as a numbered placeholder (`record not derivable`, with the reason in its `description`), counted in `excluded_rolls.not_derivable_rolls`, and never used in a figure. The bake refuses to write a session whose roll numbers have an unexplained hole.

What the Senate figures mean differently from the House:

- The Senate prints a NOT VOTING list on every roll, so a senator absent from a vote is **Not Voting** and counts as missed; a senator not yet seated (or already gone) appears on no list and is excluded and counted as not on the roll.
- A Vice President tie-breaking vote is not a senator's position and is in no figure; the roll's `description` names it.
- The two independents who caucus with the Democrats are party `I`: they are not counted in the Democratic majority, and their own party-line figure is `null` with a stated reason.
- `result` is the Record's own outcome sentence, or `null` with a note when the Record has none this tool can match; it is never inferred from the tally.
- `date` is the Record's issue date, i.e. the Senate's legislative day: a day that runs past midnight is printed under the earlier date (the 1 July 2025 vote on H.R. 1 is under 30 June).

## Data sources

- U.S. House Clerk, roll-call votes. US federal data, public domain.
- U.S. Government Publishing Office, Congressional Record (Senate roll-call votes), with the roster from the congress-legislators project (public domain). US federal data, public domain.

Rolls are held as a compact member-by-roll table, generated by `scripts/bake-congress-member-votes.mjs` (the refresh path), uploaded at deploy and injected into the pack (`pack-baked-indexes.json`). Rolls newer than the table are read live on each call (up to 40; from the Clerk for the House, from the Congressional Record for the Senate), so every response states the last roll it covers (`rolls_covered`), how many were added live (`live_topup`) and `data_as_of`. If the live read fails the response says so and covers only the stored rolls.

The Clerk answers a roll that does not exist with an HTTP 200 stub rather than a 404; the pack treats that as "no such roll" and any other non-record body as a fault.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "congress-member-votes": {
      "url": "https://gateway.pipeworx.io/congress-member-votes/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/congress-member-votes/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1863+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/member_vote_positions \
  -H 'Content-Type: application/json' \
  -d '{"bioguide_id":"P000197","bill":"H CON RES 14","congress":119,"session":1}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/member_vote_positions`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Run it from npm

`@pipeworx/mcp-congress-member-votes` is a local stdio bridge to the Pipeworx gateway: your MCP client
starts it with `npx`, and it forwards every call to the same
`https://gateway.pipeworx.io/congress-member-votes/mcp` endpoint shown above. It needs network access;
there is no offline mode.

```json
{
  "mcpServers": {
    "congress-member-votes": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-congress-member-votes"]
    }
  }
}
```

Without a key it calls anonymously, capped at 50 calls a day. A free account
raises that to 200 a day: get a key at https://pipeworx.io/signup and add
`"env": { "PIPEWORX_API_KEY": "<your key>" }` to the server entry.
The key is sent as a Bearer token, the same way a hosted connection sends it,
so calls are metered and billed exactly as they are there.

It lists **only** this pack's tools by default. Set `PIPEWORX_META_TOOLS=1` to
also list `ask_pipeworx` and the other gateway-wide tools.

Behind an HTTPS proxy: Node's built-in `fetch` does not read `HTTPS_PROXY` by
default. Newer Node releases honour it when `NODE_USE_ENV_PROXY=1` is set; check
your Node version's documentation.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Congress Member Votes data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
