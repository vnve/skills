import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const speech = "今天的教室很安静，我们一起检查画面、声音和转场。";
export const title = "浏览器核心验收";

/** All writes go to a newly created run directory, through the shipped CLI. */
export async function prepareFixture({ root, directory, binary }) {
  const workspace = path.join(directory, "workspace");
  const inputs = path.join(directory, "inputs");
  await mkdir(inputs);
  await mkdir(workspace);
  const cli = (...args) =>
    JSON.parse(
      execFileSync(binary, args, {
        cwd: directory,
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, BUN_BE_BUN: "0" },
      }),
    );
  let serial = 0;
  async function input(name, value) {
    const file = path.join(inputs, `${++serial}-${name}.json`);
    await writeFile(file, JSON.stringify(value, null, 2));
    return file;
  }
  const doctor = cli("doctor");
  assert.equal(doctor.ok, true);
  const script = {
    title,
    characters: [
      { name: "小夏", description: "验收角色一" },
      { name: "阿明", description: "验收角色二" },
    ],
    backgrounds: [
      { name: "教室", description: "验收背景一" },
      { name: "走廊", description: "验收背景二" },
    ],
    acts: [
      {
        name: "核心链路",
        scenes: [
          {
            name: "第一场",
            background: "教室",
            lines: [
              { speaker: "小夏", text: speech },
              { speaker: "阿明", text: "镜头移动，音效响起。" },
            ],
          },
          {
            name: "第二场",
            background: "走廊",
            lines: [{ speaker: "阿明", text: speech }],
          },
        ],
      },
    ],
  };
  const created = cli(
    "create",
    workspace,
    title,
    "--script",
    await input("script", script),
  );
  const id = created.entry.projectId;
  const [scene1, scene2] = created.project.acts[0].scenes;
  const [line1, line2] = scene1.script.nodes;
  const asset = (...parts) => path.join(root, "skills/vnve/assets", ...parts);
  const media = [];
  for (const [kind, files] of [
    [
      "character",
      ["character/校园-女1/默认.webp", "character/校园-男1/默认.webp"],
    ],
    [
      "background",
      ["background/校园-教室/默认.webp", "background/校园-走廊/默认.webp"],
    ],
  ]) {
    created.assets.visual[kind].forEach((group, index) =>
      media.push({ kind, groupId: group.id, file: asset(files[index]) }),
    );
  }
  for (const name of ["开心", "惊讶"])
    media.push({
      kind: "character",
      groupId: created.assets.visual.character[0].id,
      register: true,
      name,
      file: asset(`character/校园-女1/${name}.webp`),
    });
  media.push({ kind: "bgm", name: "验收BGM", file: asset("bgm/轻松小岛.ogg") });
  media.push({
    kind: "sfx",
    name: "验收音效",
    file: asset("sfx/确认提示.ogg"),
  });
  const imported = cli("import", workspace, id, await input("media", media));
  const happy = imported.items.at(-4).variantId;
  const surprised = imported.items.at(-3).variantId;
  const voice = path.join(root, "tests/browser/fixtures/voice.wav");
  const voices = [scene1, scene2].map((scene) => ({
    kind: "voice",
    file: voice,
    sceneId: scene.id,
    nodeId: scene.script.nodes[0].id,
    expectedText: speech,
    expectedActorId: scene.script.nodes[0].actorId,
  }));
  cli("import", workspace, id, await input("voices", voices));
  const source = path.join(inputs, "animation.js");
  await writeFile(
    source,
    `({sdkVersion:2,id:'acceptance-camera',name:'验收镜头',sceneId:${JSON.stringify(scene1.id)},duration:1.2,seed:17,build({camera,sample,scene,timeline,mask}){
      sample(camera(),{start:0,duration:1.2,sampleRate:60,sample:({localTime})=>({x:Math.sin(localTime*5)*2,scale:1+0.04*Math.sin(localTime*2)})});
      const bounds={x:0,y:0,width:1920,height:1080};
      const g=scene.group({id:'subject',bounds,members:[{kind:'actor',actorId:${JSON.stringify(scene1.actors[0].id)}}],mask:{type:'ellipse',x:960,y:540,radiusX:1100,radiusY:1000}});
      timeline().to(mask(g),{radiusX:950,duration:1.2});
      scene.group({id:'glow',bounds,blendMode:'screen',cameraFactor:0.5,mask:{type:'rect',width:1920,height:960}});
      scene.circle({id:'light',parentId:'glow',x:350,y:200,radius:160,fill:'#244060',opacity:0.2});
      scene.particles({id:'dust',parentId:'glow',blendMode:'add',particles:Array.from({length:24},(_,i)=>({id:'p'+i,birth:0,lifetime:1.2,radius:2,sampleRate:10,sample:({localTime,random})=>({x:random(1)*1920+localTime*20,y:random(2)*900,opacity:0.4})}))});
    }})`,
  );
  const animation = path.join(inputs, "animation.json");
  const repeated = path.join(inputs, "animation-repeat.json");
  cli("animation", "build", workspace, id, source, animation);
  cli("animation", "build", workspace, id, source, repeated);
  assert.deepEqual(await readFile(animation), await readFile(repeated));
  const { clip } = JSON.parse(await readFile(animation, "utf8"));
  async function patch(operations) {
    const preview = cli(
      "patch",
      workspace,
      id,
      await input("plan", { summary: "浏览器验收", operations }),
    );
    return cli("apply", workspace, await input("preview", preview));
  }
  await patch([
    { type: "animation.set", sceneId: scene1.id, clip },
    {
      type: "direction.insert",
      sceneId: scene1.id,
      nodeId: line1.id,
      contentIndex: 0,
      direction: {
        name: "bgm",
        params: {
          asset: imported.items.at(-2).assetId,
          volume: 0.18,
          fade: 0.2,
          loop: true,
          duck: 0.3,
        },
      },
    },
    {
      type: "dialogue.content.update",
      sceneId: scene1.id,
      nodeId: line2.id,
      content: [
        { type: "text", text: "镜头移动，" },
        {
          type: "tag",
          name: "set",
          params: {
            target: scene1.actors[0].id,
            variant: happy,
            with: "fade",
            dur: 0.4,
            await: false,
          },
        },
        {
          type: "tag",
          name: "sfx",
          params: { asset: imported.items.at(-1).assetId, volume: 0.6 },
        },
        {
          type: "tag",
          name: "animation",
          params: { clipId: clip.id, await: false },
        },
        { type: "text", text: "音效" },
        {
          type: "tag",
          name: "set",
          params: {
            target: scene1.actors[0].id,
            variant: surprised,
            with: "fade",
            dur: 0.3,
            await: false,
          },
        },
        { type: "text", text: "响起。" },
      ],
    },
    {
      type: "scene.update",
      sceneId: scene2.id,
      transition: { type: "dissolve", duration: 0.6 },
    },
  ]);
  const inspect = () => cli("inspect", workspace, id);
  const compile = () => cli("compile", workspace, id);
  const checked = cli("check", workspace, id);
  assert.equal(checked.ok, true);
  return {
    workspace,
    id,
    scene1: scene1.id,
    scene2: scene2.id,
    line1: line1.id,
    line2: line2.id,
    doctor,
    inspect,
    compile,
    patch,
    voice,
    line2Tags: inspect()
      .project.acts[0].scenes[0].script.nodes.find((n) => n.id === line2.id)
      .content.filter((n) => n.type === "tag"),
  };
}
