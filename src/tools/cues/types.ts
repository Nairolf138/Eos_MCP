export interface CueIdentifier {
  cuelistNumber: number | null;
  cueNumber: string | null;
  cuePart: number | null;
}

export interface CueTimings {
  up: number | null;
  down: number | null;
  focus: number | null;
  color: number | null;
  beam: number | null;
}

export interface CueFlags {
  mark: boolean;
  block: boolean;
  assert: boolean;
  solo: boolean;
  timecode: boolean;
}

export interface CueLinks {
  link: string | null;
  follow: number | null;
  hang: number | null;
  loop: number | null;
}

export interface CueDetails {
  identifier: CueIdentifier;
  label: string | null;
  timings: CueTimings;
  curve: string | null;
  flags: CueFlags;
  links: CueLinks;
  notes: string | null;
}

export interface CueListEntry {
  identifier: CueIdentifier;
  label: string | null;
}

export interface CuelistInfo {
  cuelistNumber: number | null;
  label: string | null;
  playbackMode: string | null;
  faderMode: string | null;
  flags: {
    independent: boolean;
    htp: boolean;
    assert: boolean;
    block: boolean;
    background: boolean;
    soloMode: string | null;
  };
}

export interface CuePlaybackState {
  details: CueDetails;
  durationSeconds: number | null;
  progressPercent: number | null;
  remainingSeconds: number | null;
}
