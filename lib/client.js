window.__ModuleLoader__.load({
	id: "dsh-session-guard",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/badge-text.ts
		/** 阶段文案。 */
		const PHASE_LABELS = {
			peak: "高峰",
			"off-peak": "谷时",
			weekend: "周末"
		};
		/** 高峰期的徽标文案：二维判定开启时区分「只拦官方」与「全部暂停」。 */
		function peakLabel(status) {
			if (status.phase !== "peak") return PHASE_LABELS[status.phase];
			return status.providerGuard === true ? "高峰·拦官方" : "高峰·全部暂停";
		}
		/** 悬浮说明：把判定口径与当前挂起/延后数量写清楚。 */
		function badgeTitle(status) {
			const base = `${PHASE_LABELS[status.phase]} · ${status.timezone}${status.weekendMode ? " · 周末模式" : ""}`;
			if (status.phase !== "peak") return base;
			const mode = status.providerGuard === true ? "仅拦截 DeepSeek 官方源" : "全部会话暂停（未启用二维判定）";
			const held = status.held ?? 0;
			const deferred = status.deferred ?? 0;
			const stepHeld = status.stepHeld ?? 0;
			return `${base} · ${mode}${held > 0 || deferred > 0 || stepHeld > 0 ? ` · 挂起 ${held} · 延后 ${deferred} · step 挂起 ${stepHeld}` : ""}`;
		}
		//#endregion
		//#region src/client/styles.ts
		/**
		* dsh-session-guard — 客户端样式（与 composer 右侧 input-traffic 冻结按钮同一视觉语言）。
		*
		* 为什么注入 `<style>` 而不是 CSS Modules：本插件的 tsdown 配置没有 CSS Modules 管线
		* （input-traffic 有），而 settings-card 已经用 `<style data-plugin-css>` 的既有约定。
		* 这里只做一件事：把「暂停会话 / 继续会话」按钮与状态徽标对齐到同一行的其它控件
		* （高度 24px、圆角 6px、12px 字号、同样的 border / hover / pressed 令牌）。
		*/
		/** 与 `dsh-input-traffic/src/client/freeze-button.module.css` 对齐的控件外观。 */
		const CLIENT_CSS = `
.sg-pause{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;line-height:1;cursor:pointer;white-space:nowrap;flex:none}
.sg-pause:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04))}
.sg-pause:disabled{opacity:.55;cursor:default}
.sg-pause[aria-pressed='true']{border-color:var(--dsw-alias-state-warning-primary,#d97706);color:var(--dsw-alias-state-warning-primary,#d97706);background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#d97706) 8%,transparent)}
.sg-status{display:inline-flex;align-items:center;height:24px;padding:0 8px;border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));border-radius:6px;font-size:12px;line-height:1;color:var(--dsw-alias-label-secondary,#6b7280);white-space:nowrap;flex:none}
.sg-status.sg-peak{border-color:var(--dsw-alias-state-warning-primary,#d97706);color:var(--dsw-alias-state-warning-primary,#d97706)}
.sg-status.sg-weekend{border-color:var(--dsw-alias-state-success-primary,#30a46c);color:var(--dsw-alias-state-success-primary,#30a46c)}
`;
		/** 注入一次（幂等；无 document 时静默跳过）。 */
		function injectClientCss() {
			if (typeof document === "undefined") return;
			if (document.querySelector("style[data-plugin-css=\"session-guard-client\"]") !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-session-guard";
			tag.dataset.pluginCss = "session-guard-client";
			tag.textContent = CLIENT_CSS;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/client/status-badge.tsx
		/**
		* dsh-session-guard — 状态徽标（纯展示，fail-open）。
		*
		* 轮询 host 的 /session-guard/status（全局当前阶段），显示 高峰/谷时/周末；
		* 高峰期按二维判定区分「只拦官方」与「全部暂停」（文案见 badge-text.ts）。
		* 仅展示，不做任何队列/会话动作；冻结按钮由 input-traffic 经桥接管（D6/D8）。
		*/
		const POLL_MS$1 = 15e3;
		/** 状态徽标：轮询全局阶段，显示 高峰/谷时/周末（enabled 关闭或请求失败时静默隐藏）。 */
		function StatusBadge({ sessionId }) {
			const [status, setStatus] = (0, react.useState)(null);
			injectClientCss();
			(0, react.useEffect)(() => {
				if (!sessionId) return;
				let cancelled = false;
				const poll = async () => {
					try {
						const body = await (await fetch("/session-guard/status")).json().catch(() => null);
						if (!cancelled && body?.ok && body.status) setStatus(body.status);
					} catch {}
				};
				poll();
				const timer = setInterval(poll, POLL_MS$1);
				return () => {
					cancelled = true;
					clearInterval(timer);
				};
			}, [sessionId]);
			if (!status || !status.enabled) return null;
			const cls = status.phase === "peak" ? "sg-peak" : status.phase === "weekend" ? "sg-weekend" : "sg-off";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: `sg-status ${cls}`,
				title: badgeTitle(status),
				"data-sg-phase": status.phase,
				"data-sg-provider-guard": status.providerGuard === true ? "on" : "off",
				"data-sg-step-held": String(status.stepHeld ?? 0),
				children: peakLabel(status)
			});
		}
		//#endregion
		//#region src/client/pause-button-text.ts
		/** 按钮文案。 */
		function pauseButtonLabel(state) {
			return state.paused === true ? "继续会话" : "暂停会话";
		}
		/** 悬浮说明：写清当前状态与点击后的语义。 */
		function pauseButtonTitle(state) {
			if (state.paused !== true) return "暂停会话：在下一次 step 的模型请求前暂停（高峰 + 官方源时会自动暂停）";
			const since = typeof state.heldSince === "number" && Number.isFinite(state.heldSince) ? new Date(state.heldSince) : null;
			const at = since === null ? null : `${String(since.getHours()).padStart(2, "0")}:${String(since.getMinutes()).padStart(2, "0")}`;
			const why = state.manual === true ? "手动暂停" : "高峰自动暂停";
			return `${at === null ? `已暂停（${why}）` : `已暂停（${why}，自 ${at}）`} · 点击继续：放行当前 step，且本高峰内不再拦该会话`;
		}
		/** 把 `/session-guard/state` 的响应体投影为按钮状态（形状异常 → 未暂停，fail-open）。 */
		function readPauseState(body) {
			const b = body ?? {};
			if (b.ok !== true) return {
				paused: false,
				heldSince: null,
				manual: false
			};
			const manual = b.paused?.manual === true || b.stepGate?.manual === true || b.state?.stepManual === true;
			const paused = b.paused?.step === true || b.state?.pausedStep === true || manual;
			const raw = b.stepGate?.since ?? b.state?.stepHeldSince ?? null;
			return {
				paused,
				heldSince: typeof raw === "number" && Number.isFinite(raw) ? raw : null,
				manual
			};
		}
		/** 把 SSE `/session-guard/events` 的 `state` 快照投影为按钮状态。 */
		function readStepSnapshot(snapshot) {
			const s = snapshot ?? {};
			const manual = s.manual === true;
			return {
				paused: s.held === true || manual,
				heldSince: typeof s.since === "number" && Number.isFinite(s.since) ? s.since : null,
				manual
			};
		}
		//#endregion
		//#region src/client/pause-button.tsx
		/**
		* dsh-session-guard — 「暂停会话 / 继续会话」按钮（`conversation.input.right`，order 20）。
		*
		* 交互（v0.2.0 修订）：
		* - 未暂停 → 「暂停会话」，**可点**：点击 POST `{action:'stepPause'}`，在**下一次 step 边界**暂停
		*   （不打断当前 step；step 1 也拦，不受峰谷 / provider 限制）；
		* - 已暂停（高峰自动拉门 **或** 手动请求已登记）→ 「继续会话」，点击 POST `{action:'stepResume'}`；
		* - 状态更新双通道：① SSE `/session-guard/events?session=<id>` 即时推送；② 10s 轮询兜底
		*   （SSE 不可用 / 断线时仍能收敛）。全部 fail-open，绝不抛错。
		*
		* 与 input-traffic 的「❄ 冻结追加 / 恢复追加」并列（order 30 在其右侧），互不取代：
		* 本按钮控 step 门，冻结按钮控回合级冻结 + 队列摘除。
		*/
		/** SSE 不可用时的兜底轮询间隔（正常路径由事件驱动，几乎不触发）。 */
		const POLL_MS = 1e4;
		const IDLE = {
			paused: false,
			heldSince: null,
			manual: false
		};
		/** 暂停 / 继续会话按钮。 */
		function PauseButton({ sessionId }) {
			const [state, setState] = (0, react.useState)(IDLE);
			const [busy, setBusy] = (0, react.useState)(false);
			injectClientCss();
			(0, react.useEffect)(() => {
				if (sessionId === void 0 || sessionId === "") return;
				let cancelled = false;
				const poll = async () => {
					try {
						const body = await (await fetch(`/session-guard/state?session=${encodeURIComponent(sessionId)}`)).json().catch(() => null);
						if (cancelled) return;
						setState(readPauseState(body));
					} catch {}
				};
				poll();
				const timer = setInterval(() => {
					poll();
				}, POLL_MS);
				let source;
				try {
					source = new EventSource(`/session-guard/events?session=${encodeURIComponent(sessionId)}`);
					source.onmessage = (ev) => {
						try {
							const msg = JSON.parse(ev.data);
							if (cancelled || msg?.type !== "step") return;
							setState(readStepSnapshot(msg.state));
						} catch {}
					};
					source.onerror = () => void 0;
				} catch {}
				return () => {
					cancelled = true;
					clearInterval(timer);
					try {
						source?.close();
					} catch {}
				};
			}, [sessionId]);
			if (sessionId === void 0 || sessionId === "") return null;
			const paused = state.paused === true;
			const onClick = async () => {
				if (busy) return;
				setBusy(true);
				try {
					if ((await (await fetch("/session-guard/rpc", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							sessionId,
							action: paused ? "stepResume" : "stepPause"
						})
					})).json().catch(() => null))?.ok === true) setState(paused ? IDLE : {
						paused: true,
						heldSince: null,
						manual: true
					});
				} catch {} finally {
					setBusy(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "sg-pause",
				disabled: busy,
				"aria-pressed": paused || void 0,
				title: pauseButtonTitle(state),
				"data-sg-step-paused": paused ? "on" : "off",
				onClick: () => {
					onClick();
				},
				children: pauseButtonLabel(state)
			});
		}
		//#endregion
		//#region src/client/index.ts
		/**
		* dsh-session-guard — 浏览器 half。
		*
		* 职责（全部 fail-open，D8）：
		* - 在 composer 输入区右侧注册一个**纯展示**状态徽标（高峰/谷时/周末），轮询
		*   /session-guard/status；
		* - **不做**冻结/会话动作——冻结按钮由 input-traffic 接管并经 /session-guard/rpc
		*   桥接 host 会话门；本插件客户端不注册任何按钮，避免与 input-traffic 冲突。
		* - 0.1.7：旧的插件设置卡已随席位删除 —— 设置表单由 host
		*   侧 Config 的 `.volatile()` 字段自动生成。
		*
		* 构建：tsdown → lib/client.js（__ModuleLoader__.load 注册，与 input-traffic 同构）。
		*/
		/** 客户端所需服务：slots（状态徽标）+ locale。 */
		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
				name: "conversation.input.right",
				id: "session-guard-pause",
				order: 20,
				locale: "session-guard"
			}, PauseButton));
			ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
				name: "conversation.input.right",
				id: "session-guard-status",
				order: 40,
				locale: "session-guard"
			}, StatusBadge));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map