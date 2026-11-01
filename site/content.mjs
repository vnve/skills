export default {
  zh: {
    lang: "zh-CN",
    title: "VNVE | 用 Agent 创作视觉故事",
    description:
      "将故事文本交给 Agent，编排人物、对白、镜头与特效。在本地浏览器预览、微调并导出 MP4。支持自定义演出与中英文创作。",
    nav: ["演出能力", "创作流程", "开始使用"],
    switch: "English",
    eyebrow: "文本创作，有了画面。",
    hero: "把文字，<br>演成故事。",
    intro: "让 Agent 编排人物、对白与演出，在本地浏览器完成微调与 MP4 导出。",
    start: "开始创作",
    repo: "查看源码",
    demo: "25 秒功能演示",
    demoNote: "真实界面与演出片段 · 静音字幕",
    features: "故事的表现力，<br>由你来定义。",
    featureIntro:
      "从一个眼神，到一段回忆。让演出跟随叙事，也让 Agent 自由组合新的效果。",
    tabs: ["人物介绍", "漫画切入", "光影粒子"],
    demoPlay: "点击切换并播放演出",
    capabilities: [
      [
        "人物与对白",
        "安排出入场、表情、站位与逐句配音，让角色拥有自己的节奏。",
      ],
      [
        "镜头与空间",
        "用构图、推进、拉焦、遮罩与转场，决定观众在此刻关注什么。",
      ],
      [
        "超越效果预设",
        "让 Agent 组合图层、光影、粒子，或编写动画算法，烘焙成可播放的演出。",
      ],
    ],
    workflow: "从故事开始，<br>在你的电脑上完成。",
    flow: [
      ["写下故事", "提供文本、对白或现有剧本，以及你期待的风格。"],
      ["交给 Agent", "宿主 Agent 组织场景、素材、声音与演出。"],
      ["亲手微调", "在本地编辑器预览，继续调整剧本与画面。"],
      ["导出作品", "保留可编辑项目，在浏览器中导出 MP4。"],
    ],
    editorAlt: "VNVE 本地编辑器：场景导航、人物画面、播放进度和对白编辑",
    install: "给你的 Agent，<br>装上 VNVE。",
    installIntro: "先安装 Skill，再配置独立 CLI，就可以从第一个场景开始。",
    promptLabel: "直接告诉你的 AI 助手",
    prompt: "请你帮我安装 vnve/skills，并完成匹配版本的 CLI 配置。",
    cliLabel: "或使用命令行安装 Skill",
    copy: "复制",
    copied: "已复制",
    failed: "请选择文字复制",
    binaryTitle: "运行作品，还需要独立 CLI",
    binaryText:
      "Skill 与 CLI 分开安装。下载与你的平台匹配的程序及 .sha256 文件，校验后运行 vnve doctor。独立 CLI 自带运行时。",
    binaries: ["macOS · Apple Silicon", "Linux · x86_64", "Windows · x64"],
    guide: "完整安装指南",
    morePlatforms:
      "其他平台请查看发布附件或源码构建说明。npx 安装器需要 Node.js，已发行 CLI 的运行不依赖 Node.js 或 Bun。",
    faqTitle: "开始之前，你可能想知道",
    faqs: [
      [
        "VNVE 自带网页 Agent 吗？",
        "创作发生在你使用的宿主 Agent 中。VNVE 提供 Skill、独立 CLI 与本地浏览器编辑器。WorkBuddy 是演示宿主，其他支持 Agent Skills 与本地命令执行的宿主也可接入。",
      ],
      [
        "素材和配音从哪里来？",
        "可以使用可选起步素材包、导入自有图片与音频，或由宿主 Agent 调用你选择的生图和 TTS 工具。没有配音服务时，也能先制作无配音作品。",
      ],
      [
        "作品与数据保存在什么地方？",
        "项目与共享素材保存在你指定的本地 workspace，服务凭据单独存储。若选择外部生图或配音服务，相关输入会由宿主发送给该服务。",
      ],
      [
        "会自动调用付费服务吗？",
        "不会。打开作品和保存服务配置不触发外部调用。素材生成、检索与配音由宿主按你的选择执行，第三方服务可能另外收费。",
      ],
      [
        "演出只能从预设中选择吗？",
        "不只如此。宿主可以编写确定性动画算法，把人物、镜头、图层、遮罩与粒子编排成数值轨道。浏览器播放经过验证的数据，并复用相同逻辑预览与导出。",
      ],
    ],
    footer: "让每一个故事，都有自己的演出。",
    docs: "创作指南",
    index: "AI 文档索引",
    license: "代码许可 MIT",
    accessibility: "跳到正文",
    technicalNote:
      "演示由实际操作与导出片段剪辑，部分素材预先准备。展示的是能力与流程，不代表完整制作耗时。",
  },
  en: {
    lang: "en",
    title: "VNVE | Create visual stories with your Agent",
    description:
      "Turn text into editable visual stories with AI agents. Compose characters, dialogue, cameras and custom effects, then preview locally and export MP4 in your browser.",
    nav: ["Capabilities", "Workflow", "Get started"],
    switch: "简体中文",
    eyebrow: "A new scene for your words.",
    hero: "Words in.<br>Stories out.",
    intro:
      "Let your Agent compose the story. Refine it in a local browser editor and export MP4.",
    start: "Get started",
    repo: "View source",
    demo: "25-second walkthrough",
    demoNote: "Real interface and rendered scenes · Silent captions",
    features: "Your story.<br>Your visual language.",
    featureIntro:
      "From a glance to a fragmented memory. Shape the performance around the story, or let your Agent compose something new.",
    tabs: ["Introductions", "Comic cut-ins", "Light & particles"],
    demoPlay: "Choose an example to play",
    capabilities: [
      [
        "Characters & dialogue",
        "Arrange entrances, expressions, blocking and line-by-line voice audio to give each character a rhythm.",
      ],
      [
        "Cameras & space",
        "Guide attention with composition, pushes, focus shifts, masks and transitions.",
      ],
      [
        "Beyond presets",
        "Combine layers, lighting and particles, or let your Agent write deterministic animation algorithms and bake playable tracks.",
      ],
    ],
    workflow: "Start with a story.<br>Finish on your machine.",
    flow: [
      [
        "Write the story",
        "Bring text, dialogue or an existing script, plus your preferred style.",
      ],
      [
        "Let the Agent create",
        "Your host organizes scenes, media, voice audio and performance.",
      ],
      [
        "Refine it yourself",
        "Preview locally and adjust the script, characters and visual details.",
      ],
      [
        "Export your work",
        "Keep the editable project and encode MP4 in your browser.",
      ],
    ],
    editorAlt:
      "VNVE local editor with scene navigation, characters, playback controls and dialogue editing",
    install: "Give your Agent<br>a new creative tool.",
    installIntro:
      "Install the Skill and matching standalone CLI. Then start with your first scene.",
    promptLabel: "Ask your AI assistant",
    prompt:
      "Please install vnve/skills and configure the matching standalone CLI.",
    cliLabel: "Or install the Skill from your terminal",
    copy: "Copy",
    copied: "Copied",
    failed: "Select and copy the text",
    binaryTitle: "Projects also need the standalone CLI",
    binaryText:
      "The Skill and CLI are installed separately. Download the binary and matching .sha256 file, verify it, then run vnve doctor. Released binaries include their runtime.",
    binaries: ["macOS · Apple Silicon", "Linux · x86_64", "Windows · x64"],
    guide: "Installation guide",
    morePlatforms:
      "For other platforms, check release assets or build from source. The npx installer needs Node.js; released CLI binaries run without Node.js or Bun.",
    faqTitle: "A few things worth knowing",
    faqs: [
      [
        "Does VNVE include a browser chat Agent?",
        "Creation happens in your host Agent. VNVE provides a Skill, standalone CLI and local browser editor. WorkBuddy is the demonstrated host; other hosts supporting Agent Skills and local CLI execution can also integrate.",
      ],
      [
        "Where do media and voice audio come from?",
        "Use the optional starter assets, import your own images and audio, or let your host call image and TTS tools you choose. You can start without voice audio.",
      ],
      [
        "Where is my work stored?",
        "Projects and shared media are stored in your chosen local workspace. Provider credentials are separate. If you choose an external generation or TTS service, your host sends the relevant input to that provider.",
      ],
      [
        "Does it call paid services automatically?",
        "No. Opening projects and saving settings do not trigger external calls. Your host handles media generation, search and TTS according to your choices. Third-party services may charge separately.",
      ],
      [
        "Am I limited to built-in effects?",
        "No. Your host can write deterministic animation algorithms and bake character, camera, layer, mask and particle performance into numerical tracks. The browser plays validated data using the same logic for preview and export.",
      ],
    ],
    footer: "Every story deserves its own performance.",
    docs: "Creation guide",
    index: "AI documentation",
    license: "Code licensed MIT",
    accessibility: "Skip to content",
    technicalNote:
      "The demo combines real operations and rendered scenes. Some assets were prepared beforehand; it illustrates capabilities and workflow rather than end-to-end production time.",
  },
};
