import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { CompactSelect } from "../CompactSelect";
import { useEffect, useState } from "react";
import { requestCredentials as request } from "./credentials-request";

const providers = {
  "minimax-tts": {
    label: "MiniMax",
    endpoint: "https://api.minimaxi.com/v1/t2a_v2",
    model: "speech-2.8-hd",
  },
  "volcengine-tts": {
    label: "火山引擎 · 豆包语音",
    endpoint: "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
    model: "",
  },
  "volcengine-image": {
    label: "火山引擎 · Seedream",
    endpoint: "https://ark.cn-beijing.volces.com/api/v3/images/generations",
    model: "doubao-seedream-5-0-260128",
  },
  "minimax-image": {
    label: "MiniMax",
    endpoint: "https://api.minimaxi.com/v1/image_generation",
    model: "image-01",
  },
};
type ProviderId = keyof typeof providers;

// Presentation follows vnve AiSettingsDialog / CapabilityConfigPanel.
// Local adaptation: two capabilities, no gateway, verification or generation.
export function CredentialsPanel() {
  const [tab, setTab] = useState<"tts" | "image">("tts");
  return (
    <section className="credentials-panel">
      <div
        role="tablist"
        aria-label="API 设置"
        className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
      >
        {(["tts", "image"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`settings-tab-${value}`}
            aria-controls="settings-content"
            aria-selected={tab === value}
            className={`min-h-9 rounded-md px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tab === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            onKeyDown={(event) => {
              if (
                ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "tts"
                    : event.key === "End"
                      ? "image"
                      : tab === "tts"
                        ? "image"
                        : "tts";
                setTab(next);
                document.getElementById(`settings-tab-${next}`)?.focus();
              }
            }}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => setTab(value)}
          >
            {value === "tts" ? "TTS 设置" : "生图设置"}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="settings-content"
        aria-labelledby={`settings-tab-${tab}`}
      >
        <ServiceSettings key={tab} capability={tab} />
      </div>
    </section>
  );
}

function ServiceSettings({ capability }: { capability: "tts" | "image" }) {
  const [id, setId] = useState<ProviderId>(
    capability === "tts" ? "minimax-tts" : "volcengine-image",
  );
  const [token, setToken] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [model, setModel] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [configured, setConfigured] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [writable, setWritable] = useState(false);
  const [configurationDirectory, setConfigurationDirectory] = useState("");
  useEffect(() => {
    let active = true;
    setToken("");
    setMessage("");
    setConfigured(false);
    setLoadFailed(false);
    setWritable(false);
    setBusy(true);
    Promise.all([request(id, "status"), request(id, "capabilities")])
      .then(([value, capabilities]) => {
        if (!active) return;
        setEndpoint(value.endpoint ?? providers[id].endpoint);
        setModel(value.model ?? providers[id].model);
        setResourceId(
          value.resourceId ?? (id === "volcengine-tts" ? "seed-tts-2.0" : ""),
        );
        setConfigured(value.configured);
        setWritable(capabilities.writable === true);
        setConfigurationDirectory(capabilities.directory ?? "");
      })
      .catch((error) => {
        if (active) {
          setLoadFailed(true);
          setMessage(error.message);
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [id]);
  async function mutate(action: "save" | "remove") {
    setBusy(true);
    setMessage("");
    try {
      await request(
        id,
        action,
        action === "save" ? { token, endpoint, model, resourceId } : {},
      );
      setToken("");
      setConfigured(action === "save");
      setMessage(action === "save" ? "已保存" : "已删除");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "配置操作失败，请重试。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {!busy && !loadFailed && !writable && (
        <p
          role="status"
          className="rounded border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200"
        >
          当前本地服务没有配置目录的写入权限，只能读取已有配置。请让宿主在启动服务时授权此目录写入，或从普通终端启动服务后重新打开设置。
          {configurationDirectory && (
            <span className="mt-1 block break-all font-mono">
              {configurationDirectory}
            </span>
          )}
        </p>
      )}
      <label>
        服务商
        <CompactSelect
          variant="form"
          label="服务商"
          disabled={busy}
          value={id}
          onValueChange={(value) => setId(value as ProviderId)}
          options={(Object.keys(providers) as ProviderId[])
            .filter((key) => key.endsWith(`-${capability}`))
            .map((key) => ({ value: key, label: providers[key].label }))}
        />
      </label>
      <label>
        API Key
        <Input
          disabled={busy || !writable}
          type="password"
          autoComplete="new-password"
          value={token}
          placeholder={configured ? "已配置，留空保留现有密钥" : ""}
          onChange={(event) => setToken(event.target.value)}
        />
      </label>
      <label>
        接口地址
        <Input
          disabled={busy}
          type="url"
          readOnly={!writable}
          value={endpoint}
          onChange={(event) => setEndpoint(event.target.value)}
        />
      </label>
      <label>
        {id === "volcengine-tts" ? "模型（可选）" : "模型"}
        <Input
          disabled={busy}
          value={model}
          readOnly={!writable}
          onChange={(event) => setModel(event.target.value)}
        />
      </label>
      {id === "volcengine-tts" && (
        <label>
          资源 ID
          <Input
            disabled={busy}
            value={resourceId}
            readOnly={!writable}
            onChange={(event) => setResourceId(event.target.value)}
          />
        </label>
      )}
      <div className="flex items-center justify-between gap-3 border-t pt-4 mt-4">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || loadFailed || !writable || !configured}
          onClick={() => void mutate("remove")}
        >
          删除配置
        </Button>
        <Button
          variant="brand"
          size="sm"
          disabled={
            busy ||
            loadFailed ||
            !writable ||
            (!token.trim() && !configured) ||
            !endpoint.trim() ||
            (id === "volcengine-tts" && !resourceId.trim())
          }
          onClick={() => void mutate("save")}
        >
          保存
        </Button>
      </div>
      {message && (
        <p role="status" className="mt-3">
          {message}
        </p>
      )}
    </>
  );
}
