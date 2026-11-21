import assert from "node:assert/strict";
import test from "node:test";
import { findSvgIconProblem } from "@getpaseo/plugin";
import { extractAttachmentSourcesFromClientBundle } from "../server/attachments";
import {
  deriveEffectivePromptLabel,
  detectForgeFromRemoteUrl,
  FORGE_BRAND_SVGS,
  resolveForgePresentation,
  splitSidechatAttachmentsForSubmit,
  toggleForgeComposerAttachment,
  togglePluginResourceComposerAttachment,
  type SidechatComposerAttachment,
} from "../shared/attachments";

test("all Forge brand SVGs pass Paseo findSvgIconProblem validation", () => {
  for (const [forge, svg] of Object.entries(FORGE_BRAND_SVGS)) {
    assert.equal(
      findSvgIconProblem(svg),
      null,
      `Expected ${forge} brand SVG to have no SVG validation problems`,
    );
  }
});

test("detectForgeFromRemoteUrl and resolveForgePresentation handle GitHub, GitLab, Gitea, and Codeberg", () => {
  assert.equal(
    detectForgeFromRemoteUrl("git@github.com:Norman-else/paseo-better-sidechat.git"),
    "github",
  );
  assert.equal(
    detectForgeFromRemoteUrl("https://gitlab.com/acme/platform.git"),
    "gitlab",
  );
  assert.equal(detectForgeFromRemoteUrl("https://codeberg.org/org/repo"), "codeberg");
  assert.equal(detectForgeFromRemoteUrl("ssh://git@gitea.example.internal:2222/org/repo.git"), "gitea");
  assert.equal(detectForgeFromRemoteUrl(null), "github");

  const gh = resolveForgePresentation("github");
  assert.equal(gh.isMergeRequest, false);
  assert.equal(gh.numberPrefix, "#");
  assert.equal(gh.changeRequestAbbrev, "PR");

  const gl = resolveForgePresentation("gitlab");
  assert.equal(gl.isMergeRequest, true);
  assert.equal(gl.numberPrefix, "!");
  assert.equal(gl.changeRequestAbbrev, "MR");
});

test("splitSidechatAttachmentsForSubmit produces exact Paseo wire images and attachments", () => {
  let list: SidechatComposerAttachment[] = [
    {
      kind: "image",
      id: "img_1",
      fileName: "screen.png",
      mimeType: "image/png",
      size: 2048,
      dataBase64: "iVBORw0KGgoAAA==",
    },
    {
      kind: "file",
      id: "upload_1",
      attachment: {
        type: "uploaded_file",
        id: "upload_1",
        fileName: "report.pdf",
        mimeType: "application/pdf",
        size: 8192,
        path: "/tmp/uploads/upload_1/report.pdf",
      },
    },
  ];

  list = toggleForgeComposerAttachment(list, {
    kind: "change_request",
    forge: "github",
    number: 42,
    title: "Reuse Paseo attachment menu",
    url: "https://github.com/Norman-else/paseo-better-sidechat/pull/42",
    baseRefName: "master",
    headRefName: "feat/plus-menu",
  });

  list = togglePluginResourceComposerAttachment(list, {
    pluginId: "paseo-jira",
    sourceId: "jira",
    sourceTitle: "Jira ticket",
    iconName: "Ticket",
    item: {
      id: "10042",
      identifier: "PSOS-6413",
      title: "Fix sidechat attachment picker",
      subtitle: "In Progress · Norman",
      url: "https://acme.atlassian.net/browse/PSOS-6413",
      text: "Jira ticket PSOS-6413: Fix sidechat attachment picker",
      resourceType: "issue",
    },
  });

  const split = splitSidechatAttachmentsForSubmit(list);
  assert.equal(split.images.length, 1);
  assert.deepEqual(split.images[0], {
    data: "iVBORw0KGgoAAA==",
    mimeType: "image/png",
  });

  assert.equal(split.attachments.length, 3);
  assert.deepEqual(split.attachments[0], {
    type: "uploaded_file",
    id: "upload_1",
    fileName: "report.pdf",
    mimeType: "application/pdf",
    size: 8192,
    path: "/tmp/uploads/upload_1/report.pdf",
  });
  assert.deepEqual(split.attachments[1], {
    type: "forge_change_request",
    mimeType: "application/paseo-forge-change-request",
    forge: "github",
    number: 42,
    title: "Reuse Paseo attachment menu",
    url: "https://github.com/Norman-else/paseo-better-sidechat/pull/42",
    baseRefName: "master",
    headRefName: "feat/plus-menu",
  });
  assert.deepEqual(split.attachments[2], {
    type: "text",
    mimeType: "text/plain",
    title: "PSOS-6413 Fix sidechat attachment picker",
    text: "Jira ticket PSOS-6413: Fix sidechat attachment picker",
    externalResource: {
      provider: "paseo-jira",
      providerLabel: "Jira ticket",
      resourceType: "issue",
      id: "10042",
      identifier: "PSOS-6413",
      title: "Fix sidechat attachment picker",
      url: "https://acme.atlassian.net/browse/PSOS-6413",
    },
  });

  assert.equal(
    deriveEffectivePromptLabel("", list),
    "screen.png, report.pdf, #42 Reuse Paseo attachment menu, PSOS-6413 Fix sidechat attachment picker",
  );
});

test("extractAttachmentSourcesFromClientBundle extracts Jira-style plugin attachment sources", () => {
  const sampleBundle = `(function(require) {
    const exports = {};
    const module = { exports };
    const { defineAttachmentSource, defineRpc } = require("@getpaseo/plugin");
    const { z } = require("zod");
    const searchTicketsRpc = defineRpc({
      name: "jira.search",
      input: z.object({ query: z.string() }),
      output: z.object({ items: z.array(z.unknown()) }),
    });
    const jiraSource = defineAttachmentSource({
      id: "jira",
      title: "Jira ticket",
      icon: "Ticket",
      pickerTitle: "Attach Jira ticket",
      searchPlaceholder: "Ticket key, number or text",
      search: searchTicketsRpc,
    });
    module.exports.default = function contribute(client) {
      client.addAttachmentSource(jiraSource);
      return () => {};
    };
    return module.exports;
  })`;

  const extracted = extractAttachmentSourcesFromClientBundle("paseo-jira", sampleBundle);
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0]?.id, "jira");
  assert.equal(extracted[0]?.title, "Jira ticket");
  assert.equal(extracted[0]?.pickerTitle, "Attach Jira ticket");
  assert.equal(extracted[0]?.searchPlaceholder, "Ticket key, number or text");
  assert.equal(extracted[0]?.icon, "Ticket");
  assert.equal(extracted[0]?.searchMethod, "jira.search");
});
