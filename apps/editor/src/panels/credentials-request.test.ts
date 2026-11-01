import { afterEach, expect, it, vi } from "vitest";
import { requestCredentials } from "./credentials-request";
afterEach(() => vi.unstubAllGlobals());
it.each([
  [401, { code: "UNAUTHORIZED" }, "本地会话已失效"],
  [
    500,
    { code: "CREDENTIAL_COMMIT_FAILED", reason: "EPERM" },
    "无法替换正式配置",
  ],
  [400, { code: "INVALID_DOCUMENT", field: "endpoint" }, "接口地址"],
])(
  "distinguishes credential failure %s without echoing response content",
  async (status, body, expected) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              ...body,
              message: "private-token-must-not-appear",
            }),
            { status },
          ),
        ),
    );
    await expect(requestCredentials("minimax-tts", "save", {})).rejects.toThrow(
      expected,
    );
    await expect(
      requestCredentials("minimax-tts", "save", {}),
    ).rejects.not.toThrow("private-token");
  },
);
