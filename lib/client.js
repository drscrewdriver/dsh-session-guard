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
		*
		* 覆盖两块：
		* - 「畅跑」按钮（四态：默认 / 畅跑中 / 畅跑暂停）与状态徽标，对齐到同一行的其它控件
		*   （高度 24px、圆角 6px、12px 字号、同样的 border / hover 令牌）；
		* - 畅跑任务的**管理弹层**（列表 + 日期/小时选择器 + 操作按钮），同样只用原生控件。
		*/
		/** 与 `dsh-input-traffic/src/client/freeze-button.module.css` 对齐的控件外观。 */
		const CLIENT_CSS = `
.sg-fr-root{position:relative;display:inline-flex;flex:none}
.sg-fr{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;line-height:1;cursor:pointer;white-space:nowrap;flex:none}
.sg-fr:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04))}
.sg-fr:disabled{opacity:.55;cursor:default}
.sg-fr[aria-pressed='true'],.sg-fr-active{border-color:var(--dsw-alias-state-success-primary,#30a46c);color:var(--dsw-alias-state-success-primary,#30a46c);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#30a46c) 8%,transparent)}
.sg-fr-suspended{border-color:var(--dsw-alias-state-warning-primary,#d97706);color:var(--dsw-alias-state-warning-primary,#d97706);background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#d97706) 8%,transparent)}
.sg-status{display:inline-flex;align-items:center;height:24px;padding:0 8px;border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));border-radius:6px;font-size:12px;line-height:1;color:var(--dsw-alias-label-secondary,#6b7280);white-space:nowrap;flex:none}
.sg-status.sg-peak{border-color:var(--dsw-alias-state-warning-primary,#d97706);color:var(--dsw-alias-state-warning-primary,#d97706)}
.sg-status.sg-weekend{border-color:var(--dsw-alias-state-success-primary,#30a46c);color:var(--dsw-alias-state-success-primary,#30a46c)}
.sg-fr-panel{position:absolute;bottom:calc(100% + 8px);right:0;z-index:40;width:448px;max-width:calc(100vw - 24px);box-sizing:border-box;padding:10px 12px 12px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1));border-radius:10px;background:var(--dsw-specific-input-major,#fff);box-shadow:var(--dsw-elevation-panel,0 6px 24px rgba(0,0,0,.16));color:var(--dsw-alias-label-primary,#111);font-size:12px;line-height:1.5}
.sg-fr-panel *{box-sizing:border-box}
.sg-fr-head{display:flex;align-items:baseline;gap:8px;font-size:13px;font-weight:600;margin-bottom:8px}
.sg-fr-title{flex:1;min-width:0}
.sg-fr-tz{font-weight:400;font-size:11px;color:var(--dsw-alias-label-tertiary,#6b7280)}
.sg-fr-closeicon{flex:none;width:20px;height:20px;line-height:1;padding:0;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-tertiary,#6b7280);cursor:pointer;font-size:14px;font-weight:400}
.sg-fr-closeicon:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#111)}
.sg-fr-bar{display:flex;gap:6px;margin-bottom:8px}
.sg-fr-bar-btn{flex:1;min-width:0;height:26px;padding:0 6px;border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);font:inherit;font-size:12px;line-height:1;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sg-fr-bar-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#111)}
.sg-fr-bar-btn:disabled{opacity:.5;cursor:default}
.sg-fr-bar-on{border-color:var(--dsw-alias-button-primary-fill,#4d6bfe);color:var(--dsw-alias-button-primary-fill,#4d6bfe)}
.sg-fr-bar-danger:hover:not(:disabled){border-color:var(--dsw-alias-state-error-primary,#dc2626);color:var(--dsw-alias-state-error-primary,#dc2626)}
.sg-fr-empty{color:var(--dsw-alias-label-tertiary,#6b7280);padding:2px 0 8px}
.sg-fr-list{list-style:none;margin:0 0 8px;padding:0;max-height:168px;overflow:auto}
.sg-fr-item{display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.06))}
.sg-fr-range{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.sg-fr-tag{flex:none;font-size:11px;padding:0 4px;border-radius:4px;border:1px solid transparent}
.sg-fr-tag-active{border-color:var(--dsw-alias-state-success-primary,#30a46c);color:var(--dsw-alias-state-success-primary,#30a46c)}
.sg-fr-tag-scheduled{color:var(--dsw-alias-label-tertiary,#6b7280)}
.sg-fr-tag-paused{border-color:var(--dsw-alias-state-warning-primary,#d97706);color:var(--dsw-alias-state-warning-primary,#d97706)}
.sg-fr-tag-ended{color:var(--dsw-alias-label-dimmed,#9ca3af)}
.sg-fr-icon{flex:none;width:22px;height:22px;line-height:1;padding:0;border:1px solid transparent;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);cursor:pointer;font-size:12px;display:inline-flex;align-items:center;justify-content:center}
.sg-fr-icon:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#111)}
.sg-fr-icon:disabled{opacity:.4;cursor:default}
.sg-fr-icon-danger:hover:not(:disabled){color:var(--dsw-alias-state-error-primary,#dc2626)}
.sg-fr-form{display:flex;flex-direction:column;gap:6px;margin:2px 0 8px;padding:8px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));border-radius:8px}
.sg-fr-form-actions{display:flex;justify-content:flex-end;gap:6px}
.sg-fr-add,.sg-fr-cancel{height:24px;padding:0 10px;border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}
.sg-fr-add{border-color:var(--dsw-alias-button-primary-fill,#4d6bfe);color:var(--dsw-alias-button-primary-fill,#4d6bfe)}
.sg-fr-add:hover:not(:disabled),.sg-fr-cancel:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.sg-fr-add:disabled,.sg-fr-cancel:disabled{opacity:.55;cursor:default}
.sg-fr-error{color:var(--dsw-alias-state-error-primary,#dc2626);margin-top:6px}
/* ── 日期范围选择器（双月日历，风格对齐 DSH 排期面板）── */
.sg-dr-root{position:relative}
.sg-dr-trigger{display:flex;align-items:center;gap:6px;width:100%;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));border-radius:6px;background:var(--dsw-alias-bg-layer-2,transparent);color:inherit;font:inherit;font-size:12px;cursor:pointer;text-align:left}
.sg-dr-trigger:hover:not(:disabled){border-color:var(--dsw-alias-border-l4,rgba(0,0,0,.2))}
.sg-dr-trigger:disabled{opacity:.55;cursor:default}
.sg-dr-text{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.sg-dr-ph .sg-dr-text{color:var(--dsw-alias-label-tertiary,#6b7280)}
.sg-dr-icon{flex:none;display:inline-flex;color:var(--dsw-alias-label-tertiary,#6b7280)}
.sg-dr-panel{position:absolute;top:calc(100% + 6px);left:0;z-index:60;padding:8px 10px 10px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1));border-radius:10px;background:var(--dsw-specific-input-major,#fff);box-shadow:var(--dsw-elevation-panel,0 6px 24px rgba(0,0,0,.16))}
.sg-dr-head{display:flex;align-items:center;gap:2px;margin-bottom:4px}
.sg-dr-spacer{flex:1}
.sg-dr-nav{width:22px;height:22px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;line-height:1;cursor:pointer}
.sg-dr-nav:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#111)}
.sg-dr-months{display:flex;gap:14px}
.sg-dr-month{width:196px}
.sg-dr-mtitle{text-align:center;font-size:12px;font-weight:600;margin-bottom:4px}
.sg-dr-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px}
.sg-dr-wd{text-align:center;font-size:11px;color:var(--dsw-alias-label-tertiary,#6b7280);padding-bottom:2px}
.sg-dr-day{height:24px;padding:0;border:0;border-radius:4px;background:transparent;color:inherit;font:inherit;font-size:12px;line-height:1;cursor:pointer;font-variant-numeric:tabular-nums}
.sg-dr-day:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.sg-dr-out{color:var(--dsw-alias-label-dimmed,#9ca3af)}
.sg-dr-in{background:var(--dsw-alias-interactive-bg-selected,rgba(77,107,254,.12))}
.sg-dr-edge{background:var(--dsw-alias-button-primary-fill,#4d6bfe);color:#fff;font-weight:600}
.sg-dr-edge:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,#3f5ce8)}
.sg-dr-today{outline:1px solid var(--dsw-alias-border-l4,rgba(0,0,0,.2));outline-offset:-1px}
.sg-fr-hours{display:flex;align-items:center;gap:6px}
.sg-fr-hour{display:flex;align-items:center;gap:4px;flex:1;min-width:0}
.sg-fr-hour>span:first-child{flex:none;color:var(--dsw-alias-label-tertiary,#6b7280)}
.sg-fr-hour>select{flex:1;min-width:0;font:inherit;font-size:12px;padding:3px 6px;border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));border-radius:6px;background:var(--dsw-alias-bg-layer-2,transparent);color:inherit}
.sg-fr-unit{flex:none;color:var(--dsw-alias-label-tertiary,#6b7280)}
.sg-fr-now{flex:none;height:24px;padding:0 8px;border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}
.sg-fr-now:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.sg-fr-form{display:flex;flex-direction:column;gap:6px;margin:8px 0}
.sg-fr-add{align-self:flex-end;height:24px;padding:0 10px;border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}
.sg-fr-add:hover:not(:disabled),.sg-fr-resume:hover:not(:disabled),.sg-fr-clear:hover:not(:disabled),.sg-fr-close:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.sg-fr-add:disabled,.sg-fr-resume:disabled,.sg-fr-clear:disabled{opacity:.55;cursor:default}
.sg-fr-error{color:var(--dsw-alias-state-error-primary,#dc2626);margin-bottom:6px}
.sg-fr-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:4px}
.sg-fr-actions>button{height:24px;padding:0 10px;border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}
.sg-fr-resume{border-color:var(--dsw-alias-state-success-primary,#30a46c)!important;color:var(--dsw-alias-state-success-primary,#30a46c)!important}
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
		//#region src/client/free-run-button-text.ts
		/** 空视图（请求失败 / 未加载时的安全默认）。 */
		const EMPTY_FREE_RUN = {
			state: "none",
			active: false,
			available: false,
			timezone: "",
			windows: [],
			activeId: null,
			msRemaining: null,
			nextStartMs: null,
			nextStartDisplay: null
		};
		/** 按钮文案：固定「畅跑」，多段时带计数。 */
		function freeRunLabel(view) {
			const count = view?.windows?.length ?? 0;
			return count > 1 ? `畅跑 ×${count}` : "畅跑";
		}
		/** 悬浮提示：当前是否生效 + 逐条排期（多任务的重要信息出口）。 */
		function freeRunTitle(view) {
			const tz = view?.timezone !== void 0 && view.timezone !== "" ? view.timezone : "本地时区";
			const lines = ["点击打开畅跑任务管理"];
			if (view?.active === true) {
				const left = remainingText(view?.msRemaining ?? null);
				lines.unshift(left === null ? "畅跑生效中" : `畅跑生效中（剩 ${left}）`);
			} else if ((view?.windows?.length ?? 0) > 0) {
				const next = view?.nextStartDisplay ?? null;
				lines.unshift(next === null ? "畅跑未生效" : `畅跑未生效，下一段 ${next}`);
			}
			const windows = view?.windows ?? [];
			if (windows.length > 0) {
				lines.push("—— 畅跑任务 ——");
				for (const w of windows) lines.push(`${w.fromDisplay} – ${w.toDisplay}  ${statusLabel(w.status)}`);
			} else lines.push(`还没有畅跑任务（时间按 ${tz}）`);
			return lines.join("\n");
		}
		/** 单段状态标签。 */
		function statusLabel(status) {
			if (status === "active") return "进行中";
			if (status === "paused") return "已暂停";
			if (status === "scheduled") return "待开始";
			return "已结束";
		}
		/** 该行是否显示「暂停」图标（已结束的段无从暂停）。 */
		function canPause(w) {
			return w.status !== "ended" && w.paused !== true;
		}
		/** 该行是否显示「恢复」图标。 */
		function canResume(w) {
			return w.status !== "ended" && w.paused === true;
		}
		/** 未结束（可操作）的任务。 */
		function liveWindows(view) {
			return (view?.windows ?? []).filter((w) => w.status !== "ended");
		}
		/** 是否所有未结束的任务都已被暂停（决定顶部按钮显示「暂停全部任务」还是「恢复全部任务」）。 */
		function allTasksPaused(view) {
			const live = liveWindows(view);
			return live.length > 0 && live.every((w) => w.paused === true);
		}
		/** 顶部第二个文本按钮的文案。 */
		function pauseAllLabel(view) {
			return allTasksPaused(view) ? "恢复全部任务" : "暂停全部任务";
		}
		/** 顶部三个文本按钮是否可用（没有任务时后两个禁用）。 */
		function toolbarDisabled(view) {
			return liveWindows(view).length === 0;
		}
		/** 每行暂停 / 恢复图标按钮的悬浮提示。 */
		function rowPauseTitle(w) {
			return w.paused === true ? "恢复这一段畅跑" : "暂停这一段畅跑（其他段不受影响）";
		}
		/** 每行删除图标按钮的悬浮提示。 */
		function rowDeleteTitle() {
			return "删除这一段畅跑";
		}
		/** 剩余时长文案（中文，粗粒度）。 */
		function remainingText(ms) {
			if (ms === null || !Number.isFinite(ms) || ms <= 0) return null;
			const totalMinutes = Math.ceil(ms / 6e4);
			if (totalMinutes < 60) return `${totalMinutes} 分钟`;
			const hours = Math.floor(totalMinutes / 60);
			const minutes = totalMinutes % 60;
			return minutes === 0 ? `${hours} 小时` : `${hours} 小时 ${minutes} 分`;
		}
		/** 从 `/session-guard/state` 响应体里取出 `freeRun`（形状异常 → 安全空视图）。 */
		function readFreeRun(body) {
			const b = body ?? {};
			if (b.ok !== true) return EMPTY_FREE_RUN;
			const f = b.freeRun;
			if (f === null || typeof f !== "object") return EMPTY_FREE_RUN;
			const raw = f;
			const windows = Array.isArray(raw.windows) ? raw.windows.filter((w) => w !== null && typeof w === "object") : [];
			return {
				state: typeof raw.state === "string" ? raw.state : "none",
				active: raw.active === true,
				available: raw.available === true,
				timezone: typeof raw.timezone === "string" ? raw.timezone : "",
				windows,
				activeId: typeof raw.activeId === "string" ? raw.activeId : null,
				msRemaining: typeof raw.msRemaining === "number" ? raw.msRemaining : null,
				nextStartMs: typeof raw.nextStartMs === "number" ? raw.nextStartMs : null,
				nextStartDisplay: typeof raw.nextStartDisplay === "string" ? raw.nextStartDisplay : null
			};
		}
		//#endregion
		//#region src/client/date-range.ts
		const WEEKDAY_LABELS = [
			"一",
			"二",
			"三",
			"四",
			"五",
			"六",
			"日"
		];
		/** 周一到周日的表头。 */
		function weekdayLabels() {
			return [...WEEKDAY_LABELS];
		}
		/** 两位补零。 */
		function pad2(n) {
			return String(n).padStart(2, "0");
		}
		/** `Ymd` → `YYYY-MM-DD`。 */
		function toIso({ y, m, d }) {
			return `${y}-${pad2(m)}-${pad2(d)}`;
		}
		/** `YYYY-MM-DD` → `Ymd`；非法返回 null。 */
		function fromIso(value) {
			const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === "string" ? value : "");
			if (m === null) return null;
			const y = Number(m[1]);
			const mo = Number(m[2]);
			const d = Number(m[3]);
			if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
			return {
				y,
				m: mo,
				d
			};
		}
		/** 该月天数（用「下个月 0 号」拿到，天然处理闰年）。 */
		function daysInMonth(y, m) {
			return new Date(y, m, 0).getDate();
		}
		/** 该月 1 号是周几（0=周日…6=周六）。 */
		function firstWeekday(y, m) {
			return new Date(y, m - 1, 1).getDay();
		}
		/** 月份偏移（可跨年）。 */
		function addMonths({ y, m }, delta) {
			const total = y * 12 + (m - 1) + delta;
			return {
				y: Math.floor(total / 12),
				m: total % 12 + 1
			};
		}
		/**
		* 该月的日历网格：周一开头，长度固定为 7 的倍数（可能 5 或 6 周）。
		* 非本月的格子用 `inMonth: false` 标出（界面上淡显）。
		*/
		function monthGrid(y, m) {
			const lead = (firstWeekday(y, m) + 6) % 7;
			const total = daysInMonth(y, m);
			const cells = [];
			const prev = addMonths({
				y,
				m
			}, -1);
			const prevTotal = daysInMonth(prev.y, prev.m);
			for (let i = lead - 1; i >= 0; i -= 1) {
				const d = prevTotal - i;
				cells.push({
					day: d,
					iso: toIso({
						y: prev.y,
						m: prev.m,
						d
					}),
					inMonth: false
				});
			}
			for (let d = 1; d <= total; d += 1) cells.push({
				day: d,
				iso: toIso({
					y,
					m,
					d
				}),
				inMonth: true
			});
			const next = addMonths({
				y,
				m
			}, 1);
			let d = 1;
			while (cells.length % 7 !== 0) {
				cells.push({
					day: d,
					iso: toIso({
						y: next.y,
						m: next.m,
						d
					}),
					inMonth: false
				});
				d += 1;
			}
			return cells;
		}
		/** 月份标题，如 `2026年 9月`。 */
		function monthTitle(y, m) {
			return `${y}年 ${m}月`;
		}
		/** 日期先后比较：a<b → -1，相等 → 0，a>b → 1（字符串直接比即可，形态定长）。 */
		function compareIso(a, b) {
			if (a === b) return 0;
			return a < b ? -1 : 1;
		}
		/** 该日是否落在 `[from, to]` 闭区间内（任一端为空则不算命中）。 */
		function inRange(iso, from, to) {
			if (from === "" || to === "") return false;
			const [lo, hi] = compareIso(from, to) <= 0 ? [from, to] : [to, from];
			return compareIso(iso, lo) >= 0 && compareIso(iso, hi) <= 0;
		}
		/** 是否区间的端点。 */
		function isEdge(iso, from, to) {
			return iso === from || iso === to;
		}
		/** 把「日期 + 小时」拼成主机要的墙钟串（按配置时区解释）：开始 = `H:00`。 */
		function combineStart(date, hour) {
			return `${date}T${pad2(Number(hour))}:00`;
		}
		/** 把「日期 + 小时」拼成主机要的墙钟串：结束 = `H:59`（含该小时）。 */
		function combineEnd(date, hour) {
			return `${date}T${pad2(Number(hour))}:${pad2(59)}`;
		}
		/**
		* 默认区间：**开始 = 当前时刻**（本小时整点），结束 = 下一个小时（按上面的「含该小时」
		* 语义即覆盖 2 个自然小时；跨天/跨月/跨年会顺延到下一天）。
		*
		* 与用户要求一致：「默认开始时间是当前时刻」。返回 `YYYY-MM-DD` 与 `HH` 四段，
		* 直接喂给日历 + 小时下拉。
		*/
		function seedRange(now) {
			const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
			const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0, 0);
			return {
				fromDate: toIso({
					y: start.getFullYear(),
					m: start.getMonth() + 1,
					d: start.getDate()
				}),
				fromHour: pad2(start.getHours()),
				toDate: toIso({
					y: end.getFullYear(),
					m: end.getMonth() + 1,
					d: end.getDate()
				}),
				toHour: pad2(end.getHours())
			};
		}
		/**
		* 一次点击后的范围状态机：
		* - 还没选起点，或已有完整区间 → 该点成为**新起点**，终点清空（等待第二次点击）；
		* - 已有起点、没有终点 → 该点成为终点；若它在起点之前，则两者对调（允许反着选）。
		*/
		function nextRange(from, to, picked) {
			if (from === "" || to !== "") return {
				from: picked,
				to: "",
				done: false
			};
			return compareIso(picked, from) >= 0 ? {
				from,
				to: picked,
				done: true
			} : {
				from: picked,
				to: from,
				done: true
			};
		}
		/** 触发器上显示的区间文案（未选满时给占位）。 */
		function rangeLabel(from, to) {
			if (from !== "" && to !== "") return {
				text: `${from} → ${to}`,
				placeholder: false
			};
			if (from !== "") return {
				text: `${from} → 结束日期`,
				placeholder: true
			};
			return {
				text: "开始日期 → 结束日期",
				placeholder: true
			};
		}
		//#endregion
		//#region src/client/date-range-picker.tsx
		/**
		* dsh-session-guard — 日期范围选择器（双月日历，风格对齐 DSH 排期面板）。
		*
		* 交互：
		* - 触发器是一行 `开始日期 → 结束日期` + 日历图标；
		* - 点开后是两个并排月份，`‹‹ ‹  2026年 9月   2026年 10月  › ››`；
		* - 第一次点选起点、第二次点选终点（反着点会自动对调）；选满即收起；
		* - 已有完整区间时再点一次 = 重新开始选。
		*
		* 只有日期；**小时**由调用方在日历旁另配下拉（保持「到小时」的精度）。
		* 纯展示 + 受控回调，不做校验（非法组合由主机侧拒绝并回报错误）。
		*/
		/** 双月范围日历。 */
		function DateRangePicker({ from, to, onChange, disabled = false }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [anchor, setAnchor] = (0, react.useState)(() => {
				const seed = fromIso(from) ?? fromIso(to) ?? fromIso(toIso(/* @__PURE__ */ new Date()));
				return {
					y: seed.y,
					m: seed.m
				};
			});
			const rootRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				const seed = fromIso(from) ?? fromIso(to);
				if (seed !== null && open) setAnchor({
					y: seed.y,
					m: seed.m
				});
			}, [open]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onDown = (ev) => {
					const el = rootRef.current;
					if (el !== null && ev.target instanceof Node && !el.contains(ev.target)) setOpen(false);
				};
				const onKey = (ev) => {
					if (ev.key === "Escape") setOpen(false);
				};
				document.addEventListener("mousedown", onDown);
				document.addEventListener("keydown", onKey);
				return () => {
					document.removeEventListener("mousedown", onDown);
					document.removeEventListener("keydown", onKey);
				};
			}, [open]);
			const label = rangeLabel(from, to);
			const right = addMonths(anchor, 1);
			const todayIso = toIso(/* @__PURE__ */ new Date());
			function pick(iso) {
				const r = nextRange(from, to, iso);
				onChange(r.from, r.to);
				if (r.done) setOpen(false);
			}
			function cellClass(iso, inMonth) {
				const parts = ["sg-dr-day"];
				if (!inMonth) parts.push("sg-dr-out");
				if (inRange(iso, from, to)) parts.push("sg-dr-in");
				if (isEdge(iso, from, to) && compareIso(from, to) !== 0) parts.push("sg-dr-edge");
				else if (isEdge(iso, from, to)) parts.push("sg-dr-edge", "sg-dr-single");
				if (iso === todayIso) parts.push("sg-dr-today");
				return parts.join(" ");
			}
			function renderMonth(y, m) {
				const cells = monthGrid(y, m);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "sg-dr-month",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "sg-dr-mtitle",
						children: monthTitle(y, m)
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sg-dr-grid",
						children: [weekdayLabels().map((w) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "sg-dr-wd",
							children: w
						}, w)), cells.map((c) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: cellClass(c.iso, c.inMonth),
							disabled,
							onClick: () => pick(c.iso),
							children: c.day
						}, c.iso))]
					})]
				});
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "sg-dr-root",
				ref: rootRef,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: `sg-dr-trigger ${label.placeholder ? "sg-dr-ph" : ""}`,
					disabled,
					"aria-expanded": open,
					onClick: () => setOpen((p) => !p),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "sg-dr-text",
						children: label.text
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "sg-dr-icon",
						"aria-hidden": "true",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
							width: "14",
							height: "14",
							viewBox: "0 0 16 16",
							fill: "none",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
								x: "2",
								y: "3",
								width: "12",
								height: "11",
								rx: "2",
								stroke: "currentColor",
								strokeWidth: "1.3"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
								d: "M2 6.5h12M5.5 2v2.5M10.5 2v2.5",
								stroke: "currentColor",
								strokeWidth: "1.3",
								strokeLinecap: "round"
							})]
						})
					})]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "sg-dr-panel",
					role: "dialog",
					"aria-label": "选择日期范围",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sg-dr-head",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "sg-dr-nav",
								title: "上一年",
								onClick: () => setAnchor((a) => addMonths(a, -12)),
								children: "‹‹"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "sg-dr-nav",
								title: "上个月",
								onClick: () => setAnchor((a) => addMonths(a, -1)),
								children: "‹"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "sg-dr-spacer" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "sg-dr-nav",
								title: "下个月",
								onClick: () => setAnchor((a) => addMonths(a, 1)),
								children: "›"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "sg-dr-nav",
								title: "下一年",
								onClick: () => setAnchor((a) => addMonths(a, 12)),
								children: "››"
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sg-dr-months",
						children: [renderMonth(anchor.y, anchor.m), renderMonth(right.y, right.m)]
					})]
				})]
			});
		}
		//#endregion
		//#region src/client/free-run-button.tsx
		/**
		* dsh-session-guard — 「畅跑」按钮 + 畅跑任务管理面板（`conversation.input.right`，order 20）。
		*
		* 交互（用户定案）：**点击按钮一律打开任务管理面板**。
		* 面板布局：
		* - **顶部三个文本按钮**：`新建畅跑任务` / `暂停全部任务`（全暂停时变 `恢复全部任务`）/ `删除全部任务`；
		*   「新建」在面板内联展开起止时间选择器（开始 / 结束，到小时）。
		* - **每行两个图标按钮**：`⏸ / ▶`（暂停 / 恢复该段）与 `×`（删除该段）。
		*
		* 按钮文案固定为「畅跑」（任务数 >1 时 `×N`）；是否正在生效靠按钮高亮色 + 悬浮提示
		* 表达。点击永远打开面板，因此没有「生效期间面板不可达」的死角。
		*
		* 时间选择器的输入值按**配置时区**解释（主机侧解析），面板顶部标注该时区。
		*
		* 状态更新：5s 轮询 `/session-guard/state`（畅跑是低频交互，轮询足够且最简单）
		* + 本地定时器保证到点后状态及时刷新。全部 fail-open，绝不抛错。
		*/
		/** 兜底轮询间隔（畅跑是低频交互，5s 足够；到点切换另有本地定时器）。 */
		const POLL_MS = 5e3;
		const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
		/** 畅跑按钮 + 任务管理面板。 */
		function FreeRunButton({ sessionId }) {
			const [view, setView] = (0, react.useState)(EMPTY_FREE_RUN);
			const [open, setOpen] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const [creating, setCreating] = (0, react.useState)(false);
			const [fromDate, setFromDate] = (0, react.useState)("");
			const [fromHour, setFromHour] = (0, react.useState)("");
			const [toDate, setToDate] = (0, react.useState)("");
			const [toHour, setToHour] = (0, react.useState)("");
			const rootRef = (0, react.useRef)(null);
			/** 用「当前时刻」重新播种起止（开始 = 本小时整点，结束 = +2h）。 */
			const seedFromNow = (0, react.useCallback)(() => {
				const s = seedRange(/* @__PURE__ */ new Date());
				setFromDate(s.fromDate);
				setFromHour(s.fromHour);
				setToDate(s.toDate);
				setToHour(s.toHour);
			}, []);
			injectClientCss();
			const poll = (0, react.useCallback)(async () => {
				if (sessionId === void 0 || sessionId === "") return;
				try {
					const body = await (await fetch(`/session-guard/state?session=${encodeURIComponent(sessionId)}`)).json().catch(() => null);
					setView(readFreeRun(body));
				} catch {}
			}, [sessionId]);
			(0, react.useEffect)(() => {
				if (sessionId === void 0 || sessionId === "") return;
				let cancelled = false;
				poll();
				const timer = setInterval(() => {
					if (!cancelled) poll();
				}, POLL_MS);
				return () => {
					cancelled = true;
					clearInterval(timer);
				};
			}, [sessionId, poll]);
			(0, react.useEffect)(() => {
				const ms = view.msRemaining;
				if (ms === null || !Number.isFinite(ms) || ms <= 0) return;
				const timer = setTimeout(() => {
					poll();
				}, ms + 500);
				return () => {
					clearTimeout(timer);
				};
			}, [view.msRemaining, poll]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onDown = (ev) => {
					const el = rootRef.current;
					if (el !== null && ev.target instanceof Node && !el.contains(ev.target)) setOpen(false);
				};
				document.addEventListener("mousedown", onDown);
				return () => {
					document.removeEventListener("mousedown", onDown);
				};
			}, [open]);
			const rpc = (0, react.useCallback)(async (action, payload = {}) => {
				if (sessionId === void 0 || sessionId === "") return false;
				setBusy(true);
				setError("");
				try {
					const body = await (await fetch("/session-guard/rpc", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							sessionId,
							action,
							...payload
						})
					})).json().catch(() => null);
					if (body?.ok === true) {
						setView(readFreeRun({
							ok: true,
							freeRun: body.result
						}));
						return true;
					}
					setError(typeof body?.error === "string" ? body.error : "操作失败");
					return false;
				} catch {
					setError("操作失败（网络或路由不可用）");
					return false;
				} finally {
					setBusy(false);
				}
			}, [sessionId]);
			const onClick = (0, react.useCallback)(() => {
				if (busy) return;
				setOpen((prev) => {
					if (prev) return false;
					seedFromNow();
					setError("");
					return true;
				});
			}, [busy, seedFromNow]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onKey = (ev) => {
					if (ev.key === "Escape") setOpen(false);
				};
				document.addEventListener("keydown", onKey);
				return () => {
					document.removeEventListener("keydown", onKey);
				};
			}, [open]);
			if (sessionId === void 0 || sessionId === "") return null;
			if (!view.available && view.windows.length === 0) return null;
			const onAdd = async () => {
				if (fromDate === "" || fromHour === "" || toDate === "" || toHour === "") {
					setError("请选择开始与结束时间");
					return;
				}
				if (await rpc("freeRunAdd", {
					from: combineStart(fromDate, fromHour),
					to: combineEnd(toDate, toHour)
				})) {
					setError("");
					setCreating(false);
				}
			};
			const nothingToAct = toolbarDisabled(view);
			const allPaused = allTasksPaused(view);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "sg-fr-root",
				ref: rootRef,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: `sg-fr ${view.active ? "sg-fr-active" : ""}`,
					disabled: busy,
					title: freeRunTitle(view),
					"data-sg-free-run-active": view.active ? "on" : "off",
					"data-sg-free-run-count": String(view.windows.length),
					"aria-expanded": open,
					onClick,
					children: freeRunLabel(view)
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "sg-fr-panel",
					role: "dialog",
					"aria-label": "畅跑任务管理",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "sg-fr-head",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "sg-fr-title",
									children: "畅跑任务"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "sg-fr-tz",
									children: ["按 ", view.timezone === "" ? "本地时区" : view.timezone]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "sg-fr-closeicon",
									title: "关闭",
									"aria-label": "关闭",
									onClick: () => {
										setOpen(false);
									},
									children: "×"
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "sg-fr-bar",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `sg-fr-bar-btn ${creating ? "sg-fr-bar-on" : ""}`,
									disabled: busy,
									"aria-pressed": creating,
									onClick: () => {
										setCreating((prev) => !prev);
										setError("");
									},
									children: "新建畅跑任务"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "sg-fr-bar-btn",
									disabled: busy || nothingToAct,
									onClick: () => {
										rpc(allPaused ? "freeRunResumeAll" : "freeRunPauseAll");
									},
									children: pauseAllLabel(view)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "sg-fr-bar-btn sg-fr-bar-danger",
									disabled: busy || view.windows.length === 0,
									onClick: () => {
										rpc("freeRunClear");
									},
									children: "删除全部任务"
								})
							]
						}),
						creating && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "sg-fr-form",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DateRangePicker, {
									from: fromDate,
									to: toDate,
									disabled: busy,
									onChange: (f, t) => {
										setFromDate(f);
										setToDate(t);
										setError("");
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "sg-fr-hours",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: "sg-fr-hour",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "开始" }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
													value: fromHour,
													disabled: busy,
													onChange: (e) => {
														setFromHour(e.target.value);
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "",
														children: "时"
													}), HOURS.map((h) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: h,
														children: h
													}, h))]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "sg-fr-unit",
													children: "时"
												})
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: "sg-fr-hour",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "结束" }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
													value: toHour,
													disabled: busy,
													onChange: (e) => {
														setToHour(e.target.value);
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "",
														children: "时"
													}), HOURS.map((h) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: h,
														children: h
													}, h))]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "sg-fr-unit",
													children: "时"
												})
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "sg-fr-now",
											disabled: busy,
											title: "重置为当前时刻",
											onClick: seedFromNow,
											children: "现在"
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "sg-fr-form-actions",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "sg-fr-add",
										disabled: busy,
										onClick: () => void onAdd(),
										children: "确定"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "sg-fr-cancel",
										disabled: busy,
										onClick: () => {
											setCreating(false);
											setError("");
										},
										children: "取消"
									})]
								})
							]
						}),
						view.windows.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "sg-fr-empty",
							children: "还没有畅跑任务，点「新建畅跑任务」添加"
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
							className: "sg-fr-list",
							children: view.windows.map((w) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
								className: "sg-fr-item",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "sg-fr-range",
										children: [
											w.fromDisplay,
											" – ",
											w.toDisplay
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: `sg-fr-tag sg-fr-tag-${w.status}`,
										children: statusLabel(w.status)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "sg-fr-icon",
										title: rowPauseTitle(w),
										"aria-label": w.paused === true ? "恢复" : "暂停",
										disabled: busy || !canPause(w) && !canResume(w),
										onClick: () => {
											rpc(w.paused === true ? "freeRunResume" : "freeRunPause", { id: w.id });
										},
										children: w.paused === true ? "▶︎" : "⏸︎"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "sg-fr-icon sg-fr-icon-danger",
										title: rowDeleteTitle(),
										"aria-label": "删除",
										disabled: busy,
										onClick: () => {
											rpc("freeRunRemove", { id: w.id });
										},
										children: "×"
									})
								]
							}, w.id))
						}),
						error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "sg-fr-error",
							children: error
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/index.ts
		/**
		* dsh-session-guard — 浏览器 half。
		*
		* 职责（全部 fail-open，D8）：
		* - 在 composer 输入区右侧注册「畅跑」按钮与**纯展示**状态徽标（高峰/谷时/周末）；
		* - **不做**冻结/会话动作——冻结按钮由 input-traffic 接管并经 /session-guard/rpc
		*   桥接 host 会话门；本插件客户端不注册任何按钮，避免与 input-traffic 冲突。
		*
		* 兼容性注记（0.1.7 line）：`settingsScope` 客户端服务在 dsh 0.1.7 起不再提供，
		* 若把它写进静态 `inject`，客户端条目会永远 pending（waiting for service:
		* settingsScope）并让应用 **web boot 致命失败**。上游 compat/0.1.7 线因此整体去掉了
		* 设置卡片（`inject = ['slots','locale']`）。这里跟随同一条口径：设置面由
		* `config/session-guard.json` 承担，客户端不再依赖 settings 服务。
		*
		* 构建：tsdown → lib/client.js（__ModuleLoader__.load 注册，与 input-traffic 同构）。
		*/
		/** 客户端所需服务：slots（按钮 + 状态徽标）+ locale。 */
		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
				name: "conversation.input.right",
				id: "session-guard-free-run",
				order: 20,
				locale: "session-guard"
			}, FreeRunButton));
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