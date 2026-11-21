import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { sidechatThreadSchema, type SidechatThread } from "../shared/contracts";

const storedRecordSchema = sidechatThreadSchema.extend({
  archived: z.boolean().default(false),
});

export type StoredThreadRecord = z.infer<typeof storedRecordSchema>;

const storeFileSchema = z.object({
  version: z.literal(1),
  threads: z.array(storedRecordSchema),
});

export function defaultThreadStorePath(): string {
  const paseoHome = process.env.PASEO_HOME?.trim() || join(homedir(), ".paseo");
  return join(paseoHome, "plugin-settings", "paseo-better-sidechat", "threads.json");
}

export class SidechatThreadStore {
  private readonly filePath: string;
  private loaded = false;
  private records = new Map<string, StoredThreadRecord>();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(filePath = defaultThreadStorePath()) {
    this.filePath = filePath;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const content = await readFile(this.filePath, "utf8");
      const parsed = storeFileSchema.safeParse(JSON.parse(content));
      if (parsed.success) {
        for (const item of parsed.data.threads) {
          this.records.set(item.agentId, item);
        }
      }
    } catch {
      // Missing or unreadable store starts empty safely.
    }
  }

  private persist(): Promise<void> {
    const snapshot = [...this.records.values()];
    const payload = JSON.stringify({ version: 1, threads: snapshot }, null, 2);
    const next = this.writeChain.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, payload, "utf8");
      await rename(tmp, this.filePath);
    });
    this.writeChain = next.catch(() => {});
    return next;
  }

  async list(filter: { workspaceId: string; parentAgentId?: string }): Promise<StoredThreadRecord[]> {
    await this.ensureLoaded();
    const matches = [...this.records.values()].filter((record) => {
      if (record.archived) return false;
      if (record.workspaceId !== filter.workspaceId) return false;
      if (
        filter.parentAgentId &&
        record.parentAgentId &&
        record.parentAgentId !== filter.parentAgentId
      ) {
        return false;
      }
      return true;
    });
    return matches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async upsert(thread: SidechatThread): Promise<StoredThreadRecord> {
    await this.ensureLoaded();
    const existing = this.records.get(thread.agentId);
    const merged: StoredThreadRecord = {
      ...thread,
      title: existing?.title && thread.title === "" ? existing.title : thread.title,
      archived: false,
    };
    this.records.set(thread.agentId, merged);
    await this.persist();
    return merged;
  }

  async patch(
    agentId: string,
    updates: Partial<Omit<StoredThreadRecord, "agentId">>,
  ): Promise<StoredThreadRecord | null> {
    await this.ensureLoaded();
    const current = this.records.get(agentId);
    if (!current) return null;
    const updated: StoredThreadRecord = {
      ...current,
      ...updates,
    };
    this.records.set(agentId, updated);
    await this.persist();
    return updated;
  }

  async archiveWorkspace(workspaceId: string): Promise<string[]> {
    await this.ensureLoaded();
    const archivedIds: string[] = [];
    for (const [id, record] of this.records.entries()) {
      if (record.workspaceId === workspaceId && !record.archived) {
        this.records.set(id, {
          ...record,
          archived: true,
          updatedAt: new Date().toISOString(),
        });
        archivedIds.push(id);
      }
    }
    if (archivedIds.length > 0) {
      await this.persist();
    }
    return archivedIds;
  }
}
