import React, { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { IconButton, ProgressSlider } from "./EditorControls";

/** Audition only the recording; this module has no connection to the canvas clock. */
export function VoicePreview({ src, label }: { src?: string; label: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);
  useEffect(() => {
    const media = audio.current;
    setPlaying(false);
    setTime(media?.currentTime ?? 0);
    setDuration(media && Number.isFinite(media.duration) ? media.duration : 0);
    setError(false);
    return () => {
      media?.pause();
    };
  }, [src]);
  async function toggle() {
    const media = audio.current;
    if (!media) return;
    try {
      if (media.paused) {
        if (media.ended || media.currentTime >= duration) {
          media.currentTime = 0;
          setTime(0);
        }
        await media.play();
      } else media.pause();
    } catch {
      setError(true);
    }
  }
  return (
    <div
      className="voice-preview vnve-ui flex items-center gap-1.5 py-1.5 px-2 bg-white/5 rounded-b-xl border-t border-white/5 text-[11px]"
      aria-label="录音试听"
      onClick={(e) => e.stopPropagation()}
    >
      {src && (
        <audio
          ref={audio}
          src={src}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const next = e.currentTarget.duration;
            setDuration(Number.isFinite(next) ? next : 0);
            setError(false);
          }}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={(e) => {
            setPlaying(false);
            setTime(
              Number.isFinite(e.currentTarget.duration)
                ? e.currentTarget.duration
                : duration,
            );
          }}
          onError={() => {
            setPlaying(false);
            setError(true);
          }}
        />
      )}
      <IconButton
        label={`${playing ? "暂停" : "试听"}${label}录音`}
        title={!src ? "这句还没有录音" : playing ? "暂停录音" : "试听录音"}
        disabled={!src || error}
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => void toggle()}
      >
        {playing ? <Pause /> : <Play />}
      </IconButton>
      {error ? (
        <span role="status" className="voice-error">
          录音加载失败
        </span>
      ) : (
        <ProgressSlider
          label={`${label}录音进度`}
          progress={duration ? time / duration : 0}
          disabled={!duration || !src}
          onSeek={(progress) => {
            if (audio.current) {
              const next = progress * duration;
              audio.current.currentTime = next;
              setTime(next);
            }
          }}
        />
      )}
    </div>
  );
}
