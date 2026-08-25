window.__ModuleLoader__.load({ id: "dsh-session-guard", factory: (require) => {
var module = { exports: {} };
var exports = module.exports;

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.js
var index_exports = {};
__export(index_exports, {
  FallbackFreezeButton: () => FallbackFreezeButton,
  apply: () => apply,
  createFallbackFreezeControl: () => createFallbackFreezeControl,
  inject: () => inject,
  lastStateBySession: () => lastStateBySession
});
module.exports = __toCommonJS(index_exports);

// src/client/freeze-store.js
var listeners = /* @__PURE__ */ new Set();
var state = { frozen: false, pending: [] };
var fallbackFreezeStore = {
  getSnapshot() {
    return state;
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
};
function emit() {
  for (const l of listeners) l();
}
function setFrozen(pending) {
  state = { frozen: true, pending: pending || [] };
  emit();
}
function clearFrozen() {
  state = { frozen: false, pending: [] };
  emit();
}

// src/detect.js
function detectInputTrafficBridge(g) {
  const root = g || (typeof globalThis !== "undefined" ? globalThis : {});
  return !!(root && root.__DSH_SESSION_GUARD_BRIDGE__ && typeof root.__DSH_SESSION_GUARD_BRIDGE__.stopNextTurn === "function");
}

// src/client/index.js
var inject = ["slots", "locale", "sessions", "conversation"];
var FREEZE_SLOT_ID = "session-guard-freeze";
var STATE_POLL_MS = 15e3;
var LOCK_POLL_MS = 5e3;
async function rpc(sessionId, action, extra = {}) {
  try {
    const res = await fetch("/session-guard/rpc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, action, ...extra })
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, body };
  } catch (e) {
    return { ok: false, body: { error: String(e && e.message || e) } };
  }
}
async function fetchState(sessionId) {
  try {
    const res = await fetch(`/session-guard/state?session=${encodeURIComponent(sessionId)}`);
    const body = await res.json().catch(() => ({}));
    return body && body.state ? body.state : null;
  } catch {
    return null;
  }
}
function createFallbackFreezeControl({ sessionId, getQueued, detachQueue, reattachQueue, notify }) {
  const frozen = () => fallbackFreezeStore.getSnapshot().frozen;
  async function freeze() {
    const queued = getQueued();
    const pending = queued.filter((row) => typeof row.text === "string" && row.text !== "").map((row) => ({ text: row.text }));
    await detachQueue(queued);
    setFrozen(pending);
    await rpc(sessionId, "stopNextTurn");
    if (notify) notify("info", "\u5DF2\u51BB\u7ED3\uFF1A\u961F\u5217\u5DF2\u6682\u5B58\uFF0C\u4F1A\u8BDD\u4E0B\u4E00\u56DE\u5408\u5DF2\u505C\u6B62");
  }
  async function unfreeze() {
    const pending = fallbackFreezeStore.getSnapshot().pending;
    clearFrozen();
    for (const entry of pending) {
      await reattachQueue(entry.text);
    }
    await rpc(sessionId, "resume");
    if (notify) notify("info", "\u5DF2\u89E3\u51BB\uFF1A\u961F\u5217\u5DF2\u6062\u590D");
  }
  return {
    frozen,
    freeze,
    unfreeze
  };
}
function apply(ctx) {
  const bridgePresent = detectInputTrafficBridge();
  if (!bridgePresent) {
    ctx.effect(() => {
      try {
        ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
          name: "conversation.input.right",
          id: FREEZE_SLOT_ID,
          order: 40,
          locale: "session-guard",
          inject: (sessionId) => ({
            // 由注入方提供 conversation 服务动词；此处仅声明占位，
            // 具体实现依赖会话 scope（与 input-traffic 的 freeze-button 同构）。
            sessionId,
            rpc
          })
        }, FallbackFreezeButton));
      } catch (e) {
        console.warn("[session-guard] fallback freeze slot unavailable: " + String(e && e.message || e));
      }
    }, "session-guard: fallback freeze slot");
  }
  ctx.effect(() => {
    const timers = [];
    try {
      timers.push(setInterval(() => {
        for (const s of ctx.sessions ? ctx.sessions.list?.() ?? [] : []) {
          void fetchState(String(s.id)).then((st) => {
            lastStateBySession.set(String(s.id), st);
          });
        }
      }, STATE_POLL_MS));
      timers.push(setInterval(() => {
        for (const s of ctx.sessions ? ctx.sessions.list?.() ?? [] : []) {
          void fetchState(String(s.id)).then((st) => {
            lastStateBySession.set(String(s.id), st);
          });
        }
      }, LOCK_POLL_MS));
    } catch (e) {
      console.warn("[session-guard] state polling unavailable: " + String(e && e.message || e));
    }
    return () => {
      for (const t of timers) clearInterval(t);
    };
  }, "session-guard: state polling");
}
var lastStateBySession = /* @__PURE__ */ new Map();
function FallbackFreezeButton(props) {
  return {
    // 见 README「回退冻结按钮」：挂接 createFallbackFreezeControl 的 freeze/unfreeze。
  };
}
return module.exports; } });

