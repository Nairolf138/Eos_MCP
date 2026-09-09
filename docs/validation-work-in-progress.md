# OSC corrections — checkpoint, 2026-09-09

Branch: `fix/etc-osc-professional-workflows`, based on `d7fd2a6`.

This is an **unfinished implementation checkpoint**, saved so work can resume
without depending on a chat session. Do not deploy this checkpoint to a show.

Implemented: native ETC typed Get replies and fragmented lists, native version
negotiation, request source filtering, user-scoped commands, dry-run interception,
explicit confirmation, patch collision/profile checks, selective groups/palettes
and a new submaster recording tool. The old JSON-over-OSC mock protocol has been
removed from the client. Some legacy tests still simulate that unsupported protocol.

Validation so far: the new native client suite passed 39 tests. The most recent
whole unit run reported 481 passing and 162 failing tests (35 failing suites).
These failures include both obsolete test fixtures and corrections still needed;
they must not be treated as a successful regression run. Documentation generation,
native integration tests and the full contributor gate remain outstanding.

Next work:

1. Correct cue-list playback to ETC's `/eos/cues/<list>/fire` and `/stop`;
   add native cue-part firing and `/eos/fx` selection.
2. Finish ping correlation, output schema validation and workflow readback checks.
3. Replace fictional wire fixtures with documented native replies; retain useful
   negative, transport and workflow tests. Run `npm run check:agent-ready:e2e`.
4. Update generated tool docs, setup instructions and native OSC coverage matrix.
5. Review and merge the completed correction after the required checks pass.

Primary reference: [ETC OSC Dictionary](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/OSC_Dictionary.htm)
and [ETC OSC Get](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/Using_OSC_with_Eos/OSC_Third-Party_Integration/OSC_Get.htm).
Fixtures are synthetic examples based on these references, not console captures.
No physical Eos or Nomad instance is available in this development environment;
real console acceptance remains to be performed even after automated tests pass.
