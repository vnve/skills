import type { CommandParamsByName } from '../contracts/script';

export type ScriptNode = TextNode;

export interface ScriptDoc {
  nodes: ScriptNode[];
}

// --- Inline tag / rich content types ---

/** A render-oriented styled text segment (no `type` discriminator). */
export interface StyledSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

/** A plain text segment inside a TextNode's content array. */
export interface TextSegment {
  type: 'text';
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

/** An inline command tag embedded within a TextNode's content array. */
export type CommandName = keyof CommandParamsByName;

interface InlineTagByName<K extends CommandName> {
  type: 'tag';
  name: K;
  params: CommandParamsByName[K];
}

export type InlineTag = {
  [K in CommandName]: InlineTagByName<K>;
}[CommandName];

/** A single element in the TextNode rich content array. */
export type RichContent = TextSegment | InlineTag;

// --- Node types ---

/**
 * Snapshot of the inputs used to generate a TextNode's TTS audio.
 * Written when audio is generated; used by voice audit to detect staleness.
 */
export interface TtsGenerationSnapshot {
  /** TTS-ready text that was synthesized (see getTtsText). */
  text: string;
  /** Speaker actor id at generation time; omitted for narrator lines. */
  actorId?: string;
  /** Bound voice id used for synthesis. */
  voiceId: string;
  /** Emotion preset used for synthesis, when any. */
  emotion?: import('./authoring').TtsEmotion;
  /** TTS provider id from the capability binding at generation time. */
  providerId: string;
  /** TTS model id from the capability binding at generation time. */
  modelId: string;
}

export interface TextNode {
  type: 'text';
  id?: string;
  text: string;
  actorId?: string;
  /**
   * Rich content representation. When present, this is the authoritative
   * source for the node's content; the `text` field is kept as a
   * plain-text fallback for backward compatibility.
   */
  content?: RichContent[];
  /** TTS-generated audio URL for this dialogue line. */
  audioUrl?: string;
  /** TTS audio duration in seconds; overrides text-estimated duration in the parser. */
  audioDuration?: number;
  /** Explicit authoring timing; voice media duration stays unchanged. */
  timing?: {leadIn?:number;revealDuration?:number;holdDuration?:number};
  /** TTS emotion preset for MiniMax voice_setting.emotion. */
  emotion?: import('./authoring').TtsEmotion;
  /** TTS playback volume (0–1). Defaults to DEFAULT_TTS_VOLUME when omitted. */
  voiceVolume?: number;
  /**
   * Snapshot of TTS generation inputs for the current audioUrl.
   * Absent on legacy projects that predate snapshot tracking.
   */
  ttsSnapshot?: TtsGenerationSnapshot;
  /** User-supplied recording, bound to the text and speaker it was imported for. */
  audioImportSnapshot?: { text: string; actorId?: string };
  /** AI import hint for sprite switching; consumed during quick import. */
  variant?: string;
}
