export interface ScriptGenerationResult {
  title: string;
  acts: GeneratedAct[];
  characters: CharacterManifestEntry[];
  backgrounds: BackgroundManifestEntry[];
  model: string;
  tokens?: number;
  cost?: number;
}

export interface GeneratedAct {
  name: string;
  scenes: GeneratedScene[];
}

export type GeneratedStageDirectionName =
  | "show"
  | "hide"
  | "move"
  | "shake"
  | "set"
  | "camera"
  | "flash"
  | "wait";

type GeneratedStageDirectionByName = {
  [K in GeneratedStageDirectionName]: {
    name: K;
    /** UTF-16 offset in the unchanged line text; omitted means before the line. */
    textOffset?: number;
    params: import("../contracts/script").CommandParamsByName[K];
  };
};

/** A provider-safe subset of inline commands that does not require generated asset ids. */
export type GeneratedStageDirection =
  GeneratedStageDirectionByName[GeneratedStageDirectionName];

export interface GeneratedLine {
  speaker?: string;
  text: string;
  variant?: string;
  /** Structured stage directions anchored to text offsets; omitted offsets run before this line. */
  directions?: GeneratedStageDirection[];
}

export interface GeneratedScene {
  name: string;
  /** Reference key into backgrounds */
  background: string;
  /** Optional scene-level background variant, e.g. "清晨" / "night" */
  backgroundVariant?: string;
  lines: GeneratedLine[];
}

// ---------------------------------------------------------------------------
// Asset Manifest (produced alongside generated script)
// ---------------------------------------------------------------------------

export interface AssetManifest {
  characters: CharacterManifestEntry[];
  backgrounds: BackgroundManifestEntry[];
}

export interface CharacterManifestEntry {
  name: string;
  /** Source-neutral visual brief used by asset matching and later prompt compilation. */
  description: string;
  /** Character gender — used for placeholder selection and AI prompt injection */
  gender?: "male" | "female";
}

export interface BackgroundManifestEntry {
  name: string;
  /** Source-neutral visual brief used by asset matching and later prompt compilation. */
  description: string;
}

export type TtsEmotion =
  | "happy"
  | "sad"
  | "angry"
  | "fearful"
  | "disgusted"
  | "surprised"
  | "calm"
  | "fluent";

export const TTS_EMOTIONS: readonly TtsEmotion[] = [
  "happy",
  "sad",
  "angry",
  "fearful",
  "disgusted",
  "surprised",
  "calm",
  "fluent",
] as const;

export interface VoiceConfig {
  voiceId: string;
  voiceName: string;
  language?: string;
}
