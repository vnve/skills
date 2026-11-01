# VNVE Skill

[简体中文](README.md) | **English**

**Give your story to an Agent. Preview, refine and export it as MP4 locally.**

VNVE is an Agent Skill for creating **visual novels, character dialogue videos and short narrative films**. Your host Agent organizes text into characters, scenes, dialogue, voice recordings and visual performance. A local browser editor lets you preview the result, adjust details and export a video while keeping the project editable.

[Website](https://vnve.github.io/skills/en/) · [Quick start](#quick-start) · [Download the CLI](https://github.com/vnve/skills/releases/tag/cli-v0.3.0) · [Creation guide](skills/vnve/SKILL.md) · [Documentation](#documentation) · [AI documentation index](llms.txt)

## Demo

![VNVE feature demo: character introductions, comic cut-ins, camera composition and lighting effects](docs/media/vnve-demo-preview.gif)

## What you can do

| Your task                             | What VNVE supports                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Turn text into a visual story         | Organize stories, dialogue or scripts into acts, scenes and lines, with backgrounds, characters and pacing                                       |
| Make the visuals follow the story     | Arrange character entrances, expressions, blocking, cameras, transitions, rain, snow, music, sound effects and line-by-line voice audio          |
| Create distinctive visual performance | Character introductions, comic cut-ins, confrontations, subjective awakening and memory fragments; combine layers, masks, lighting and particles |
| Keep editing an existing project      | Revise dialogue, replace media, add voice audio or ask the Agent to work on the character or line selected in the editor                         |
| Finish locally                        | Preview, adjust and autosave in the browser, then export MP4 while retaining an editable project                                                 |

**You are not limited to presets.** An Agent can write deterministic animation algorithms and bake them into numerical tracks, which are played by the shared preview and export pipeline. See [custom animation](skills/vnve/references/animation.md).

VNVE works well for visual-novel-style videos built around character dialogue and scene performance. Your host Agent calls the image, media and voice tools you choose; VNVE handles local project operations, preview, editing and video export.

## Quick start

### 1. Install the Skill

Ask your AI assistant:

> Please install vnve/skills for me.

Or use an Agent Skills installer:

```sh
npx skills add vnve/skills --skill vnve
```

Select your host Agent when prompted. For a local source checkout, you can also install from a directory, for example into Codex:

```sh
npx skills add /absolute/path/to/vnve-skill --skill vnve --agent codex --copy
```

The `npx` installer requires Node.js. Alternatively, copy [skills/vnve](skills/vnve) into a Skill directory supported by your host.

### 2. Install the standalone CLI

**The Skill and CLI are installed separately.** The command above installs the creation instructions; working with projects also requires the standalone CLI.

Download the binary for your platform and its matching `.sha256` file from the [cli-v0.3.0 release](https://github.com/vnve/skills/releases/tag/cli-v0.3.0), matching the [version contract](skills/vnve/cli.json):

| Platform              | Release asset          |
| --------------------- | ---------------------- |
| macOS · Apple Silicon | `vnve-darwin-arm64`    |
| Linux · x86_64        | `vnve-linux-x64`       |
| Windows · x64         | `vnve-windows-x64.exe` |

For other platforms, check the actual release assets or [build from source](#development). Verify the SHA-256 checksum, then make the binary executable on macOS / Linux. See the [installation guide](skills/vnve/references/installation.md) for details. Name the program `vnve` (keep `.exe` on Windows) and put it on your PATH, or run it by its absolute path:

```sh
vnve doctor
```

The CLI embeds its runtime, editor and animation SDK. Running a released binary does not require Node.js, Bun, a source checkout or `node_modules`. Platform availability depends on published assets and verification on the target system, not just build targets.

### 3. Ask your Agent to create a project

In a host with the Skill installed, try:

> Use VNVE Skill to turn the story below into an English visual novel short of about one minute. Start with one playable scene in a school-at-sunset setting, without voice audio for now. Save it in the workspace I specify, then open the local editor for preview.
>
> Story: After school, two old friends meet again in an empty classroom…

To continue editing:

> Use VNVE Skill to continue editing this project. Make the second line sound more hesitant, add a character reaction after “actually,” and check the revised pacing.

Provide your story, save location and any preferences for style, duration or aspect ratio. The Agent inspects the actual project, uses media and audio tools as needed, and gives you an editor link for that project.

### 4. Preview, refine and export

Open the complete launch URL printed by the CLI. Check dialogue, artwork, timing and audio in the editor, make adjustments and export MP4. Desktop Chrome / Edge are recommended. A host's built-in browser can also preview projects, but its actual encoding capability must be verified for export.

The editor autosaves. When the Agent changes a project through the CLI, the page loads the new version; unsaved page changes are written to a recovery copy first. Launch URLs contain temporary access credentials and should not be shared publicly.

## Media, voice and local data

An [optional starter asset pack](skills/vnve/assets/README.md) is included. You can also import your own images, recordings, music, sound effects and fonts. Character identity is separate from its media, and assets can be shared across projects in the same workspace.

Your host Agent performs image generation, media search and text-to-speech (TTS) through the tools you choose. Creating or opening a project and saving service settings do not automatically call paid services. You can start without voice audio. See the asset pack documentation and individual provenance records for media sources and licensing.

Projects and shared media stay in your chosen workspace. Provider credentials are stored separately in user-level settings, outside projects, recovery copies and media provenance. See the [CLI guide](skills/vnve/references/cli-guide.md) for file layout and saving behavior.

## FAQ

### Does VNVE include a chat Agent in the browser?

Creation happens in your host Agent. VNVE provides the Skill, standalone CLI and local browser editor. WorkBuddy is the host used in the demo; other hosts that support Agent Skills and local CLI execution can also integrate, depending on their capabilities.

### Can I try it without my own assets or a TTS service?

Yes. Use the optional starter pack to create a project without voice audio, import your own media, or let your host Agent call your chosen media and TTS services. External services may charge separately; opening projects and saving settings do not trigger those calls.

### Is the output only a video?

You keep an editable local project and shared media. The browser exports MP4 using the same compilation, frame sampling and audio semantics as preview.

### What needs Node.js?

The `npx skills` installer needs Node.js. The released standalone CLI includes its runtime and runs without Node.js, Bun or a source checkout. MP4 export requires a desktop browser with working encoding support.

## Documentation

The detailed guides linked below are currently primarily in Chinese; commands, paths and schema field names remain unchanged.

| Topic                                       | Start here                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Project facts and AI reading entry points   | [llms.txt](llms.txt)                                                                                     |
| Full Agent creation workflow                | [SKILL.md](skills/vnve/SKILL.md)                                                                         |
| CLI installation and version checks         | [Installation](skills/vnve/references/installation.md)                                                   |
| CLI commands, files and saving              | [CLI guide](skills/vnve/references/cli-guide.md)                                                         |
| Story structure, pacing and delivery checks | [Production](skills/vnve/references/production.md)                                                       |
| Artwork, media and audio                    | [Art direction](skills/vnve/references/art-direction.md) · [Media](skills/vnve/references/media.md)      |
| Custom animation and dialogue layout        | [Animation](skills/vnve/references/animation.md) · [Dialogue themes](skills/vnve/references/dialogue.md) |
| Runtime schemas and atomic edits            | [Runtime contract](skills/vnve/references/runtime.md) · [Editing](skills/vnve/references/editing.md)     |

## Development

This repository contains the Skill, CLI, editor and tests. Development requires Node.js 22.20+ and pnpm; a pinned Bun version is provided as a development dependency.

```sh
git clone https://github.com/vnve/skills.git
cd skills
pnpm install --frozen-lockfile
pnpm build
mkdir -p /tmp/vnve-debug
pnpm vnve create /tmp/vnve-debug "Demo project"
# Replace PROJECT_ID with entry.projectId from the create output.
pnpm dev -- /tmp/vnve-debug --project PROJECT_ID
```

Open the complete launch URL printed by the server. The editor supports hot reload; restarting the local server requires a new launch URL. Binaries are built into `dist/vnve-<target>` with checksums and source digests, and distributed as release assets rather than committed to source Git.

Common checks:

```sh
pnpm typecheck
pnpm build
pnpm check:skill
pnpm test
pnpm test:install
```

Run real-browser acceptance with `pnpm test:browser --browser-label=codex-in-app`; see [browser acceptance](docs/browser-acceptance.md). Unit tests do not replace actual MP4 encoding checks, and real voice audio needs separate verification.

Before contributing, read [AGENTS.md](AGENTS.md) and the [glossary](GLOSSARY.md). See also [development](docs/skill-development.md), [architecture](docs/architecture.md) and [publishing](docs/publishing.md). Historical project format compatibility and automatic project migration are not currently provided.

## License and releases

Source code and project documentation use the [MIT License](LICENSE). Dependencies and media retain their respective licenses; see the [asset pack documentation](skills/vnve/assets/README.md) and provenance records. The required CLI version is declared in [cli.json](skills/vnve/cli.json); download availability and platform support depend on actual release assets and verification.
