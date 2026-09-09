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

1. Complete remaining ETC semantics: cue fire without an explicit list/part;
   unsupported effect-creation CLI and setup send/receive-string tools; safe cue
   workflow labels; completeness of passive wheel/softkey and patch information.
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

Primary reference: [ETC OSC Dictionary](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/OSC_Dictionary.htm)
and [ETC OSC Get](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/Using_OSC_with_Eos/OSC_Third-Party_Integration/OSC_Get.htm).
Fixtures are synthetic examples based on these references, not console captures.
No physical Eos or Nomad instance is available in this development environment;
real console acceptance remains to be performed even after automated tests pass.
