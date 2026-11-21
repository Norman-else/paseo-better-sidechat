import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFileMentionReplacement,
  applySlashCommandReplacement,
  findActiveFileMention,
  findActiveSlashCommand,
  rankSlashAutocompleteEntries,
  resolveImmediateClientSlashCommand,
  SIDECHAT_CLIENT_COMMANDS,
  type SlashCommandItem,
} from "../shared/autocomplete";

test("findActiveFileMention and applyFileMentionReplacement match Paseo @files behavior", () => {
  assert.deepEqual(findActiveFileMention({ text: "@comp", cursorIndex: 5 }), {
    start: 0,
    end: 5,
    query: "comp",
  });

  assert.deepEqual(findActiveFileMention({ text: "Check @client/web", cursorIndex: 17 }), {
    start: 6,
    end: 17,
    query: "client/web",
  });

  // Email addresses must NOT trigger @files
  assert.equal(findActiveFileMention({ text: "contact oli@anydream.dev", cursorIndex: 24 }), null);

  // Whitespace after `@` closes mention
  assert.equal(findActiveFileMention({ text: "Check @client/web.ts now", cursorIndex: 24 }), null);

  const mention = findActiveFileMention({ text: "Inspect @comp please", cursorIndex: 13 })!;
  const replaced = applyFileMentionReplacement({
    text: "Inspect @comp please",
    mention,
    relativePath: "client/composer-bar.tsx",
  });
  assert.equal(replaced.text, 'Inspect "client/composer-bar.tsx" please');
});

test("findActiveSlashCommand and applySlashCommandReplacement distinguish start vs inline skills", () => {
  assert.deepEqual(findActiveSlashCommand({ text: "/adv", cursorIndex: 4 }), {
    start: 0,
    end: 4,
    query: "adv",
    position: "start",
  });

  assert.deepEqual(
    findActiveSlashCommand({ text: "Please use /archify", cursorIndex: 19 }),
    {
      start: 11,
      end: 19,
      query: "archify",
      position: "inline",
    },
  );

  // URLs or mid-word slashes must NOT trigger slash commands
  assert.equal(
    findActiveSlashCommand({ text: "https://github.com/org", cursorIndex: 22 }),
    null,
  );
  assert.equal(findActiveSlashCommand({ text: "client/web.ts", cursorIndex: 13 }), null);

  const inlineCmd = findActiveSlashCommand({
    text: "Use /arch",
    cursorIndex: 9,
  })!;
  const applied = applySlashCommandReplacement({
    text: "Use /arch",
    command: inlineCmd,
    commandName: "archify",
  });
  assert.equal(applied.text, "Use /archify ");
  assert.equal(applied.cursorIndex, "Use /archify ".length);
});

test("rankSlashAutocompleteEntries shows commands + skills at start, and skills-only inline", () => {
  const providerCommands: SlashCommandItem[] = [
    {
      name: "compact",
      description: "Compact conversation history",
      argumentHint: "[instructions]",
      kind: "command",
    },
    {
      name: "archify",
      description: "Create standalone architecture SVG diagrams",
      argumentHint: "",
      kind: "skill",
    },
    {
      name: "anthropic-skills:skill-creator",
      description: "Create and benchmark skills",
      argumentHint: "",
      kind: "skill",
    },
  ];

  const clientCommands = SIDECHAT_CLIENT_COMMANDS.map((def) => ({
    def,
    description: def.action,
  }));

  const atStartAll = rankSlashAutocompleteEntries({
    providerCommands,
    clientCommands,
    query: "",
    position: "start",
  });
  assert.equal(atStartAll.length, 5);
  assert.equal(atStartAll[0]?.name, "compact");
  assert.equal(atStartAll[3]?.name, "clear");

  // Inline `/` only surfaces `kind === "skill"`
  const inlineAll = rankSlashAutocompleteEntries({
    providerCommands,
    clientCommands,
    query: "",
    position: "inline",
  });
  assert.deepEqual(
    inlineAll.map((e) => e.name),
    ["archify", "anthropic-skills:skill-creator"],
  );

  // Segment-boundary search (`skill-creator` matched via `creator`)
  const creatorSearch = rankSlashAutocompleteEntries({
    providerCommands,
    clientCommands,
    query: "skill-creator",
    position: "start",
  });
  assert.equal(creatorSearch[0]?.name, "anthropic-skills:skill-creator");
});

test("resolveImmediateClientSlashCommand matches /clear, /new, /exit, and /archive only without attachments", () => {
  assert.equal(
    resolveImmediateClientSlashCommand({
      text: "/new",
      hasAttachments: false,
      hasActiveThread: true,
    })?.action,
    "new-thread",
  );
  assert.equal(
    resolveImmediateClientSlashCommand({
      text: "/archive",
      hasAttachments: false,
      hasActiveThread: true,
    })?.action,
    "archive-thread",
  );
  assert.equal(
    resolveImmediateClientSlashCommand({
      text: "/new",
      hasAttachments: true,
      hasActiveThread: true,
    }),
    null,
  );
});
