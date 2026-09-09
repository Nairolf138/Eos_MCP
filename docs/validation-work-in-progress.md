# OSC corrections — checkpoint, 2026-09-09

Branch: `fix/etc-osc-professional-workflows`, based on `d7fd2a6`.

This is an **unfinished implementation checkpoint**, saved so work can resume
without depending on a chat session. Do not deploy this checkpoint to a show.

Implemented: native ETC typed Get replies and fragmented lists, native version
negotiation, request source filtering, user-scoped commands, dry-run interception,
explicit confirmation, patch collision/profile checks, selective groups/palettes
and a new submaster recording tool. The old JSON-over-OSC mock protocol has been
removed from the client. Some legacy tests still simulate that unsupported protocol.

Remote HEAD checked before resuming: `115db2ed882f871190fdf5b37a370f73bead7219`.
Local changes left by the previous session were recovered on top of that exact
commit; this checkpoint saves them rather than repeating the audit.

Now implemented: plural cue-list playback paths, native cue-part firing and effect
selection/stop, native label setters, ping echo/source correlation, published read
schema validation, bounded workflow readbacks, multipart patch reads, and real
UDP/TCP loopback tests. Gateway explicit-target routing is covered by these tests.

Validation on resumption: **124/124 tests passed in four suites** (native client,
native reads, preparation workflows, UDP/TCP conformance). Command:
`npx jest --runInBand src/services/osc/__tests__/client.test.ts src/tools/__tests__/native_reads.test.ts src/tools/workflows/__tests__/native_preparation.test.ts src/services/osc/__tests__/eos-conformance.integration.test.ts`.

The latest whole unit run, before subsequent targeted fixes, reported **573 passing
and 73 failing tests**, 42 passing and 21 failing suites. It has NOT been rerun after
all recovered edits. Last HTTP MCP E2E run: **3 passed, 3 failed** (read-only patch
tool incorrectly needs confirmation, dry-run result lacks `verified: false`, and
the concurrent-user test wrongly assumes arrival order). Last lint run: 43 unused
imports/helpers left by legacy fixture replacement; some were subsequently removed.
These are unfinished results, not a successful regression gate.

Latest completed batch (after recovered checkpoint `ef5693a`): read-only tools now
publish consistent confirmation/dry-run metadata; patch reads no longer require
confirmation. Simulations report `verified: false`, `sent_to_transport: false`,
`accepted_by_eos: null` and a native message preview. Common published output
schemas accept those fields. Concurrent-user E2E checks assert each user's exact
address and command without assuming network arrival order.

Batch validation: **68/68 tests passed** (6 real SDK/HTTP E2E + 62 native read
schema tests), TypeScript and lint on the five changed source/test files passed.
All three previously reported HTTP E2E failures are resolved. Full regression and
repository-wide lint remain outstanding; older whole-suite counts above remain
historical, not results for this batch.

Next work:

1. Finish native command verification: an existing cue alone must not acknowledge
   a new Record; migrate remaining command and registry tests.
2. Finish completeness and published-schema/readback checks, including passive
   observations, multipart patch data and submaster contents limitations.
3. Migrate remaining fictional JSON wire fixtures and obsolete command/user/role
   expectations; clean unused test code and refresh reviewed contract snapshots.
   Preserve negative, transport and workflow coverage.
4. Update generated tool docs, setup instructions and native OSC coverage matrix;
   distinguish transport delivery, command acceptance and verified console state.
5. Run `npm run check:agent-ready:e2e` in full. Merge only when every necessary
   control is green and the implementation is ready. Push each coherent tested
   batch, updating this checkpoint with exact results and the next action.

Completed batch after `d5f2c68`: cue firing preserves an omitted list/part instead
of adding part zero; explicit list/part combinations retain their exact native
path. Removed fictitious playback CLI text from result descriptions. Legacy tests
now use native GO, Stop/Back, cue selection, DMX integers and snapshot integers;
passive command-line tests no longer simulate a `/get` request. Patch tests assert
that absent/malformed replies cannot become successful patch data. Removed unused
imports/helpers left by the earlier JSON test migration.

Validation: **60/60 tests passed in five suites** (cues, priority contracts, patch,
snapshots, address builders); **repository-wide ESLint and TypeScript passed**.
The regression inventory run before this batch had **597 passed / 54 failed tests
in 51 passing / 12 failing suites**. Remaining failures are in workflow and command
fixtures, registry role expectations, programming tests, generated documentation
and reviewed snapshots. Do not treat that historical inventory as a green gate.
Next batch: resolve unsupported workflow semantics and native cue readbacks, then
finish those remaining test families. The 6 HTTP MCP E2E tests passed in `d5f2c68`.

Completed batch after `b8e96ef`: removed generic effect creation and setup cue
send/receive-string setters from MCP discovery (126 executable tools now). The
legacy exports return explicit errors without OSC traffic. Deleted invented
effect parameter commands/readbacks; see `docs/native-osc-limitations.md` and its
ETC sources. No replacement effect creation capability is claimed.

Validation: **7/7 tests passed in two suites** (unsupported operations and effect
control), TypeScript and lint on changed code passed. Whole-suite results have not
been recomputed; old effect-creation scenarios and discovery snapshots still need
migration. Next: deterministic cue workflows, native label writes and bounded
readbacks, then command/registry tests and final documentation/regression gates.

Completed batch after `a1ff67a`: cue workflows require explicit lists and validate
the whole series before writes, refuse occupied/unknown targets, use native label
setters and bounded cue/label readbacks, and stop after a failed step. Labels are
never interpolated into CLI. Simulations consistently return `dry_run` and no
sent commands. Rehearsal GO/rollback use native fire paths. Cue update requires
absolute `intensity`; unimplemented relative/artistic transforms fail before OSC.
Patch scan is read-only, bounds ranges to 1000 channels, rejects unknown arguments
and reports simulations explicitly. Replaced its and cue workflows' fictional
JSON wire fixtures with synthetic typed native replies, retaining failure coverage.

Validation: **54/54 tests passed in three suites** (29 exported workflow scenarios,
19 native preparation cases, 6 SDK/HTTP E2E), **TypeScript and global ESLint passed**.
Next: generic command acceptance must use fresh feedback instead of cue existence;
finish command/programming/registry legacy tests, passive and multipart readback
completeness, generated/reference documentation and contract snapshots. Then run
the full contributor gate. No merge: whole-repository regression is not yet green.

Primary reference: [ETC OSC Dictionary](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/OSC_Dictionary.htm)
and [ETC OSC Get](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/Using_OSC_with_Eos/OSC_Third-Party_Integration/OSC_Get.htm).
Fixtures are synthetic examples based on these references, not console captures.
No physical Eos or Nomad instance is available in this development environment;
real console acceptance remains to be performed even after automated tests pass.
