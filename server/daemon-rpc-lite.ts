import { randomBytes, randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
import type { Duplex } from "node:stream";
import { homedir } from "node:os";

interface PendingRequest {
  responseType: string;
  resolve(payload: Record<string, unknown>): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export interface PluginCatalogLiteEntry {
  id: string;
  clientBundleHash?: string;
  clientBundle?: string;
}

function encodeClientWsFrame(opcode: number, payload: Buffer): Buffer {
  const mask = randomBytes(4);
  const len = payload.length;
  let headerLen = 2;
  if (len >= 126 && len <= 65535) {
    headerLen = 4;
  } else if (len > 65535) {
    headerLen = 10;
  }

  const frame = Buffer.allocUnsafe(headerLen + 4 + len);
  frame[0] = 0x80 | (opcode & 0x0f);
  if (len < 126) {
    frame[1] = 0x80 | len;
  } else if (len <= 65535) {
    frame[1] = 0x80 | 126;
    frame.writeUInt16BE(len, 2);
  } else {
    frame[1] = 0x80 | 127;
    frame.writeBigUInt64BE(BigInt(len), 2);
  }

  mask.copy(frame, headerLen);
  for (let i = 0; i < len; i += 1) {
    frame[headerLen + 4 + i] = payload[i]! ^ mask[i & 3]!;
  }
  return frame;
}

function parseTargetEndpoint(listen: string):
  | { kind: "ipc"; socketPath: string }
  | { kind: "http"; secure: boolean; host: string; port: number; path: string } {
  const raw = listen.trim();
  if (raw.startsWith("unix://") || raw.startsWith("pipe://")) {
    const p = raw.replace(/^(unix|pipe):\/\//, "").replace(/^~(?=\/)/, homedir());
    return { kind: "ipc", socketPath: p };
  }
  if (raw.startsWith("/") || raw.startsWith("~") || raw.startsWith("\\\\.\\pipe\\")) {
    return { kind: "ipc", socketPath: raw.replace(/^~(?=\/)/, homedir()) };
  }
  if (/^wss?:\/\//i.test(raw)) {
    const parsed = new URL(raw);
    const secure = parsed.protocol.toLowerCase() === "wss:";
    return {
      kind: "http",
      secure,
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : secure ? 443 : 80,
      path: parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "/ws",
    };
  }
  const stripped = raw.replace(/^tcp:\/\//i, "");
  const url = new URL(`http://${/^\d+$/.test(stripped) ? `127.0.0.1:${stripped}` : stripped}`);
  return {
    kind: "http",
    secure: false,
    host: url.hostname,
    port: Number(url.port || 6767),
    path: "/ws",
  };
}

/**
 * Zero-dependency RFC 6455 WebSocket JSON session client for Paseo's local daemon.
 * Uses only Node built-in `node:http` / `node:https` / `node:crypto` so Git plugin installations
 * (`paseo plugin add git:...`) compile cleanly with zero `node_modules` on the target host.
 */
export class PaseoDaemonRpcLite {
  private socket: Duplex | null = null;
  private connected = false;
  private readBuf: Buffer = Buffer.alloc(0);
  private fragOpcode = 0;
  private fragChunks: Buffer[] = [];
  private readonly pending = new Map<string, PendingRequest>();

  constructor(
    private readonly listen: string,
    private readonly options: { password?: string; connectTimeoutMs?: number } = {},
  ) {}

  get isConnected(): boolean {
    return this.connected && this.socket !== null && !this.socket.destroyed;
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    const endpoint = parseTargetEndpoint(this.listen);
    const wsKey = randomBytes(16).toString("base64");
    const timeoutMs = this.options.connectTimeoutMs ?? 6_000;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.close();
        reject(new Error("Timed out connecting to Paseo daemon"));
      }, timeoutMs);

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.close();
        reject(err);
      };

      const headers: Record<string, string> = {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": wsKey,
      };

      const req =
        endpoint.kind === "ipc"
          ? http.request({
              socketPath: endpoint.socketPath,
              path: "/ws",
              method: "GET",
              headers,
            })
          : (endpoint.secure ? https : http).request({
              host: endpoint.host,
              port: endpoint.port,
              path: endpoint.path,
              method: "GET",
              headers,
            });

      req.once("error", (err) => fail(err instanceof Error ? err : new Error(String(err))));
      req.once("response", (res) => {
        fail(new Error(`Unexpected HTTP response ${res.statusCode ?? "unknown"} on WebSocket upgrade`));
      });

      req.once("upgrade", (_res, socket, head) => {
        this.socket = socket;
        socket.on("error", () => {
          this.handleDisconnect(new Error("Daemon WebSocket error"));
          fail(new Error("Daemon WebSocket error"));
        });
        socket.on("close", () => {
          this.handleDisconnect(new Error("Daemon WebSocket closed"));
          fail(new Error("Daemon WebSocket closed before hello completed"));
        });

        const onWelcomeReady = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.connected = true;
          resolve();
        };

        socket.on("data", (chunk: Buffer) => {
          this.consumeBytes(chunk, onWelcomeReady, fail);
        });

        if (head && head.length > 0) {
          this.consumeBytes(head, onWelcomeReady, fail);
        }

        // Send Paseo `hello`
        const helloPayload: Record<string, unknown> = {
          type: "hello",
          clientId: `paseo-better-sidechat-${randomUUID().slice(0, 8)}`,
          clientType: "cli",
          protocolVersion: 1,
          capabilities: {},
          ...(this.options.password ? { auth: { password: this.options.password } } : {}),
        };
        this.sendJsonRaw(helloPayload);
      });

      req.end();
    });
  }

  private sendJsonRaw(obj: Record<string, unknown>): void {
    if (!this.socket || this.socket.destroyed) {
      throw new Error("Daemon WebSocket is not open");
    }
    const text = JSON.stringify(obj);
    const frame = encodeClientWsFrame(0x1, Buffer.from(text, "utf8"));
    this.socket.write(frame);
  }

  private consumeBytes(
    chunk: Buffer,
    onWelcome?: () => void,
    onHandshakeFail?: (err: Error) => void,
  ): void {
    this.readBuf = this.readBuf.length === 0 ? chunk : Buffer.concat([this.readBuf, chunk]);

    while (this.readBuf.length >= 2) {
      const b0 = this.readBuf[0]!;
      const b1 = this.readBuf[1]!;
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (this.readBuf.length < 4) return;
        payloadLen = this.readBuf.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (this.readBuf.length < 10) return;
        const bigLen = this.readBuf.readBigUInt64BE(2);
        payloadLen = Number(bigLen);
        offset = 10;
      }

      const maskLen = masked ? 4 : 0;
      if (this.readBuf.length < offset + maskLen + payloadLen) {
        return;
      }

      let payload = this.readBuf.subarray(offset + maskLen, offset + maskLen + payloadLen);
      if (masked) {
        const mask = this.readBuf.subarray(offset, offset + 4);
        const unmasked = Buffer.allocUnsafe(payloadLen);
        for (let i = 0; i < payloadLen; i += 1) {
          unmasked[i] = payload[i]! ^ mask[i & 3]!;
        }
        payload = unmasked;
      }

      this.readBuf = this.readBuf.subarray(offset + maskLen + payloadLen);

      if (opcode === 0x8) {
        // Close frame
        this.close();
        return;
      }
      if (opcode === 0x9) {
        // Ping -> Pong
        if (this.socket && !this.socket.destroyed) {
          this.socket.write(encodeClientWsFrame(0x0a, payload));
        }
        continue;
      }
      if (opcode === 0x0a) {
        continue;
      }

      if (opcode === 0x1 || opcode === 0x2) {
        if (fin) {
          if (opcode === 0x1) {
            this.handleTextFrame(payload.toString("utf8"), onWelcome, onHandshakeFail);
          }
        } else {
          this.fragOpcode = opcode;
          this.fragChunks = [Buffer.from(payload)];
        }
      } else if (opcode === 0x0 && this.fragOpcode !== 0) {
        this.fragChunks.push(Buffer.from(payload));
        if (fin) {
          const full = Buffer.concat(this.fragChunks);
          const completedOp = this.fragOpcode;
          this.fragOpcode = 0;
          this.fragChunks = [];
          if (completedOp === 0x1) {
            this.handleTextFrame(full.toString("utf8"), onWelcome, onHandshakeFail);
          }
        }
      }
    }
  }

  private handleTextFrame(
    text: string,
    onWelcome?: () => void,
    onHandshakeFail?: (err: Error) => void,
  ): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }

    if (parsed.type === "hello.rejected") {
      onHandshakeFail?.(new Error(`Daemon rejected hello: ${String(parsed.reason ?? "rejected")}`));
      return;
    }

    if (parsed.type !== "session" || !parsed.message || typeof parsed.message !== "object") {
      return;
    }

    const msg = parsed.message as Record<string, unknown>;
    const msgType = typeof msg.type === "string" ? msg.type : "";
    const payload =
      msg.payload && typeof msg.payload === "object"
        ? (msg.payload as Record<string, unknown>)
        : {};

    if (msgType === "status" && payload.status === "server_info") {
      onWelcome?.();
      return;
    }

    const reqId = typeof payload.requestId === "string" ? payload.requestId : "";
    if (!reqId) return;

    const waiter = this.pending.get(reqId);
    if (!waiter) return;

    if (msgType === "error") {
      clearTimeout(waiter.timer);
      this.pending.delete(reqId);
      waiter.reject(new Error(typeof payload.message === "string" ? payload.message : "Daemon RPC error"));
      return;
    }

    if (msgType === waiter.responseType) {
      clearTimeout(waiter.timer);
      this.pending.delete(reqId);
      if (typeof payload.error === "string" && payload.error && msgType === "plugin.rpc.invoke.response") {
        waiter.reject(new Error(payload.error));
      } else {
        waiter.resolve(payload);
      }
    }
  }

  private handleDisconnect(err: Error): void {
    this.connected = false;
    this.socket = null;
    this.readBuf = Buffer.alloc(0);
    this.fragChunks = [];
    this.fragOpcode = 0;
    for (const [id, waiter] of this.pending) {
      clearTimeout(waiter.timer);
      waiter.reject(err);
      this.pending.delete(id);
    }
  }

  async request(
    requestType: string,
    responseType: string,
    fields: Record<string, unknown> = {},
    timeoutMs = 12_000,
  ): Promise<Record<string, unknown>> {
    if (!this.isConnected) {
      await this.connect();
    }
    const requestId = randomUUID();
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Timed out waiting for ${responseType}`));
      }, timeoutMs);

      this.pending.set(requestId, { responseType, resolve, reject, timer });
      try {
        this.sendJsonRaw({
          type: "session",
          message: {
            type: requestType,
            requestId,
            ...fields,
          },
        });
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  async getCheckoutStatus(cwd: string): Promise<{ remoteUrl?: string | null }> {
    const payload = await this.request("checkout_status_request", "checkout_status_response", {
      cwd,
    });
    const status =
      payload.status && typeof payload.status === "object"
        ? (payload.status as Record<string, unknown>)
        : payload;
    return {
      remoteUrl: typeof status.remoteUrl === "string" ? status.remoteUrl : null,
    };
  }

  async searchForge(input: {
    cwd: string;
    query: string;
    limit?: number;
  }): Promise<Record<string, unknown>> {
    return this.request(
      "forge.search.request",
      "forge.search.response",
      {
        cwd: input.cwd,
        query: input.query,
        limit: input.limit ?? 25,
      },
      15_000,
    );
  }

  async getPluginCatalog(): Promise<PluginCatalogLiteEntry[]> {
    const payload = await this.request("plugin.catalog.get.request", "plugin.catalog.get.response");
    const raw = Array.isArray(payload.plugins) ? payload.plugins : [];
    return raw
      .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === "object"))
      .map((p) => ({
        id: String(p.id ?? ""),
        clientBundleHash: typeof p.clientBundleHash === "string" ? p.clientBundleHash : undefined,
        clientBundle: typeof p.clientBundle === "string" ? p.clientBundle : undefined,
      }))
      .filter((p) => p.id.length > 0);
  }

  async invokePluginRpc(pluginId: string, method: string, input: unknown): Promise<unknown> {
    const payload = await this.request("plugin.rpc.invoke.request", "plugin.rpc.invoke.response", {
      pluginId,
      method,
      input,
    });
    return payload.output;
  }

  async getDirectorySuggestions(input: {
    cwd: string;
    query: string;
    includeFiles?: boolean;
    includeDirectories?: boolean;
    limit?: number;
    matchMode?: "fuzzy" | "suffix";
  }): Promise<{
    directories?: string[];
    entries?: Array<{ path: string; kind: "file" | "directory" }>;
    error?: string | null;
  }> {
    const payload = await this.request(
      "directory_suggestions_request",
      "directory_suggestions_response",
      {
        cwd: input.cwd,
        query: input.query,
        includeFiles: input.includeFiles ?? true,
        includeDirectories: input.includeDirectories ?? true,
        limit: input.limit ?? 40,
        matchMode: input.matchMode ?? "fuzzy",
      },
      15_000,
    );
    return {
      directories: Array.isArray(payload.directories)
        ? payload.directories.filter((d): d is string => typeof d === "string")
        : [],
      entries: Array.isArray(payload.entries)
        ? payload.entries.filter(
            (e): e is { path: string; kind: "file" | "directory" } =>
              Boolean(
                e &&
                  typeof e === "object" &&
                  typeof (e as Record<string, unknown>).path === "string" &&
                  ((e as Record<string, unknown>).kind === "file" ||
                    (e as Record<string, unknown>).kind === "directory"),
              ),
          )
        : [],
      error: typeof payload.error === "string" ? payload.error : null,
    };
  }

  async listCommands(input: {
    agentId: string;
    draftConfig?: Record<string, unknown>;
  }): Promise<{
    commands: Array<{
      name: string;
      description: string;
      argumentHint: string;
      kind?: "command" | "skill";
    }>;
    error: string | null;
  }> {
    const payload = await this.request("list_commands_request", "list_commands_response", {
      agentId: input.agentId,
      ...(input.draftConfig ? { draftConfig: input.draftConfig } : {}),
    });
    const raw = Array.isArray(payload.commands) ? payload.commands : [];
    const commands = raw
      .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === "object"))
      .map((c) => ({
        name: String(c.name ?? ""),
        description: String(c.description ?? ""),
        argumentHint: String(c.argumentHint ?? ""),
        kind: (c.kind === "skill" ? "skill" : "command") as "command" | "skill",
      }))
      .filter((c) => c.name.length > 0);
    return {
      commands,
      error: typeof payload.error === "string" ? payload.error : null,
    };
  }

  close(): void {
    this.connected = false;
    const sock = this.socket;
    this.socket = null;
    if (sock && !sock.destroyed) {
      try {
        sock.write(encodeClientWsFrame(0x8, Buffer.alloc(0)));
      } catch {
        // Ignore write error on close
      }
      sock.destroy();
    }
    this.handleDisconnect(new Error("Closed"));
  }
}
