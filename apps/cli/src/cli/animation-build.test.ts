import { describe, it, expect } from "vitest";
import { buildAnimationSource } from "./animation-build";
import { compileAnimation } from "@vnve/compiler";
import { sampleAnimationTrack } from "@vnve/runtime";
import { disposeTimeline } from "@vnve/parser";
const context = {
  width: 1920,
  height: 1080,
  cues: [{ nodeId: "line", start: 0, end: 3 }],
};
const source = (body: string, meta = "") =>
  `({sdkVersion:2,id:'trial',name:'Trial',sceneId:'scene',duration:3,sampleRate:10,${meta}build({scene,target,timeline,actor,camera,at,sample,math,query}){${body}}})`;
const compile = async (code: string) => {
  const clip = await buildAnimationSource(code, context);
  const result = compileAnimation(
    clip,
    context.cues.map((c, index) => ({
      ...c,
      index,
      sceneId: "scene",
      text: "Text",
      revealDuration: 1,
    })),
    10,
    context,
  );
  disposeTimeline(result.tree);
  return result.compiled;
};
describe("unified animation authoring", () => {
  it("records a portable GSAP recipe and bakes actor, camera and visual targets deterministically", async () => {
    const code = source(
      `const n=scene.text({id:'title',text:'TITLE',fontSize:40});const a=actor('hero'),c=camera(),v=target(n,{x:0,opacity:0});timeline().addLabel('enter',at.line('line','start',0.2)).to(a,{x:20,duration:1,ease:'power2.out'},'enter').to(c,{scale:1.1,duration:1},'enter').to(v,{x:100,opacity:1,duration:1},'enter');`,
    );
    const recipe = await buildAnimationSource(code, context);
    expect(recipe).toEqual(await buildAnimationSource(code, context));
    expect(recipe.timelines[0].operations[0].position).toEqual({
      nodeId: "line",
      edge: "start",
      offset: 0.2,
    });
    const built = await compile(code);
    const x = built.tracks.find(
      (t) => t.targetId === "actor:hero" && t.property === "x",
    )!;
    expect(sampleAnimationTrack(x, 0.7)).toBeCloseTo(17.5);
    expect(JSON.stringify(built)).not.toContain('"_gsap"');
  });
  it("preserves instantaneous set discontinuities rather than interpolating them across a frame", async () => {
    const clip = await compile(
      source(`const c=camera();timeline().set(c,{x:30},0.55);`),
    );
    const track = clip.tracks.find((t) => t.property === "x")!;
    expect(sampleAnimationTrack(track, 0.549)).toBe(0);
    expect(sampleAnimationTrack(track, 0.55)).toBe(30);
    expect(sampleAnimationTrack(track, 1)).toBe(30);
  });
  it("supports stagger, repeat/yoyo and delayed fromTo without depending on seek order", async () => {
    const clip = await compile(
      source(
        `const a=actor('a'),b=actor('b');timeline().to([a,b],{x:10,duration:0.5,stagger:0.2,repeat:1,yoyo:true,ease:'none'},0).fromTo(camera(),{scale:2},{scale:1,duration:1,ease:'none'},1);`,
      ),
    );
    const track = clip.tracks.find(
      (t) => t.targetId === "actor:a" && t.property === "x",
    )!;
    expect(sampleAnimationTrack(track, 0.5)).toBeCloseTo(10);
    expect(sampleAnimationTrack(track, 1.4)).toBeCloseTo(0);
  });
  it("keeps arbitrary deterministic sample algorithms within the same target model", async () => {
    const clip = await compile(
      source(
        `const a=actor('hero');sample(a,{start:0,duration:1.25,sampleRate:2,sample:({localTime})=>({x:localTime*10})});`,
      ),
    );
    const track = clip.tracks.find((t) => t.property === "x")!;
    expect(sampleAnimationTrack(track, 1.125)).toBeCloseTo(11.25);
  });
  it("rejects source that depends on evaluation order", async () => {
    await expect(
      buildAnimationSource(
        source(
          `let i=0;sample(camera(),{start:0,duration:1,sample:()=>({x:i++})});`,
        ),
        context,
      ),
    ).rejects.toThrow("sampling order");
  });
  it("terminates unbounded author code in its own process", async () => {
    await expect(
      buildAnimationSource(source("while(true){}"), context, undefined, 200),
    ).rejects.toThrow("timed out");
  });
  it.each([
    ["timeline().to(camera(),{x:10,duration:1,repeat:-1});", "finite"],
    ["timeline().to(camera(),{x:10,duration:1,onUpdate:()=>{}});", "onUpdate"],
    ['timeline().to(camera(),{x:"random(0,10)",duration:1});', "Unsupported"],
    ["timeline().to(camera(),{bad:10,duration:1});", "Initialize"],
  ])("rejects invalid timeline operations: %s", async (body, message) => {
    await expect(buildAnimationSource(source(body), context)).rejects.toThrow(
      message,
    );
  });
  it("marks explicitly queried algorithm inputs stale instead of rerunning source in playback", async () => {
    const recipe = await buildAnimationSource(
      source(
        `const width=query.width();sample(camera(),{start:0,duration:1,sample:()=>({x:width/1000})});`,
      ),
      context,
    );
    expect(() =>
      compileAnimation(recipe, [], 3, { width: 1280, height: 720 }),
    ).toThrow("ANIMATION_REBUILD_REQUIRED");
  });
});

it("requires an explicit rebuild when a parameter used by the source is changed", async () => {
  const code = `({sdkVersion:2,id:'parameter',name:'Parameter',sceneId:'scene',duration:1,parameters:{strength:1},build({camera,timeline,parameters}){timeline().to(camera(),{x:parameters.strength,duration:1});}})`;
  const parameter = await buildAnimationSource(code, context);
  parameter.parameters.strength = 2;
  expect(() => compileAnimation(parameter, [], 3, context)).toThrow(
    "ANIMATION_REBUILD_REQUIRED",
  );
});

it("places an algorithm at a symbolic dialogue marker without rerunning its source", async () => {
  const recipe = await buildAnimationSource(
    source(
      `sample(camera(),{duration:1,sample:({localTime})=>({x:localTime*10})},at.line('line','end',0.2));`,
    ),
    context,
  );
  const cues = context.cues.map((c, index) => ({
    ...c,
    end: 4,
    index,
    sceneId: "scene",
    text: "Changed",
    revealDuration: 1,
  }));
  recipe.duration = 6;
  const result = compileAnimation(recipe, cues, 10, context);
  disposeTimeline(result.tree);
  const x = result.compiled.tracks.find((t) => t.property === "x")!;
  expect(sampleAnimationTrack(x, 4.7)).toBeCloseTo(5);
});
