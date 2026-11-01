// Controls and layout adapted from vnve SceneProperties / DialoguePropertiesPanel.
import React, { useEffect, useState } from "react";
import { Link, Unlink } from "lucide-react";
import {
  sceneTransitionOptions,
  areSceneSettingsLinked,
  resolveSceneSettings,
  type SceneSettings as Settings,
  type Project,
  type Scene,
  type SceneTransitionType,
  type ProjectPatchPlan,
} from "@vnve/core";
import { CompactSelect } from "../CompactSelect";
import { NumberField } from "../NumberField";
import { IconButton } from "../EditorControls";
import { Switch } from "./ui/switch";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";

export function SceneSettings({
  project,
  currentScene,
  patch,
}: {
  project: Project;
  currentScene: Scene;
  patch: (ops: ProjectPatchPlan["operations"]) => boolean;
}) {
  const [confirmLink, setConfirmLink] = useState(false);
  useEffect(() => setConfirmLink(false), [currentScene.id, project.meta.id]);
  const settings = resolveSceneSettings(currentScene, project.meta);
  const linked = areSceneSettingsLinked(currentScene);
  const type = settings.transition?.type ?? "cut";
  const duration = settings.transition?.duration || 0.8;
  const change = (settings: Settings) =>
    patch([
      { type: "scene.settings.update", sceneId: currentScene.id, settings },
    ]);
  const link = (linked: boolean) =>
    patch([{ type: "scene.settings.link", sceneId: currentScene.id, linked }]);
  const toggleLink = () => {
    if (linked) {
      link(false);
      return;
    }
    const defaults = resolveSceneSettings(
      { ...currentScene, sceneSettingsLinked: true },
      project.meta,
    );
    const normalized = (value: Settings) => ({
      ...value,
      transition:
        value.transition?.type === "cut" ? { type: "cut" } : value.transition,
    });
    if (
      JSON.stringify(normalized(settings)) ===
      JSON.stringify(normalized(defaults))
    )
      link(true);
    else setConfirmLink(true);
  };
  const entranceEffects = [
    { value: "fade", label: "淡入" },
    { value: "slide-left", label: "从左滑入" },
    { value: "slide-right", label: "从右滑入" },
    { value: "slide-up", label: "从下滑入" },
    { value: "slide-down", label: "从上滑入" },
  ];
  return (
    <section
      className="scene-settings-compact vnve-ui"
      aria-label="场景演出与节奏"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="text-xs text-white/60">
          {linked ? "与作品设置联动" : "仅修改当前场景"}
        </span>
        <IconButton
          label={linked ? "取消链接，独立设置本场" : "恢复与作品设置链接"}
          aria-pressed={linked}
          className={linked ? "text-brand" : "text-white/50"}
          onClick={toggleLink}
        >
          {linked ? <Link /> : <Unlink />}
        </IconButton>
      </div>
      <div className="scene-settings-group">
        <h3 className="m-0 mb-3 text-xs font-medium text-white/70">场景转场</h3>
        <div className="scene-setting-row">
          <span>进入转场</span>
          <CompactSelect
            label="进入本场的转场"
            value={type}
            options={[...sceneTransitionOptions]}
            onValueChange={(type) =>
              change({
                transition: {
                  type: type as SceneTransitionType,
                  duration: type === "cut" ? 0 : duration,
                },
              })
            }
          />
        </div>
        {type !== "cut" && (
          <label className="scene-setting-row">
            时长（秒）
            <NumberField
              aria-label="转场时长"
              min={0.2}
              max={Math.max(2, duration)}
              step={0.1}
              value={duration}
              onCommit={(duration) =>
                change({
                  transition: { type: type as SceneTransitionType, duration },
                })
              }
            />
          </label>
        )}
      </div>
      <div className="scene-settings-group mt-5 border-t border-white/10 pt-4">
        <h3 className="m-0 mb-3 text-xs font-medium text-white/70">台词节奏</h3>
        <div className="scene-setting-row">
          <span>显示方式</span>
          <CompactSelect
            label="台词显示方式"
            value={settings.defaultDisplayMode ?? "typewriter"}
            options={[
              { value: "typewriter", label: "逐字显示" },
              { value: "line", label: "逐行显示" },
              { value: "instant", label: "立即显示" },
            ]}
            onValueChange={(mode) =>
              change({
                defaultDisplayMode: mode as Settings["defaultDisplayMode"],
              })
            }
          />
        </div>
        <label className="scene-setting-row">
          阅读节奏（倍）
          <NumberField
            aria-label="阅读节奏"
            min={Math.min(0.5, settings.readingPace ?? 1)}
            max={Math.max(2, settings.readingPace ?? 1)}
            step={0.05}
            value={settings.readingPace ?? 1}
            onCommit={(readingPace) => change({ readingPace })}
          />
        </label>
        <label className="scene-setting-row">
          句间停顿（秒）
          <NumberField
            aria-label="句间停顿"
            min={0}
            max={Math.max(0.8, settings.lineGap ?? 0.15)}
            step={0.01}
            value={settings.lineGap ?? 0.15}
            onCommit={(lineGap) => change({ lineGap })}
          />
        </label>
        <p className="mt-2 text-[10px] leading-relaxed text-white/35">
          阅读节奏调整文字显示和无配音时的停留，不改变配音速度。
        </p>
      </div>
      <div className="scene-settings-group mt-5 border-t border-white/10 pt-4">
        <h3 className="m-0 mb-3 text-xs font-medium text-white/70">人物演出</h3>
        <div className="scene-setting-row">
          <span>自动出场</span>
          <Switch
            aria-label="自动出场"
            checked={settings.autoEntrance}
            onCheckedChange={(autoEntrance) => change({ autoEntrance })}
          />
        </div>
        {settings.autoEntrance && (
          <div className="scene-setting-row">
            <span>出场效果</span>
            <CompactSelect
              label="默认出场效果"
              value={settings.entranceEffect ?? "fade"}
              options={entranceEffects}
              onValueChange={(entranceEffect) => change({ entranceEffect })}
            />
          </div>
        )}
        <label className="scene-setting-row">
          非说话人物亮度
          <NumberField
            aria-label="非说话人物亮度"
            min={0}
            max={100}
            step={5}
            value={Math.round((settings.dimBrightness ?? 0.75) * 100)}
            onCommit={(value) => change({ dimBrightness: value / 100 })}
          />
        </label>
        <p className="mt-2 text-[10px] text-white/35">
          100 为不变暗，0 为全暗。
        </p>
        <div className="scene-setting-row mt-3">
          <span>说话人物放大</span>
          <Switch
            aria-label="说话人物放大"
            checked={settings.speakerScale}
            onCheckedChange={(speakerScale) => change({ speakerScale })}
          />
        </div>
      </div>
      <Dialog open={confirmLink} onOpenChange={setConfirmLink}>
        <DialogContent className="vnve-ui sm:max-w-md">
          <DialogHeader>
            <DialogTitle>恢复与作品设置链接？</DialogTitle>
            <DialogDescription>
              本场的转场、台词节奏和人物演出将采用作品设置。对白主题和位置保持不变。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmLink(false)}>
              取消
            </Button>
            <Button
              variant="brand"
              onClick={() => {
                if (link(true)) setConfirmLink(false);
              }}
            >
              恢复链接
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
