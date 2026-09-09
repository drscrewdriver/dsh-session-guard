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
.sgRowText-wide{padding-right:0}
.sgTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}
.sgDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}
.sgSwitch{position:relative;width:40px;height:22px;flex:none}
.sgSwitch>input{position:absolute;inset:0;width:100%;height:100%;opacity:0;margin:0;cursor:pointer}
.sgSwitch>input:disabled{cursor:not-allowed}
.sgSwitchTrack{position:absolute;inset:0;border-radius:22px;background:var(--dsw-alias-interactive-bg-hover);transition:background .16s}
.sgSwitch>input:checked+.sgSwitchTrack{background:var(--dsw-alias-button-primary-fill)}
.sgSwitchThumb{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .16s}
.sgSwitch>input:checked~.sgSwitchThumb{transform:translateX(18px)}
.sgInput{appearance:none;min-width:0;width:100%;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 10px;margin-top:8px}
.sgInput:disabled{opacity:.6;cursor:not-allowed}
.sgSelect{appearance:none;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 10px;min-width:160px;flex:none}
.sgSelect:disabled{opacity:.6;cursor:not-allowed}
.sgHint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:6px 0 0}
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
		/** 一行文本输入（失焦提交；外部值变化时同步草稿）。 */
		function TextRow(props) {
			const { label, description, value, placeholder, disabled, onCommit } = props;
			const [draft, setDraft] = (0, react.useState)(value);
			(0, react.useEffect)(() => {
				setDraft(value);
			}, [value]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "sgRow",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "sgRowText sgRowText-wide",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "sgTitle",
							children: label
						}),
						description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "sgDesc",
							children: description
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "sgInput",
							type: "text",
							value: draft,
							placeholder,
							disabled,
							onChange: (e) => setDraft(e.currentTarget.value),
							onBlur: () => onCommit(draft)
						})
					]
				})
			});
		}
		/** 一行「逗号/换行分隔」的字符串列表（失焦提交为数组）。 */
		function ListRow(props) {
			const { label, description, values, placeholder, disabled, onCommit } = props;
			const joined = values.join(", ");
			const [draft, setDraft] = (0, react.useState)(joined);
			(0, react.useEffect)(() => {
				setDraft(joined);
			}, [joined]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "sgRow",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "sgRowText sgRowText-wide",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "sgTitle",
							children: label
						}),
						description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "sgDesc",
							children: description
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "sgInput",
							type: "text",
							value: draft,
							placeholder,
							disabled,
							onChange: (e) => setDraft(e.currentTarget.value),
							onBlur: () => {
								const next = draft.split(/[,\n]/).map((s) => s.trim()).filter((s) => s !== "");
								onCommit(next);
							}
						})
					]
				})
			});
		}
		/** 一行下拉选择。 */
		function SelectRow(props) {
			const { label, description, value, options, disabled, onChange } = props;
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
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
					className: "sgSelect",
					value,
					disabled,
					onChange: (e) => onChange(e.currentTarget.value),
					children: options.map((o) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
						value: o.value,
						children: o.label
					}, o.value))
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
							label: "高峰自动暂停冻结会话",
							description: "高峰时段自动暂停运行会话",
							checked: value.enabled ?? true,
							disabled: readonly,
							onChange: (next) => toggle("enabled", next)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
							label: "step 级门控",
							description: "高峰在下一个 step 的模型请求前拉门（省 token 更彻底）；关闭则回退为回合级暂停",
							checked: value.stepLevelPause ?? true,
							disabled: readonly,
							onChange: (next) => toggle("stepLevelPause", next)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextRow, {
							label: "step 门控超时（毫秒）",
							description: "到期释放 step 门并升级为回合级暂停（防死锁）；0 或非法值用默认 300000",
							value: String(value.stepGateTimeoutMs ?? 3e5),
							placeholder: "300000",
							disabled: readonly,
							onCommit: (next) => {
								const n = Number(String(next).trim());
								scope.set("stepGateTimeoutMs", Number.isFinite(n) && n > 0 ? n : 3e5);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
							label: "官方源二维判定",
							description: "高峰期只拦 DeepSeek 官方源；本地/第三方 provider 照常跑",
							checked: value.providerGuard ?? true,
							disabled: readonly,
							onChange: (next) => toggle("providerGuard", next)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ListRow, {
							label: "追加官方 provider id",
							description: "精确匹配，优先级最高（逗号分隔）",
							values: value.officialProviders ?? [],
							placeholder: "deepseek-official",
							disabled: readonly,
							onCommit: (next) => {
								scope.set("officialProviders", next);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ListRow, {
							label: "官方端点名单",
							description: "baseURL 归一化后的 host（逗号分隔）",
							values: value.officialBaseURLs ?? [],
							placeholder: "api.deepseek.com",
							disabled: readonly,
							onCommit: (next) => {
								scope.set("officialBaseURLs", next);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectRow, {
							label: "拦截方式",
							description: "挂起等待不报错；或报错并记入延后队列",
							value: value.deferredMode ?? "hold",
							options: [{
								value: "hold",
								label: "挂起等待（退峰自动放行）"
							}, {
								value: "error",
								label: "报错并延后（退峰续跑）"
							}],
							disabled: readonly,
							onChange: (next) => {
								scope.set("deferredMode", next);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
							label: "退峰自动继续",
							description: "关闭后延后的请求/会话不自动续跑，需手动 /resume",
							checked: value.deferredResume ?? true,
							disabled: readonly,
							onChange: (next) => toggle("deferredResume", next)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextRow, {
							label: "退峰续跑文案",
							description: "error 模式退峰时发送的消息内容",
							value: value.deferredResumeText ?? "",
							placeholder: "继续（高峰已过，自动继续）",
							disabled: readonly,
							onCommit: (next) => {
								scope.set("deferredResumeText", next);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
							label: "纳入子代理请求",
							description: "子代理请求同样计费，默认一并拦截",
							checked: value.guardSubagents ?? true,
							disabled: readonly,
							onChange: (next) => toggle("guardSubagents", next)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
							label: "低谷自动恢复",
							description: "低峰时段自动恢复被暂停的会话",
							checked: value.offPeakAutoResume ?? true,
							disabled: readonly,
							onChange: (next) => toggle("offPeakAutoResume", next)
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
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "sgHint",
							children: "判定口径：显式 id 名单 → baseURL 端点 → catalog 默认端点 → 内置 id。 排查误判访问 /session-guard/provider?provider=<id> 看 matchedBy。"
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