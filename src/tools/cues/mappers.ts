import type {
  CueDetails,
  CueFlags,
  CueIdentifier,
  CueLinks,
  CueListEntry,
  CuePlaybackState,
  CueTimings,
  CuelistInfo
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const normalised = trimmed.replace(',', '.');
    const parsed = Number.parseFloat(normalised.replace(/[^0-9.+-:]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (isRecord(value)) {
    const candidate =
      value.seconds ?? value.secs ?? value.duration ?? value.value ?? value.time ?? value.total ?? value.amount;
    return asFiniteNumber(candidate);
  }
  return null;
}

function asFiniteInteger(value: unknown): number | null {
  const numeric = asFiniteNumber(value);
  if (numeric == null) {
    return null;
  }
  const truncated = Math.trunc(numeric);
  return Number.isFinite(truncated) ? truncated : null;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function normaliseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalised)) {
      return true;
    }
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalised)) {
      return false;
    }
  }
  return false;
}

function parseDuration(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const lower = trimmed.toLowerCase();
    if (lower.includes(':')) {
      const parts = lower
        .split(':')
        .map((part) => part.trim())
        .map((part) => part.replace(',', '.'))
        .map((part) => Number.parseFloat(part));
      if (parts.every((part) => Number.isFinite(part))) {
        if (parts.length === 3) {
          return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
        }
        if (parts.length === 2) {
          return parts[0]! * 60 + parts[1]!;
        }
        if (parts.length === 1) {
          return parts[0]!;
        }
      }
    }
    const cleaned = lower.replace(/[^0-9.+-]/g, '');
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (isRecord(value)) {
    const candidate =
      value.seconds ??
      value.secs ??
      value.duration ??
      value.time ??
      value.total ??
      value.length ??
      value.value ??
      value.amount;
    return parseDuration(candidate);
  }
  return null;
}

function parsePercentage(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value <= 1 ? value * 100 : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const withoutPercent = trimmed.endsWith('%') ? trimmed.slice(0, -1) : trimmed;
    const numeric = Number.parseFloat(withoutPercent.replace(',', '.'));
    if (!Number.isFinite(numeric)) {
      return null;
    }
    return numeric <= 1 ? numeric * 100 : numeric;
  }
  if (isRecord(value)) {
    const candidate = value.progress ?? value.percent ?? value.percentage ?? value.value;
    return parsePercentage(candidate);
  }
  return null;
}

function resolveIdentifier(raw: Record<string, unknown>, fallback: Partial<CueIdentifier>): CueIdentifier {
  const cuelistNumber =
    asFiniteInteger(raw.cuelist) ??
    asFiniteInteger(raw.list) ??
    asFiniteInteger(raw.cuelist_number) ??
    asFiniteInteger(raw.playback) ??
    fallback.cuelistNumber ??
    null;

  const cueNumberCandidate =
    asString(raw.cue) ??
    asString(raw.cue_number) ??
    asString(raw.number) ??
    asString(raw.id) ??
    asString(raw.target) ??
    fallback.cueNumber ??
    null;

  const cuePart =
    asFiniteInteger(raw.cue_part) ??
    asFiniteInteger(raw.part) ??
    asFiniteInteger(raw.part_number) ??
    fallback.cuePart ??
    null;

  return {
    cuelistNumber,
    cueNumber: cueNumberCandidate,
    cuePart
  };
}

function extractTimingContainer(raw: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(raw.timings)) {
    return raw.timings as Record<string, unknown>;
  }
  if (isRecord(raw.time)) {
    return raw.time as Record<string, unknown>;
  }
  if (isRecord(raw.timing)) {
    return raw.timing as Record<string, unknown>;
  }
  return raw;
}

function mapCueTimings(raw: Record<string, unknown>): CueTimings {
  const container = extractTimingContainer(raw);
  return {
    up: parseDuration(container.up ?? container.fade_up ?? container.in ?? container.uptime),
    down: parseDuration(container.down ?? container.fade_down ?? container.out ?? container.downtime),
    focus: parseDuration(container.focus ?? container.focus_time ?? container.focusfade),
    color: parseDuration(container.color ?? container.color_time ?? container.colorfade),
    beam: parseDuration(container.beam ?? container.beam_time ?? container.beamfade)
  };
}

function mapCueFlags(raw: Record<string, unknown>): CueFlags {
  const flagsSource = isRecord(raw.flags) ? (raw.flags as Record<string, unknown>) : raw;
  return {
    mark: normaliseBoolean(flagsSource.mark ?? flagsSource.marked),
    block: normaliseBoolean(flagsSource.block ?? flagsSource.blocked),
    assert: normaliseBoolean(flagsSource.assert ?? flagsSource.asserted),
    solo: normaliseBoolean(flagsSource.solo ?? flagsSource.solo_mode),
    timecode: normaliseBoolean(flagsSource.timecode ?? flagsSource.tc ?? flagsSource.time_code)
  };
}

function mapCueLinks(raw: Record<string, unknown>): CueLinks {
  return {
    link: asString(raw.link ?? raw.linked_to ?? raw.jump ?? raw.autofollow),
    follow: parseDuration(raw.follow ?? raw.follow_time ?? raw.auto_follow),
    hang: parseDuration(raw.hang ?? raw.hang_time ?? raw.auto_hang),
    loop: parseDuration(raw.loop ?? raw.loop_time ?? raw.auto_loop)
  };
}

function identifierKey(identifier: CueIdentifier): string {
  const list = identifier.cuelistNumber != null ? String(identifier.cuelistNumber) : 'null';
  const cue = identifier.cueNumber ?? 'null';
  const part = identifier.cuePart != null ? String(identifier.cuePart) : 'null';
  return `${list}:${cue}:${part}`;
}

export function mapCueDetails(raw: unknown, fallback: Partial<CueIdentifier> = {}): CueDetails {
  const source = isRecord(raw) ? raw : {};
  const identifier = resolveIdentifier(source, fallback);
  const label = asString(source.label ?? source.name ?? source.title ?? source.description) ?? null;
  const curve = asString(source.curve ?? source.timing_curve ?? source.fade_curve ?? source.rate) ?? null;
  const timings = mapCueTimings(source);
  const flags = mapCueFlags(source);
  const links = mapCueLinks(source);
  const notes = asString(source.notes ?? source.note ?? source.comment ?? source.remarks) ?? null;

  return {
    identifier,
    label,
    timings,
    curve,
    flags,
    links,
    notes
  };
}

export function mapCueList(raw: unknown, fallback: Partial<CueIdentifier> = {}): CueListEntry[] {
  const source = isRecord(raw) ? raw : {};
  const list = Array.isArray(source.cues)
    ? source.cues
    : Array.isArray(source.cuelist)
      ? source.cuelist
      : Array.isArray(source.items)
        ? source.items
        : Array.isArray(raw)
          ? (raw as unknown[])
          : [];

  const entries = list
    .map((item) => mapCueDetails(item, fallback))
    .map((details) => ({ identifier: details.identifier, label: details.label }));

  const unique = new Map<string, CueListEntry>();
  for (const entry of entries) {
    const key = identifierKey(entry.identifier);
    if (!unique.has(key)) {
      unique.set(key, entry);
    }
  }

  return Array.from(unique.values());
}

export function mapCuelistInfo(raw: unknown, fallback: Partial<CueIdentifier> = {}): CuelistInfo {
  const source = isRecord(raw) ? raw : {};
  const identifier = resolveIdentifier(source, fallback);
  const label = asString(source.label ?? source.name ?? source.title) ?? null;
  const playbackMode =
    asString(source.playback_mode ?? source.mode ?? source.play_mode ?? source.playback) ?? null;
  const faderMode = asString(source.fader_mode ?? source.fader ?? source.slider_mode) ?? null;

  const flagsSource = isRecord(source.flags) ? (source.flags as Record<string, unknown>) : source;

  const info: CuelistInfo = {
    cuelistNumber: identifier.cuelistNumber,
    label,
    playbackMode,
    faderMode,
    flags: {
      independent: normaliseBoolean(flagsSource.independent),
      htp: normaliseBoolean(flagsSource.htp ?? flagsSource.hightakesprecedence),
      assert: normaliseBoolean(flagsSource.assert),
      block: normaliseBoolean(flagsSource.block),
      background: normaliseBoolean(flagsSource.background ?? flagsSource.background_enable),
      soloMode: asString(flagsSource.solo_mode ?? flagsSource.solo ?? flagsSource.soloMode) ?? null
    }
  };

  return info;
}

export function mapCuePlaybackState(raw: unknown, fallback: Partial<CueIdentifier> = {}): CuePlaybackState {
  const source = isRecord(raw) ? raw : {};
  const cueSource = isRecord(source.cue) ? (source.cue as Record<string, unknown>) : source;
  const details = mapCueDetails(cueSource, fallback);

  const duration = parseDuration(source.duration ?? cueSource.duration ?? source.total ?? cueSource.total_time);
  const remaining = parseDuration(source.remaining ?? source.time_remaining ?? cueSource.remaining);
  const progress =
    parsePercentage(source.progress ?? source.percent ?? source.percentage ?? cueSource.progress ?? cueSource.percent);

  return {
    details,
    durationSeconds: duration,
    progressPercent: progress,
    remainingSeconds: remaining
  };
}
