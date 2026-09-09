# Native ETC OSC: explicit limits

The default MCP catalogue no longer advertises these three unimplemented operations:

- `eos_workflow_create_effect`: the former generic fly-out sequence did not define
  a valid Eos effect type, steps, grouping or parameter assignment. Its supposed
  direction/speed/size readback used fields that native OSC Get does not provide.
  Prepare the effect in Eos. `eos_effect_select` selects an existing effect; it does
  not create or redefine one. A prepared console macro may perform a known sequence.
- `eos_set_cue_send_string` and `eos_set_cue_receive_string`: configure these fields
  in **Setup > Show Control > OSC**. No documented OSC assignment is implemented.

Their TypeScript exports remain explicit `unsupported` responses for compatibility
with direct imports; neither dry-run nor confirmation causes console traffic.

Cue preparation requires an explicit `cuelist_number` (`base_cuelist_number` for
a series). All target cue numbers are validated and checked as unused before any
write. Missing replies are not proof that a target is free. Labels use native
`/eos/set/cue/<list>/<cue>/label` string arguments and are read back; they never
enter the console command line. Existing cue contents and rendered output still
require inspection in Eos.

`eos_workflow_update_cue_look` requires an explicit list, cue and absolute
`intensity` (0–100). It recalls the cue, changes the selected channels and updates
that cue, so it affects live output. The former `intensity_factor`, `warmify` and
`desaturate` operations are rejected before writing; their requested changes must
not be silently skipped. Rehearsal GO uses the native cue-list or cue fire path,
including any explicitly requested rollback. A successful transport send does
not establish that playback reached the desired lighting state.

Patch part reads expose `address` and `ending_address` as absolute DMX addresses.
`dmx_span` is their inclusive span when known, not a guessed fixture-library mode.
An unpatched part stays unpatched even when another part has an address. Requesting
all parts requires successful replies for every part; incomplete reads cannot
become a successful first-part-only result. Enumerations and multipart/channel
requests share one timeout budget across their native exchanges.

Active wheels are passive observations with `observed_at` and `is_complete:false`;
ETC provides no total for reconstructing a guaranteed complete wheel list.
Softkey labels are complete only when valid recent labels for all 12 keys have
been observed. Submaster `timings` retains ETC's string values for `up`, `dwell`
and `down`, including values such as `Man`; no unsupported numeric assert/release
timings are invented. Submaster levels use OSC floats 0–1: `0.5` means 50%, while
the explicit input `"0.5%"` means 0.5% and sends 0.005.

Sources: [ETC effect programming examples](https://support.etcconnect.com/ETC/Consoles/Eos_Family/Software_and_Programming/Common_Effects_and_How_to_Program_Them_on_an_Eos_Family_Console),
[OSC Dictionary](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/OSC_Dictionary.htm),
[OSC Get](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/Using_OSC_with_Eos/OSC_Third-Party_Integration/OSC_Get.htm).

Synthetic native protocol tests exercise transport, decoding and workflow control
flow. They do not establish real Eos/Nomad acceptance of command-line programming
or prove stored lighting values which ETC does not expose through OSC Get.
