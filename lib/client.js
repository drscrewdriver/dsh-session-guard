window.__ModuleLoader__.load({
	id: "dsh-session-guard",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/status-badge.tsx
		/**
		* dsh-session-guard — 状态徽标（纯展示，fail-open）。
		*
		* 轮询 host 的 /session-guard/status（全局当前阶段），显示 高峰/谷时/周末。
		* 仅展示，不做任何队列/会话动作；冻结按钮由 input-traffic 经桥接管（D6/D8）。
		*/
		const LABELS = {
			peak: "高峰",
			"off-peak": "谷时",
			weekend: "周末"
		};
		const POLL_MS = 15e3;
		/** 状态徽标：轮询全局阶段，显示 高峰/谷时/周末（enabled 关闭或请求失败时静默隐藏）。 */
		function StatusBadge({ sessionId }) {
			const [status, setStatus] = (0, react.useState)(null);
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
				const timer = setInterval(poll, POLL_MS);
				return () => {
					cancelled = true;
					clearInterval(timer);
				};
			}, [sessionId]);
			if (!status || !status.enabled) return null;
			const cls = status.phase === "peak" ? "sg-peak" : status.phase === "weekend" ? "sg-weekend" : "sg-off";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: `sg-status ${cls}`,
				title: `${LABELS[status.phase]} · ${status.timezone}${status.weekendMode ? " · 周末模式" : ""}`,
				"data-sg-phase": status.phase,
				children: LABELS[status.phase]
			});
		}
		//#endregion
		//#region src/client/settings-card.tsx
		/**
		* dsh-session-guard — 插件配置卡片（settings.plugin.item 面）。
		*
		* 对齐 dsh-thinking-levels / dsh-tidychat 的卡片语法：一个可展开的 `<li>`，
		* header 按钮（插件名 + 描述 + chevron）切换字段体；开关为 pill switch
		* （track + thumb），不是复选框对勾。
		*
		* 通过 `settingsScope.bind({ namespace: NS })` 绑定 host 已注册的
		* `session-guard` 命名空间；每次变更立即经 scope 提交（无 staged form）。
		* 仅依赖 react；CSS 经 `<style data-plugin-css>` 注入一次，控件为原生 HTML，
		* 客户端 bundle 无 value-import @deepseek-ai/* 平台包（类型导入被构建擦除）。
		*/
		/** 卡片样式，注入一次（保持 bundle CSS-free）。 */
		const CARD_CSS = `
.sgCard{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}
.sgCard:hover{border-color:var(--dsw-alias-label-dimmed)}
.sgCard-open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
.sgCardHeader{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:transparent;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}
.sgCardHeadtext{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}
.sgCardName{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}
.sgCardDesc{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
.sgCardChevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}
.sgCardChevron-open{transform:rotate(180deg)}
.sgCardBody{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:4px 0 12px}
.sgRow{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}
.sgRow:last-child{border-bottom:0}
.sgRowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}
.sgTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}
.sgDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}
.sgSwitch{position:relative;width:40px;height:22px;flex:none}
.sgSwitch>input{position:absolute;inset:0;width:100%;height:100%;opacity:0;margin:0;cursor:pointer}
.sgSwitch>input:disabled{cursor:not-allowed}
.sgSwitchTrack{position:absolute;inset:0;border-radius:22px;background:var(--dsw-alias-interactive-bg-hover);transition:background .16s}
.sgSwitch>input:checked+.sgSwitchTrack{background:var(--dsw-alias-button-primary-fill)}
.sgSwitchThumb{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--dsw-alias-bg-base);box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .16s}
.sgSwitch>input:checked~.sgSwitchThumb{transform:translateX(18px)}
.sgReadonly{color:var(--dsw-alias-label-tertiary);font-size:12px;margin:8px 0 0}
`;
		/** 注入一次卡片样式。 */
		function injectCss() {
			if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"session-guard-card\"]") === null) {
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-session-guard";
				tag.dataset.pluginCss = "session-guard-card";
				tag.textContent = CARD_CSS;
				document.head.appendChild(tag);
			}
		}
		/** 一行 pill switch（滑块开关，绑定 scope）。 */
		function SwitchRow(props) {
			const { label, description, checked, disabled, onChange } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "sgRow",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "sgRowText",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "sgTitle",
						children: label
					}), description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "sgDesc",
						children: description
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
					className: "sgSwitch",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked,
							disabled,
							onChange: (e) => onChange(e.currentTarget.checked)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "sgSwitchTrack" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "sgSwitchThumb" })
					]
				})]
			});
		}
		/** 插件配置卡片主体：可展开的 <li> + header 按钮 + pill switch 字段体。 */
		function SessionGuardCard({ scope }) {
			const snapshot = (0, react.useSyncExternalStore)((listener) => scope.subscribe(listener), () => scope.getSnapshot());
			const unavailable = snapshot.status === "unavailable";
			const readonly = unavailable || !snapshot.writable;
			const value = snapshot.value ?? {};
			const [open, setOpen] = (0, react.useState)(false);
			injectCss();
			const toggle = (field, next) => {
				scope.set(field, next);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: "sgCard" + (open ? " sgCard-open" : ""),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "sgCardHeader",
					"aria-expanded": open,
					onClick: () => setOpen(!open),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "sgCardHeadtext",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "sgCardName",
							children: "会话守护门禁"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "sgCardDesc",
							children: "高峰自动暂停运行会话，周末模式无视峰谷畅快跑"
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
						className: "sgCardChevron" + (open ? " sgCardChevron-open" : ""),
						viewBox: "0 0 14 14",
						width: 14,
						height: 14,
						fill: "none",
						"aria-hidden": "true",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
							d: "M3.5 5.5L7 9l3.5-3.5",
							stroke: "currentColor",
							strokeWidth: 1.5,
							strokeLinecap: "round",
							strokeLinejoin: "round"
						})
					})]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "sgCardBody",
					children: unavailable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: {
							margin: "0",
							padding: "12px 0",
							fontSize: "13px",
							color: "var(--dsw-alias-label-tertiary)"
						},
						children: "设置命名空间不可用：请确认 dsh-session-guard 已装配进此 profile。"
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
							label: "高峰自动处理",
							description: "高峰时段自动暂停运行会话",
							checked: value.enabled ?? true,
							disabled: readonly,
							onChange: (next) => toggle("enabled", next)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
							label: "周末模式",
							description: "识别周末，无视峰谷畅快跑",
							checked: value.weekendMode ?? true,
							disabled: readonly,
							onChange: (next) => toggle("weekendMode", next)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
							label: "回退锁队列",
							description: "无会话门时锁等待队列",
							checked: value.queueFallback ?? true,
							disabled: readonly,
							onChange: (next) => toggle("queueFallback", next)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
							label: "自动重试",
							description: "后端重试，默认关（保守）",
							checked: value.retryEnabled ?? false,
							disabled: readonly,
							onChange: (next) => toggle("retryEnabled", next)
						}),
						!snapshot.writable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "sgReadonly",
							children: "当前只读，无法修改。"
						})
					] })
				})]
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
		* - 注册 `settings.plugin.item` 设置卡片，经 `settingsScope.bind({ namespace })`
		*   绑定 host 已注册的 `session-guard` 命名空间——这正是“插件配置”面板显示本
		*   插件的**必要**机制（对齐 dsh-thinking-levels / dsh-context）；
		* - **不做**冻结/会话动作——冻结按钮由 input-traffic 接管并经 /session-guard/rpc
		*   桥接 host 会话门；本插件客户端不注册任何按钮，避免与 input-traffic 冲突。
		*
		* 构建：tsdown → lib/client.js（__ModuleLoader__.load 注册，与 input-traffic 同构）。
		*/
		/** 客户端所需服务：slots（状态徽标 + 设置卡片）+ locale + settingsScope（设置卡片绑定）。 */
		const inject = [
			"slots",
			"locale",
			"settingsScope"
		];
		/** host 侧 src/settings.js 注册的命名空间（保持一致）。 */
		const NS = "session-guard";
		function apply(ctx) {
			ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
				name: "conversation.input.right",
				id: "session-guard-status",
				order: 50,
				locale: "session-guard"
			}, StatusBadge));
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				id: NS,
				key: NS,
				locale: "session-guard",
				inject: () => ({ scope: ctx.settingsScope.bind({ namespace: NS }) })
			}, SessionGuardCard));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map