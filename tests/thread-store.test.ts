import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SidechatThreadStore } from "../server/thread-store";

test("SidechatThreadStore persists, filters, and archives workspace threads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sidechat-store-test-"));
  const filePath = join(dir, "threads.json");

  try {
    const store = new SidechatThreadStore(filePath);
    await store.upsert({
      agentId: "side-1",
      workspaceId: "ws-1",
      parentAgentId: "main-1",
      title: "First question",
      cwd: "/repo",
      provider: "claude",
      model: "claude-sonnet-4-5",
      modeId: "auto",
      thinkingOptionId: "high",
      status: "idle",
      createdAt: "2026-11-21T01:00:00Z",
      updatedAt: "2026-11-21T01:00:00Z",
    });

    await store.upsert({
      agentId: "side-2",
      workspaceId: "ws-1",
      parentAgentId: "main-2",
      title: "Second question",
      cwd: "/repo",
      provider: "claude",
      model: "claude-sonnet-4-5",
      modeId: "plan",
      thinkingOptionId: null,
      status: "running",
      createdAt: "2026-11-21T01:05:00Z",
      updatedAt: "2026-11-21T01:05:00Z",
    });

    // Reload from disk with a fresh instance
    const reloaded = new SidechatThreadStore(filePath);
    const forMain1 = await reloaded.list({ workspaceId: "ws-1", parentAgentId: "main-1" });
    assert.equal(forMain1.length, 1);
    assert.equal(forMain1[0].agentId, "side-1");

    const allWs1 = await reloaded.list({ workspaceId: "ws-1" });
    assert.equal(allWs1.length, 2);
    assert.equal(allWs1[0].agentId, "side-2");

    const archivedIds = await reloaded.archiveWorkspace("ws-1");
    assert.equal(archivedIds.length, 2);
    assert.equal((await reloaded.list({ workspaceId: "ws-1" })).length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
