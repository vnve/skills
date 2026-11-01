import { describe, expect, it } from 'vitest';
import type { TimelineEvent } from '@vnve/core';
import { compileAudioPlan } from '@vnve/runtime';
import {
  buildDefaultTransitionChannels,
  createEmptyRenderContext,
  findSequenceSceneAtTime,
  findSequenceTransitionAtTime,
  prepareFrame,
  sampleSequenceTransitionChannel,
  sampleSequence,
  sampleSequenceTransition,
  type CompiledSceneClip,
  type CompiledSequence,
  type SequenceTransition,
  type SequenceTransitionChannelSpec,
} from '../index';

function createOpacityChannel(): SequenceTransitionChannelSpec {
  return {
    mode: 'opacity',
    outgoing: { start: 0, end: 1, from: 1, to: 0, easing: 'linear' },
    incoming: { start: 0, end: 1, from: 0, to: 1, easing: 'linear' },
  };
}

function createThroughColorChannel(): SequenceTransitionChannelSpec {
  return {
    mode: 'through-color',
    outgoing: { start: 0, end: 0.5, from: 1, to: 0, easing: 'linear' },
    incoming: { start: 0.5, end: 1, from: 0, to: 1, easing: 'linear' },
  };
}

function createClip(params: {
  sceneId: string;
  startTime: number;
  contentStartTime?: number;
  endTime: number;
  events?: TimelineEvent[];
}): CompiledSceneClip {
  const { sceneId, startTime, contentStartTime = startTime, endTime, events = [] } = params;
  const clipId = `scene:${sceneId}`;
  return {
    clipId,
    sceneId,
    startTime,
    contentStartTime,
    endTime,
    eventTimeBasis: 'sequence-global',
    events,
    channels: {
      shot: { channel: 'shot', clipId },
      dialogue: { channel: 'dialogue', clipId },
    },
  };
}

function createTransition(params: {
  id: string;
  selectionOrder: number;
  effectiveStartTime: number;
  effectiveEndTime: number;
  fromSceneId: string;
  toSceneId: string;
  startTime: number;
  endTime: number;
  effect: SequenceTransition['effect'];
  channels?: SequenceTransition['channels'];
}): SequenceTransition {
  const {
    id,
    selectionOrder,
    effectiveStartTime,
    effectiveEndTime,
    fromSceneId,
    toSceneId,
    startTime,
    endTime,
    effect,
    channels,
  } = params;
  return {
    id,
    selectionOrder,
    effectiveStartTime,
    effectiveEndTime,
    fromClipId: `scene:${fromSceneId}`,
    toClipId: `scene:${toSceneId}`,
    fromSceneId,
    toSceneId,
    startTime,
    endTime,
    effect,
    channels: channels ?? {
      shot: effect === 'fade-black' || effect === 'fade-white'
        ? createThroughColorChannel()
        : createOpacityChannel(),
      dialogue: createOpacityChannel(),
    },
  };
}

function createSequence(params: {
  clips: CompiledSceneClip[];
  transitions?: SequenceTransition[];
  duration?: number;
}): CompiledSequence {
  const { clips, transitions = [], duration } = params;
  const maxEndTime = Math.max(
    0,
    ...clips.map((clip) => clip.endTime),
    ...transitions.map((transition) => transition.endTime),
  );
  const sequenceDuration = duration ?? maxEndTime;
  return {
    duration: sequenceDuration,
    renderContext: createEmptyRenderContext(),
    audioPlan: compileAudioPlan([], sequenceDuration),
    sceneClips: clips,
    transitions,
    fallbackSceneId: clips[0]?.sceneId ?? null,
  };
}

describe('sequence evaluator', () => {
  it('samples a single scene outside any transition using sequence-global event time', () => {
    const clip = createClip({
      sceneId: 'scene-1',
      startTime: 5,
      endTime: 8,
      events: [{ type: 'narrate', at: 5, dur: 2, params: { text: 'Hello' } }],
    });
    const sequence = createSequence({ clips: [clip], duration: 8 });

    const activeScene = findSequenceSceneAtTime(sequence, 5.5);
    const frame = sampleSequence({ sequence, time: 5.5 });

    expect(activeScene?.sceneId).toBe('scene-1');
    expect(frame.transition).toBeUndefined();
    expect(frame.single?.currentSceneId).toBe('scene-1');
    expect(frame.single?.nextRenderState.narration?.text).toBe('Hello');
    expect(frame.currentSceneId).toBe('scene-1');
  });

  it('samples a normal transition and returns playback payload with compositorPlan', () => {
    const sequence = createSequence({
      clips: [
        createClip({
          sceneId: 'scene-1',
          startTime: 0,
          endTime: 3.5,
          events: [{ type: 'narrate', at: 0, dur: 3, params: { text: 'One' } }],
        }),
        createClip({
          sceneId: 'scene-2',
          startTime: 2.5,
          endTime: 6,
          events: [{ type: 'narrate', at: 2.5, dur: 3, params: { text: 'Two' } }],
        }),
      ],
      transitions: [
        createTransition({
          id: 'transition:scene-1->scene-2',
          selectionOrder: 0,
          effectiveStartTime: 2.5,
          effectiveEndTime: 3.5,
          fromSceneId: 'scene-1',
          toSceneId: 'scene-2',
          startTime: 2.5,
          endTime: 3.5,
          effect: 'fade-black',
        }),
      ],
      duration: 6,
    });

    const transitionSample = sampleSequenceTransition(sequence, 3);
    const frame = sampleSequence({ sequence, time: 3 });

    expect(findSequenceTransitionAtTime(sequence, 3)?.id).toBe('transition:scene-1->scene-2');
    expect(transitionSample?.progress).toBeCloseTo(0.5, 5);
    expect(transitionSample?.compositorPlan.shot.throughColor).toBe('#000000');
    expect(frame.transition?.progress).toBeCloseTo(0.5, 5);
    expect(frame.transition?.incoming.currentSceneId).toBe('scene-2');
    expect(frame.transition?.outgoing.currentSceneId).toBe('scene-1');
    expect(frame.currentSceneId).toBe('scene-2');
  });

  it('builds compositor plans from sampled compiled transition channels', () => {
    const sequence = createSequence({
      clips: [
        createClip({ sceneId: 'scene-1', startTime: 0, endTime: 2 }),
        createClip({ sceneId: 'scene-2', startTime: 0, endTime: 2 }),
      ],
      transitions: [
        createTransition({
          id: 'transition:scene-1->scene-2',
          selectionOrder: 0,
          effectiveStartTime: 0,
          effectiveEndTime: 1,
          fromSceneId: 'scene-1',
          toSceneId: 'scene-2',
          startTime: 0,
          endTime: 1,
          effect: 'fade-black',
          channels: {
            shot: {
              mode: 'through-color',
              outgoing: { start: 0, end: 1, from: 0.9, to: 0.1, easing: 'linear' },
              incoming: { start: 0, end: 1, from: 0.05, to: 0.45, easing: 'linear' },
            },
            dialogue: {
              mode: 'opacity',
              outgoing: { start: 0, end: 1, from: 0.6, to: 0.2, easing: 'linear' },
              incoming: { start: 0, end: 1, from: 0.15, to: 0.55, easing: 'linear' },
            },
          },
        }),
      ],
      duration: 2,
    });

    const sample = sampleSequenceTransition(sequence, 0.25);
    const frame = sampleSequence({ sequence, time: 0.25 });

    expect(sample?.progress).toBeCloseTo(0.25, 6);
    expect(sample?.compositorPlan.shot.outgoing.opacity).toBeCloseTo(0.7, 6);
    expect(sample?.compositorPlan.shot.incoming.opacity).toBeCloseTo(0.15, 6);
    expect(sample?.compositorPlan.shot.throughColorOpacity).toBeCloseTo(0.15, 6);
    expect(sample?.compositorPlan.dialogue.outgoing.opacity).toBeCloseTo(0.5, 6);
    expect(sample?.compositorPlan.dialogue.incoming.opacity).toBeCloseTo(0.25, 6);
    expect(frame.transition?.compositorPlan.shot.outgoing.opacity).toBeCloseTo(0.7, 6);
    expect(frame.transition?.compositorPlan.dialogue.incoming.opacity).toBeCloseTo(0.25, 6);
  });

  it('activates delayed overlapping transitions only at the effective boundary with raw progress already advanced', () => {
    const sequence = createSequence({
      clips: [
        createClip({ sceneId: 'scene-1', startTime: 0, endTime: 1 }),
        createClip({ sceneId: 'scene-2', startTime: 0, endTime: 1.2 }),
        createClip({ sceneId: 'scene-3', startTime: 0.4, endTime: 1.2 }),
      ],
      transitions: [
        createTransition({
          id: 'transition:scene-1->scene-2',
          selectionOrder: 0,
          effectiveStartTime: 0,
          effectiveEndTime: 0.8,
          fromSceneId: 'scene-1',
          toSceneId: 'scene-2',
          startTime: 0,
          endTime: 0.8,
          effect: 'fade-black',
        }),
        createTransition({
          id: 'transition:scene-2->scene-3',
          selectionOrder: 1,
          effectiveStartTime: 0.8,
          effectiveEndTime: 1.2,
          fromSceneId: 'scene-2',
          toSceneId: 'scene-3',
          startTime: 0.4,
          endTime: 1.2,
          effect: 'fade-white',
        }),
      ],
      duration: 1.2,
    });

    expect(findSequenceTransitionAtTime(sequence, 0.79)?.id).toBe('transition:scene-1->scene-2');
    const delayed = sampleSequenceTransition(sequence, 0.8);

    expect(delayed?.transition.id).toBe('transition:scene-2->scene-3');
    expect(delayed?.progress).toBeCloseTo(0.5, 5);
  });

  it('uses lower selectionOrder when multiple transitions are selectable', () => {
    const sequence = createSequence({
      clips: [
        createClip({ sceneId: 'scene-1', startTime: 0, endTime: 2 }),
        createClip({ sceneId: 'scene-2', startTime: 0, endTime: 2 }),
        createClip({ sceneId: 'scene-3', startTime: 0, endTime: 2 }),
      ],
      transitions: [
        createTransition({
          id: 'transition:scene-2->scene-3',
          selectionOrder: 1,
          effectiveStartTime: 0.5,
          effectiveEndTime: 1.5,
          fromSceneId: 'scene-2',
          toSceneId: 'scene-3',
          startTime: 0,
          endTime: 2,
          effect: 'cut',
        }),
        createTransition({
          id: 'transition:scene-1->scene-2',
          selectionOrder: 0,
          effectiveStartTime: 0.5,
          effectiveEndTime: 1.5,
          fromSceneId: 'scene-1',
          toSceneId: 'scene-2',
          startTime: 0,
          endTime: 2,
          effect: 'fade-black',
        }),
      ],
      duration: 2,
    });

    expect(findSequenceTransitionAtTime(sequence, 1)?.id).toBe('transition:scene-1->scene-2');
  });

  it('holds the previous clip across gaps between clips', () => {
    const sequence = createSequence({
      clips: [
        createClip({
          sceneId: 'scene-1',
          startTime: 0,
          endTime: 1,
          events: [{ type: 'narrate', at: 0, dur: 1, params: { text: 'First' } }],
        }),
        createClip({
          sceneId: 'scene-2',
          startTime: 2,
          endTime: 4,
          events: [{ type: 'narrate', at: 2, dur: 1, params: { text: 'Middle' } }],
        }),
        createClip({
          sceneId: 'scene-3',
          startTime: 4,
          endTime: 6,
          events: [{ type: 'narrate', at: 4, dur: 1, params: { text: 'Last' } }],
        }),
      ],
      duration: 6,
    });

    const clip = findSequenceSceneAtTime(sequence, 1.5);
    const frame = sampleSequence({ sequence, time: 1.5 });

    expect(clip?.sceneId).toBe('scene-1');
    expect(frame.currentSceneId).toBe('scene-1');
    expect(frame.single?.nextRenderState.narration?.text).toBe('First');
  });

  it('keeps prepareFrame compatibility-path plans in parity with the shared default transition channels', () => {
    const cases = [
      {
        effect: 'fade-black' as const,
        duration: 1,
        sampleTimes: [5.1, 5.45, 5.9],
      },
      {
        effect: 'dissolve' as const,
        duration: 1,
        sampleTimes: [5.55, 5.8, 6.2],
      },
      {
        effect: 'cut' as const,
        duration: 0.6,
        sampleTimes: [5.26, 5.5, 5.74],
      },
    ];

    for (const testCase of cases) {
      const channels = buildDefaultTransitionChannels(testCase.effect);

      for (const time of testCase.sampleTimes) {
        const frame = prepareFrame({
          time,
          sceneTimelines: [
            {
              sceneId: 'scene-1',
              events: [],
              startTime: 0,
              contentStartTime: 0,
              endTime: 5,
            },
            {
              sceneId: 'scene-2',
              events: [],
              startTime: 5.5,
              contentStartTime: 5.5,
              endTime: 8,
              transitionIn: { type: testCase.effect, duration: testCase.duration },
            },
          ],
          renderContext: createEmptyRenderContext(),
        });

        const progress = frame.transition?.progress;
        expect(progress).toBeTypeOf('number');

        const expectedShot = sampleSequenceTransitionChannel(channels.shot, progress!);
        const expectedDialogue = sampleSequenceTransitionChannel(channels.dialogue, progress!);

        expect(frame.transition?.compositorPlan.shot.outgoing.opacity).toBeCloseTo(expectedShot.outgoingOpacity, 6);
        expect(frame.transition?.compositorPlan.shot.incoming.opacity).toBeCloseTo(expectedShot.incomingOpacity, 6);
        expect(frame.transition?.compositorPlan.shot.throughColorOpacity).toBeCloseTo(expectedShot.throughColorOpacity, 6);
        expect(frame.transition?.compositorPlan.dialogue.outgoing.opacity).toBeCloseTo(expectedDialogue.outgoingOpacity, 6);
        expect(frame.transition?.compositorPlan.dialogue.incoming.opacity).toBeCloseTo(expectedDialogue.incomingOpacity, 6);
      }
    }
  });

  it('holds the last clip at its exact end boundary', () => {
    const sequence = createSequence({
      clips: [
        createClip({
          sceneId: 'scene-1',
          startTime: 0,
          endTime: 2,
          events: [{ type: 'narrate', at: 0, dur: 1, params: { text: 'First' } }],
        }),
        createClip({
          sceneId: 'scene-2',
          startTime: 2,
          endTime: 4,
          events: [{ type: 'narrate', at: 2, dur: 1, params: { text: 'Last' } }],
        }),
      ],
      duration: 4,
    });

    const clip = findSequenceSceneAtTime(sequence, 4);
    const frame = sampleSequence({ sequence, time: 4 });

    expect(clip?.sceneId).toBe('scene-2');
    expect(frame.currentSceneId).toBe('scene-2');
    expect(frame.single?.nextRenderState.narration?.text).toBe('Last');
  });

  it('holds the last clip after its end boundary', () => {
    const sequence = createSequence({
      clips: [
        createClip({
          sceneId: 'scene-1',
          startTime: 0,
          endTime: 2,
          events: [{ type: 'narrate', at: 0, dur: 1, params: { text: 'First' } }],
        }),
        createClip({
          sceneId: 'scene-2',
          startTime: 2,
          endTime: 4,
          events: [{ type: 'narrate', at: 2, dur: 1, params: { text: 'Last' } }],
        }),
      ],
      duration: 4,
    });

    const clip = findSequenceSceneAtTime(sequence, 5);
    const frame = sampleSequence({ sequence, time: 5 });

    expect(clip?.sceneId).toBe('scene-2');
    expect(frame.currentSceneId).toBe('scene-2');
    expect(frame.single?.nextRenderState.narration?.text).toBe('Last');
  });
});
