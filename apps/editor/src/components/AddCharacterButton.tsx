// Compact adaptation of vnve AssetPickerPopover for existing character identities.
import { UserRoundPlus } from "lucide-react";
import type { Project, Scene } from "@vnve/core";
import { IconButton } from "../EditorControls";
import { sceneCharacters } from "../scene-characters";
import { mediaUrl } from "../panels/shared";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";

export function AddCharacterButton({
  project,
  scene,
  disabled,
  add,
}: {
  project: Project;
  scene: Scene;
  disabled: boolean;
  add: (subjectId: string) => void;
}) {
  const characters = sceneCharacters(project, scene);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          label="添加人物"
          disabled={disabled}
          className="text-white/60 hover:bg-white/5 hover:text-white/90 focus-visible:ring-1 data-[state=open]:bg-white/5"
        >
          <UserRoundPlus />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-64 w-56 overflow-y-auto"
        aria-label="添加已有人物"
      >
        {characters.length ? (
          characters.map((character) => (
            <DropdownMenuItem
              key={character.id}
              disabled={disabled || character.added || !character.usable}
              onSelect={() => add(character.id)}
            >
              {character.variant && (
                <img
                  className="size-7 shrink-0 rounded bg-white/5 object-contain"
                  src={mediaUrl(
                    character.variant.thumbnailUrl ?? character.variant.url,
                  )}
                  alt=""
                />
              )}
              <span className="min-w-0 flex-1 truncate">{character.name}</span>
              {character.added ? (
                <span className="shrink-0 text-xs text-white/40">已添加</span>
              ) : !character.usable ? (
                <span className="shrink-0 text-xs text-white/40">缺少立绘</span>
              ) : null}
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>暂无已有的人物</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
