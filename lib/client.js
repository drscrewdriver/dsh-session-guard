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
		* 对齐 dsh-thinking-levels / dsh-context 的设置面板机制：
		* 通过 `settingsScope.bind({ namespace: NS })` 绑定 host 已注册的
		* `session-guard` 命名空间，渲染 高峰自动处理 / 周末模式 等简单开关。
		* 每次变更立即经 scope 提交（无 staged form），host 的 readCfg 每次读取即生效。
		*
		* 仅依赖 react；scope 用 useSyncExternalStore 订阅，控件为原生 HTML，
		* 客户端 bundle 无需 CSS 模块、无需 value-import 任何 @deepseek-ai/* 平台包
		* （类型导入被构建擦除，运行态只经 cordis 服务协作）。
		*/
		const rowStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: "12px",
			padding: "6px 0",
			fontSize: "13px",
			lineHeight: "20px"
		};
		const labelStyle = {
			margin: 0,
			color: "var(--dsw-alias-label-primary)"
		};
		/** 一个布尔开关行，绑定 scope。 */
		function ToggleRow(props) {
			const { id, label, hint, checked, disabled, onChange } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: rowStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
					htmlFor: id,
					style: labelStyle,
					children: [label, hint ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							marginLeft: "8px",
							fontSize: "12px",
							color: "var(--dsw-alias-label-tertiary)"
						},
						children: hint
					}) : null]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					id,
					type: "checkbox",
					checked,
					disabled,
					onChange: (e) => onChange(e.currentTarget.checked)
				})]
			});
		}
		/** 插件配置卡片主体。 */
		function SessionGuardCard({ scope }) {
			const snapshot = (0, react.useSyncExternalStore)((listener) => scope.subscribe(listener), () => scope.getSnapshot());
			const unavailable = snapshot.status === "unavailable";
			const readonly = unavailable || !snapshot.writable;
			const value = snapshot.value ?? {};
			if (unavailable) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					padding: "12px 16px",
					fontSize: "13px",
					color: "var(--dsw-alias-label-tertiary)"
				},
				children: "设置命名空间不可用：请确认 dsh-session-guard 已装配进此 profile。"
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: { padding: "12px 16px" },
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
						id: "plugin-config-session-guard-enabled",
						label: "高峰自动处理",
						hint: "高峰时段自动暂停运行会话",
						checked: value.enabled ?? true,
						disabled: readonly,
						onChange: (next) => {
							scope.set("enabled", next);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
						id: "plugin-config-session-guard-weekend",
						label: "周末模式",
						hint: "识别周末，无视峰谷畅快跑",
						checked: value.weekendMode ?? true,
						disabled: readonly,
						onChange: (next) => {
							scope.set("weekendMode", next);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
						id: "plugin-config-session-guard-resume-weekend",
						label: "周末自动恢复",
						hint: "周末到了自动恢复运行",
						checked: value.resumeOnWeekend ?? true,
						disabled: readonly,
						onChange: (next) => {
							scope.set("resumeOnWeekend", next);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
						id: "plugin-config-session-guard-queue-fallback",
						label: "回退锁队列",
						hint: "无会话门时锁等待队列",
						checked: value.queueFallback ?? true,
						disabled: readonly,
						onChange: (next) => {
							scope.set("queueFallback", next);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
						id: "plugin-config-session-guard-retry",
						label: "自动重试",
						hint: "后端重试，默认关（保守）",
						checked: value.retryEnabled ?? false,
						disabled: readonly,
						onChange: (next) => {
							scope.set("retryEnabled", next);
						}
					}),
					!snapshot.writable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: {
							margin: "8px 0 0",
							fontSize: "12px",
							color: "var(--dsw-alias-label-tertiary)"
						},
						children: "当前只读，无法修改。"
					})
				]
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