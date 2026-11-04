# Tournament data

Each tournament has its own JSON file. `ayc-2026.json` is the initial AYC schedule, imported from the workbook's **All Fixtures** master sheet. It contains 51 fixtures and a separate hurling schedule item. No trial website scores have been imported.

Each division owns its teams, format, scoring values, competition points, ranking guidance, progression rules, matches and agreed standings decisions. Future tournaments can copy this structure and change their own settings without changing historical files. The local scorer is in `scorer/` and the read-only public dashboard component is in `dashboard/`. Neither is deployed yet.

## Scores and decisions

An unplayed match has `score: null`. A completed result will use:

```json
{
  "team1": { "goals": 1, "points": 5 },
  "team2": { "goals": 0, "points": 8 }
}
```

Zero is a valid entered score; null means no result. Goals and points must be nonnegative integers. Set the match status to `completed` when confirming a result. A drawn group match can remain drawn and award the configured draw points.

`scoreValues` specifies how goals and points become total scores. `competitionPoints` specifies league points. The initial values retain the existing dashboard's goal value of 3 and point value of 1, with 3 league points for a win and 1 for a draw. The workbook explicitly gives the U7 league points; the existing dashboard supplies the initial values for the other league divisions. These settings are independent for every division.

`rankingGuidance` keeps competition points, score difference and total scored available to guide team agreements. It does not authorise the application to invent a winner or silently resolve a remaining tie. Unresolved qualifying ties must block confirmation of progression until an agreement is recorded.

For an agreed match winner, `decision` will use:

```json
{
  "type": "team_agreement",
  "winner": "Viet Celts",
  "agreedBy": ["Viet Celts", "BIS"],
  "note": "Record the agreed decision here.",
  "recordedAt": "2026-11-07T12:35:00+07:00"
}
```

The winner must be one of the match's actual participants. Preserve the drawn score separately. For a tied standings position, add a `standingsDecisions` entry with `type: "team_agreement"`, `group` (A, B, or null), `orderedTeams`, `agreedBy`, `note` and `recordedAt`. Teams and group membership must belong to the division. Entries start empty because no agreements have been supplied.

## Schedule and progression

- Times are local to `Asia/Ho_Chi_Minh`; match dates are explicit.
- Match IDs remain stable when results, times or referees change.
- Blank workbook referees remain null; the dashboard can display “TBC”.
- Finals retain their original participant labels. Actual teams start null and await qualification and resolved ties.
- U11/U13 crossover results count in standings; finals do not.
- U17 friendlies do not count for its series. Game 3 is conditional on one win each after Games 1 and 2. A drawn series match requires an agreed winner.
- U7 uses festival matches and a table, with no finals progression.
- Hurling is a separate 16:35–17:30 full-pitch schedule item, not a fabricated scored match.
- `updatedAt` starts null because no score update has been recorded. The scorer will set it when exporting an update.

Use the master sheet where workbook tabs disagree. In particular, U15-G04 starts at 11:35 (the U15 tab contains `w`), and U9 uses Singapore and Na Fianna/Thailand as shown in the master. The workbook remains unchanged.

The score-entry screen prepares updates for manual GitHub upload. No credentials, login or external score service are needed for this data file. See `scorer/README.md` for the match-day workflow.

