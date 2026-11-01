import { mkdir, readFile, open, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function credentialStore(
  directory = path.join(homedir(), ".config", "vnve"),
  { commit = rename } = {},
) {
  const file = path.join(directory, "setting.json");
  let queue = Promise.resolve();
  async function atomicWrite(target, contents) {
    const temporary = path.join(directory, `.${randomUUID()}.tmp`);
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(contents);
      } finally {
        await handle.close();
      }
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {});
      throw credentialFailure("CREDENTIAL_WRITE_FAILED", error);
    }
    try {
      await commit(temporary, target);
    } catch (error) {
      throw credentialFailure("CREDENTIAL_COMMIT_FAILED", error);
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  }
  async function execute(input) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(input.id ?? ""))
      throw Object.assign(new Error("Invalid credential ID"), {
        code: "INVALID_DOCUMENT",
      });
    if (input.action === "capabilities") {
      // Test only disposable, non-secret files in the real user-level directory.
      const probe = path.join(directory, `.write-check-${randomUUID()}`);
      try {
        await atomicWrite(probe, "VNVE configuration write check\n");
        return { writable: true, directory };
      } catch (error) {
        return {
          writable: false,
          directory,
          code: error.code,
          reason: error.reason,
        };
      } finally {
        await rm(probe, { force: true }).catch(() => {});
      }
    }
    let settings;
    try {
      settings = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT")
        throw credentialFailure(
          error instanceof SyntaxError
            ? "CREDENTIAL_FORMAT_INVALID"
            : "CREDENTIAL_READ_FAILED",
          error,
        );
      settings = { services: {} };
    }
    if (
      !settings ||
      typeof settings !== "object" ||
      !settings.services ||
      typeof settings.services !== "object" ||
      Array.isArray(settings.services)
    )
      throw credentialFailure("CREDENTIAL_FORMAT_INVALID");
    const previous = settings.services[input.id];
    if (
      previous !== undefined &&
      (!previous || typeof previous !== "object" || Array.isArray(previous))
    )
      throw credentialFailure("CREDENTIAL_FORMAT_INVALID");
    if (input.action === "status") {
      if (!previous) return { configured: false };
      return {
        configured: true,
        endpoint: previous.endpoint,
        model: previous.model,
        resourceId: previous.resourceId ?? "",
      };
    }
    if (input.action === "remove") {
      delete settings.services[input.id];
    } else {
      input = { ...input, token: input.token || previous?.token };
      if (
        input.action !== "save" ||
        typeof input.token !== "string" ||
        !input.token.trim() ||
        input.token.length > 16384
      )
        throw Object.assign(new Error("Token required"), {
          code: "INVALID_DOCUMENT",
          field: "token",
        });
      let endpoint;
      if (
        input.id === "volcengine-tts" &&
        (typeof input.resourceId !== "string" || !input.resourceId.trim())
      )
        throw Object.assign(new Error("Volcengine resource ID required"), {
          code: "INVALID_DOCUMENT",
          field: "resourceId",
        });
      try {
        endpoint = new URL(input.endpoint);
      } catch {}
      if (
        !endpoint ||
        endpoint.protocol !== "https:" ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash ||
        ![input.model, input.resourceId ?? ""].every(
          (value) => typeof value === "string" && value.length <= 256,
        )
      )
        throw Object.assign(
          new Error(
            "Use an HTTPS endpoint without credentials or query parameters",
          ),
          { code: "INVALID_DOCUMENT", field: "endpoint" },
        );
      settings.services[input.id] = {
        token: input.token.trim(),
        endpoint: endpoint.href,
        model: input.model,
        resourceId: input.resourceId ?? "",
      };
    }
    await atomicWrite(file, JSON.stringify(settings, null, 2) + "\n");
    return { ok: true };
  }
  return {
    execute(input) {
      const result = queue.then(() => execute(input));
      queue = result.catch(() => {});
      return result;
    },
  };
}

function credentialFailure(code, cause) {
  const reason = [
    "EPERM",
    "EACCES",
    "EROFS",
    "ENOSPC",
    "EIO",
    "ENOENT",
    "ENOTDIR",
    "EISDIR",
    "EXDEV",
    "EBUSY",
  ].includes(cause?.code)
    ? cause.code
    : undefined;
  return Object.assign(new Error("Local credential operation failed"), {
    code,
    reason,
  });
}
