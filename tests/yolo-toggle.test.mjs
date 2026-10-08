import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import extension from "../extensions/yolo-toggle.ts";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, "timed out waiting for watcher");
    await sleep(50);
  }
}

function fixture(t, config = { yoloMode: false }) {
  mkdirSync(".scratch", { recursive: true });
  const root = mkdtempSync(join(process.cwd(), ".scratch/yolo-test-"));
  const dir = join(root, "extensions/pi-permission-system");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "config.json");
  writeFileSync(path, JSON.stringify(config));
  const old = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  const sessions = [];

  function session() {
    const events = new Map(), commands = new Map(), shortcuts = new Map();
    const messages = [], notices = [], actions = [], statuses = new Map();
    const pi = {
      on: (name, handler) => events.set(name, handler),
      registerCommand: (name, command) => commands.set(name, command),
      registerShortcut: (name, shortcut) => shortcuts.set(name, shortcut),
      sendUserMessage: (...args) => messages.push(args),
    };
    const ctx = {
      ui: {
        setStatus: (key, value) => statuses.set(key, value),
        notify: (...args) => notices.push(args),
      },
      waitForIdle: async () => { actions.push("idle"); },
      reload: async () => { actions.push("reload"); },
    };
    extension(pi);
    const s = { events, commands, shortcuts, messages, notices, actions, statuses, ctx };
    sessions.push(s);
    return s;
  }

  t.after(async () => {
    for (const s of sessions) await s.events.get("session_shutdown")?.({}, s.ctx);
    if (old === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = old;
    rmSync(root, { recursive: true, force: true });
  });
  return { path, session };
}

const status = (s) => s.statuses.get("pi-permission-system");
const start = (s) => s.events.get("session_start")({}, s.ctx);

function assertNoReload(s) {
  assert.deepEqual(s.actions, []);
  assert.deepEqual(s.messages, []);
  assert.equal(s.commands.has("reload-permission-config"), false);
}

test("initial status reflects persisted YOLO mode", async (t) => {
  const f = fixture(t, { yoloMode: true });
  const s = f.session();
  await start(s);
  assert.equal(status(s), "yolo");
  assertNoReload(s);
});

test("external atomic changes sync status both ways; shutdown stops watching", async (t) => {
  const f = fixture(t);
  const s = f.session();
  await start(s);
  assert.equal(status(s), undefined);
  writeFileSync(`${f.path}.tmp`, JSON.stringify({ yoloMode: true }));
  renameSync(`${f.path}.tmp`, f.path);
  await until(() => status(s) === "yolo");
  writeFileSync(f.path, JSON.stringify({ yoloMode: false }));
  await until(() => status(s) === undefined);
  await s.events.get("session_shutdown")({}, s.ctx);
  writeFileSync(f.path, JSON.stringify({ yoloMode: true }));
  await sleep(600);
  assert.equal(status(s), undefined);
  assertNoReload(s);
});

test("incomplete JSON keeps last status and waits for repair without repeated warnings", async (t) => {
  const f = fixture(t, { yoloMode: true });
  const s = f.session();
  await start(s);
  writeFileSync(f.path, "{\"yoloMode\":");
  await until(() => s.notices.length === 1);
  await sleep(600);
  assert.equal(s.notices.length, 1);
  assert.equal(status(s), "yolo");
  writeFileSync(f.path, JSON.stringify({ yoloMode: false }));
  await until(() => status(s) === undefined);
  assertNoReload(s);
});

test("formatting and policy-only edits do not reload", async (t) => {
  const f = fixture(t);
  const s = f.session();
  await start(s);
  writeFileSync(f.path, '{\n  "yoloMode": false,\n  "permission": {"*": "ask"}\n}\n');
  await sleep(650);
  assert.equal(status(s), undefined);
  assertNoReload(s);
});

test("shortcut and command propagate indicator across sessions without reload", async (t) => {
  const permission = { "*": "allow", web_enable: "ask" };
  const f = fixture(t, { yoloMode: false, permission });
  const a = f.session(), b = f.session();
  await start(a);
  await start(b);
  await a.shortcuts.get("ctrl+/").handler({ ui: a.ctx.ui });
  assert.equal(status(a), "yolo", "local indicator updates immediately");
  assert.deepEqual(JSON.parse(readFileSync(f.path, "utf8")), { yoloMode: true, permission });
  await until(() => status(b) === "yolo");
  await b.commands.get("toggle-yolo").handler("", b.ctx);
  assert.equal(status(b), undefined);
  await until(() => status(a) === undefined);
  assert.deepEqual(JSON.parse(readFileSync(f.path, "utf8")), { yoloMode: false, permission });
  assertNoReload(a);
  assertNoReload(b);
});

test("failed toggles preserve indicator and never reload", async (t) => {
  const f = fixture(t, { yoloMode: true });
  const s = f.session();
  await start(s);
  writeFileSync(f.path, "[]");
  await s.shortcuts.get("ctrl+/").handler(s.ctx);
  assert.equal(status(s), "yolo");
  assert.equal(s.notices.at(-1)[1], "error");
  assertNoReload(s);
});
