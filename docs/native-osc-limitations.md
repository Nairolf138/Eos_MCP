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

Sources: [ETC effect programming examples](https://support.etcconnect.com/ETC/Consoles/Eos_Family/Software_and_Programming/Common_Effects_and_How_to_Program_Them_on_an_Eos_Family_Console),
[OSC Dictionary](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/OSC_Dictionary.htm),
[OSC Get](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/Using_OSC_with_Eos/OSC_Third-Party_Integration/OSC_Get.htm).

Synthetic native protocol tests exercise transport, decoding and workflow control
flow. They do not establish real Eos/Nomad acceptance of command-line programming
or prove stored lighting values which ETC does not expose through OSC Get.
