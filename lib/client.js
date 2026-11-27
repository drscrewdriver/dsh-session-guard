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
		*
		* 自适应退避（universal-rc）：视口宽度不足（< PEAK_BADGE_MIN_VIEWPORT，窄窗/
		* 分屏）或新空会话（sessionId 未落盘为 undefined）→ 整体退避隐藏。
		*/
		const POLL_MS$1 = 15e3;
		/** 视口宽度退避阈值：低于此值隐藏徽标（窄窗/分屏下输入区放不下）。 */
		const PEAK_BADGE_MIN_VIEWPORT = 960;
		/** 状态徽标：轮询全局阶段，显示 高峰/谷时/周末（enabled 关闭或请求失败时静默隐藏）。 */
		function StatusBadge({ sessionId }) {
			const [status, setStatus] = (0, react.useState)(null);
			const [viewportNarrow, setViewportNarrow] = (0, react.useState)(() => typeof window !== "undefined" && window.innerWidth < PEAK_BADGE_MIN_VIEWPORT);
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
			(0, react.useEffect)(() => {
				const onResize = () => setViewportNarrow(window.innerWidth < PEAK_BADGE_MIN_VIEWPORT);
				window.addEventListener("resize", onResize);
				return () => window.removeEventListener("resize", onResize);
			}, []);
			if (viewportNarrow) return null;
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
			const requestHeld = b.paused?.request === true || b.requestGate?.held === true || b.state?.requestHeld === true;
			const paused = b.paused?.any === true || b.state?.pausedAny === true || b.paused?.step === true || b.state?.pausedStep === true || requestHeld || manual;
			const raw = b.stepGate?.since ?? b.state?.stepHeldSince ?? b.requestGate?.since ?? b.state?.requestHeldSince ?? null;
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
		//#region src/client/locales.ts
		/** `session-guard` client dictionaries (zh / en / ja / ko / fr / de / it / ru / es / pt). */
		/** Dictionary namespace owned by this plugin. */
		const NS = "session-guard";
		/** Combined dictionary map — all 10 languages, for one-call registration. */
		const dictionaries = {
			zh: {
				"badge.normal": "正常",
				"badge.paused": "已暂停（峰值）",
				"badge_paused_peak": "峰值暂停中",
				"settings.enabled": "高峰自动暂停",
				"settings.enabled.desc": "高峰时段自动暂停运行中的会话",
				"settings.offPeakAutoResume": "低谷自动恢复",
				"settings.offPeakAutoResume.desc": "低峰时段自动恢复被暂停的会话",
				"settings.weekendMode": "周末模式",
				"settings.weekendMode.desc": "识别周末 → 周末不自动暂停",
				"settings.queueFallback": "回退锁等待队列",
				"settings.queueFallback.desc": "自研会话门不可用时回退锁等待队列（fail-open）",
				"settings.retryEnabled": "自动重试",
				"settings.retryEnabled.desc": "瞬时失败自动续跑（默认关，保守）",
				"settings.retryPauseWhenOffline": "断网暂停重试",
				"settings.retryPauseWhenOffline.desc": "断网时挂起重试，且挂起期间不消耗重试次数（默认关）",
				"settings.timezone": "时区",
				"settings.peakWindows": "高峰时间窗口",
				"settings.providerGuard": "官方源二维判定",
				"settings.providerGuard.desc": "高峰期只拦 DeepSeek 官方源；本地/第三方 provider 照常跑",
				"settings.officialProviders": "追加官方 provider id",
				"settings.officialProviders.desc": "精确匹配，优先级最高（逗号分隔）",
				"settings.officialBaseURLs": "官方端点名单",
				"settings.officialBaseURLs.desc": "baseURL 归一化后的 host（逗号分隔）",
				"settings.deferredMode": "拦截方式",
				"settings.deferredMode.desc": "挂起等待不报错；或报错并记入延后队列",
				"settings.deferredResume": "退峰自动继续",
				"settings.deferredResume.desc": "关闭后延后的请求/会话不自动续跑，需手动 /resume",
				"settings.deferredResumeText": "退峰续跑文案",
				"settings.deferredResumeText.desc": "error 模式退峰时发送的消息内容",
				"settings.guardSubagents": "纳入子代理请求",
				"settings.guardSubagents.desc": "子代理请求同样计费，默认一并拦截",
				"settings.pauseStopsJobs": "暂停时停后台任务",
				"settings.pauseStopsJobs.desc": "暂停会话时一并停止其拥有的 run_in_background 任务（含 stopping）；关闭则后台任务继续跑",
				"settings.pauseStopsChildren": "暂停时停子会话",
				"settings.pauseStopsChildren.desc": "暂停会话时一并中断其子代理/子任务会话（含多层后代）；关闭则子会话继续跑",
				"settings.officialHint": "判定口径：显式 id 名单 → baseURL 端点 → catalog 默认端点 → 内置 id。排查误判访问 /session-guard/provider?provider=<id> 看 matchedBy。",
				"settings.unavailable": "设置不可用：请确认 dsh-session-guard 已装配进 profile。",
				"status.normal": "正常运行",
				"status.paused_peak": "峰值暂停中",
				"status.peak_official": "高峰·拦官方",
				"status.peak_all": "高峰·全部暂停"
			},
			en: {
				"badge.normal": "Normal",
				"badge.paused": "Paused (peak)",
				"badge_paused_peak": "Peak paused",
				"settings.enabled": "Peak auto-pause",
				"settings.enabled.desc": "Auto-pause running sessions during peak hours",
				"settings.offPeakAutoResume": "Off-peak auto-resume",
				"settings.offPeakAutoResume.desc": "Auto-resume paused sessions during off-peak hours",
				"settings.weekendMode": "Weekend mode",
				"settings.weekendMode.desc": "Detect weekends → no auto-pause on weekends",
				"settings.queueFallback": "Fallback lock-wait queue",
				"settings.queueFallback.desc": "Fallback to lock-wait queue when custom session gate is unavailable (fail-open)",
				"settings.retryEnabled": "Auto-retry",
				"settings.retryEnabled.desc": "Transient failure auto-resume (off by default, conservative)",
				"settings.retryPauseWhenOffline": "Pause retry when offline",
				"settings.retryPauseWhenOffline.desc": "Hold retries while offline; holds never consume the retry budget (off by default)",
				"settings.timezone": "Timezone",
				"settings.peakWindows": "Peak time windows",
				"settings.providerGuard": "Official-source guard",
				"settings.providerGuard.desc": "During peak hours only DeepSeek official sources are blocked; local/third-party providers keep running",
				"settings.officialProviders": "Extra official provider ids",
				"settings.officialProviders.desc": "Exact match, highest priority (comma separated)",
				"settings.officialBaseURLs": "Official endpoint hosts",
				"settings.officialBaseURLs.desc": "Hosts after baseURL normalization (comma separated)",
				"settings.deferredMode": "Interception mode",
				"settings.deferredMode.desc": "Hold without error, or fail and queue as deferred",
				"settings.deferredResume": "Auto-resume after peak",
				"settings.deferredResume.desc": "When off, deferred requests/sessions stay parked until a manual /resume",
				"settings.deferredResumeText": "Resume message",
				"settings.deferredResumeText.desc": "Text sent when an error-mode session resumes off-peak",
				"settings.guardSubagents": "Guard subagent requests",
				"settings.guardSubagents.desc": "Subagent requests are billed too; guarded by default",
				"settings.pauseStopsJobs": "Pause stops background jobs",
				"settings.pauseStopsJobs.desc": "On pause, also stop this session run_in_background jobs (incl. stopping); off = they keep running",
				"settings.pauseStopsChildren": "Pause stops child sessions",
				"settings.pauseStopsChildren.desc": "On pause, also interrupt this session subagent/subtask sessions (incl. deep descendants); off = they keep running",
				"settings.officialHint": "Decision order: explicit id list → baseURL endpoint → catalog default endpoint → builtin id. For a wrong verdict open /session-guard/provider?provider=<id> and read matchedBy.",
				"settings.unavailable": "Settings unavailable: make sure dsh-session-guard is assembled into this profile.",
				"status.normal": "Running normally",
				"status.paused_peak": "Peak paused",
				"status.peak_official": "Peak · official only",
				"status.peak_all": "Peak · all paused"
			},
			ja: {
				"badge.normal": "通常",
				"badge.paused": "一時停止（ピーク）",
				"badge_paused_peak": "ピーク一時停止中",
				"settings.enabled": "ピーク自動一時停止",
				"settings.enabled.desc": "ピーク時間帯に実行中セッションを自動一時停止",
				"settings.offPeakAutoResume": "オフピーク自動再開",
				"settings.offPeakAutoResume.desc": "オフピーク時に一時停止セッションを自動再開",
				"settings.weekendMode": "週末モード",
				"settings.weekendMode.desc": "週末を認識→週末は自動一時停止しない",
				"settings.queueFallback": "フォールバックロック待機キュー",
				"settings.queueFallback.desc": "カスタムセッションゲート利用不可時にロック待機キューにフォールバック（fail-open）",
				"settings.retryEnabled": "自動リトライ",
				"settings.retryEnabled.desc": "瞬時失敗自動再試行（デフォルトオフ、保守的）",
				"settings.retryPauseWhenOffline": "オフライン時にリトライを一時停止",
				"settings.retryPauseWhenOffline.desc": "オフライン時はリトライを保留し、保留中はリトライ回数を消費しません（デフォルトオフ）",
				"settings.timezone": "タイムゾーン",
				"settings.peakWindows": "ピーク時間ウィンドウ",
				"settings.providerGuard": "公式ソース二次判定",
				"settings.providerGuard.desc": "ピーク時は DeepSeek 公式ソースのみ停止。ローカル/第三者 provider は通常どおり実行",
				"settings.officialProviders": "公式 provider id を追加",
				"settings.officialProviders.desc": "完全一致、最優先（カンマ区切り）",
				"settings.officialBaseURLs": "公式エンドポイント host",
				"settings.officialBaseURLs.desc": "baseURL 正規化後の host（カンマ区切り）",
				"settings.deferredMode": "遮断方式",
				"settings.deferredMode.desc": "エラーなしで保留、またはエラーにして延後キューへ",
				"settings.deferredResume": "ピーク後の自動再開",
				"settings.deferredResume.desc": "オフにすると延後したリクエスト/セッションは手動 /resume まで停止",
				"settings.deferredResumeText": "再開メッセージ",
				"settings.deferredResumeText.desc": "error モードでピーク後に送るテキスト",
				"settings.guardSubagents": "サブエージェントも対象",
				"settings.guardSubagents.desc": "サブエージェントのリクエストも課金対象。既定で遮断",
				"settings.pauseStopsJobs": "一時停止でバックグラウンドジョブを停止",
				"settings.pauseStopsJobs.desc": "セッション一時停止時に所有の run_in_background ジョブ（stopping 含む）も停止。オフなら走り続けます",
				"settings.pauseStopsChildren": "一時停止で子セッションを停止",
				"settings.pauseStopsChildren.desc": "一時停止時に子エージェント/子タスクセッション（多層の子孫含む）も中断。オフなら走り続けます",
				"settings.officialHint": "判定順：明示 id リスト → baseURL エンドポイント → catalog 既定エンドポイント → 内蔵 id。誤判定は /session-guard/provider?provider=<id> の matchedBy を確認。",
				"settings.unavailable": "設定利用不可：dsh-session-guard が profile に組み込まれているか確認してください。",
				"status.normal": "通常実行中",
				"status.paused_peak": "ピーク一時停止中",
				"status.peak_official": "ピーク・公式のみ",
				"status.peak_all": "ピーク・全停止"
			},
			ko: {
				"badge.normal": "정상",
				"badge.paused": "일시정지(피크)",
				"badge_paused_peak": "피크 일시정지 중",
				"settings.enabled": "피크 자동 일시정지",
				"settings.enabled.desc": "피크 시간대에 실행 중인 세션을 자동 일시정지",
				"settings.offPeakAutoResume": "오피크 자동 재개",
				"settings.offPeakAutoResume.desc": "오피크 시간대에 일시정지된 세션을 자동 재개",
				"settings.weekendMode": "주말 모드",
				"settings.weekendMode.desc": "주말 감지 → 주말에는 자동 일시정지 안 함",
				"settings.queueFallback": "폴백 잠금 대기 큐",
				"settings.queueFallback.desc": "커스텀 세션 게이트 사용 불가 시 잠금 대기 큐로 폴백(fail-open)",
				"settings.retryEnabled": "자동 재시도",
				"settings.retryEnabled.desc": "일시적 실패 자동 재개(기본값 꺼짐, 보수적)",
				"settings.retryPauseWhenOffline": "오프라인 시 재시도 일시중지",
				"settings.retryPauseWhenOffline.desc": "오프라인이면 재시도를 보류하며 보류 중 재시도 횟수를 소모하지 않습니다(기본값 꺼짐)",
				"settings.timezone": "타임존",
				"settings.peakWindows": "피크 시간대",
				"settings.providerGuard": "공식 소스 2차 판정",
				"settings.providerGuard.desc": "피크 시간에는 DeepSeek 공식 소스만 차단, 로컬/서드파티 provider는 정상 실행",
				"settings.officialProviders": "공식 provider id 추가",
				"settings.officialProviders.desc": "정확히 일치, 최우선(쉼표 구분)",
				"settings.officialBaseURLs": "공식 엔드포인트 host",
				"settings.officialBaseURLs.desc": "baseURL 정규화 후 host(쉼표 구분)",
				"settings.deferredMode": "차단 방식",
				"settings.deferredMode.desc": "오류 없이 보류, 또는 오류로 연기 후 큐에 기록",
				"settings.deferredResume": "피크 후 자동 재개",
				"settings.deferredResume.desc": "끄면 보류된 요청/세션은 수동 /resume 전까지 멈춤",
				"settings.deferredResumeText": "재개 메시지",
				"settings.deferredResumeText.desc": "error 모드에서 피크 후 보내는 텍스트",
				"settings.guardSubagents": "서브에이전트 포함",
				"settings.guardSubagents.desc": "서브에이전트 요청도 과금 대상, 기본 포함",
				"settings.pauseStopsJobs": "일시중지 시 백그라운드 작업 중지",
				"settings.pauseStopsJobs.desc": "세션 일시중지 시 소유한 run_in_background 작업(stopping 포함)도 중지. 끄면 계속 실행",
				"settings.pauseStopsChildren": "일시중지 시 하위 세션 중지",
				"settings.pauseStopsChildren.desc": "일시중지 시 하위 에이전트/작업 세션(다층 후손 포함)도 중단. 끄면 계속 실행",
				"settings.officialHint": "판정 순서: 명시 id 목록 → baseURL 엔드포인트 → catalog 기본 엔드포인트 → 내장 id. 오판정은 /session-guard/provider?provider=<id> 의 matchedBy 확인.",
				"settings.unavailable": "설정 사용 불가: dsh-session-guard가 이 profile에 조립되었는지 확인하세요.",
				"status.normal": "정상 실행 중",
				"status.paused_peak": "피크 일시정지 중",
				"status.peak_official": "피크·공식만",
				"status.peak_all": "피크·전체 정지"
			},
			fr: {
				"badge.normal": "Normal",
				"badge.paused": "En pause (pic)",
				"badge_paused_peak": "Pause pic en cours",
				"settings.enabled": "Pause auto en période de pic",
				"settings.enabled.desc": "Mettre automatiquement en pause les sessions actives pendant les heures de pic",
				"settings.offPeakAutoResume": "Reprise auto hors pic",
				"settings.offPeakAutoResume.desc": "Reprendre automatiquement les sessions en pause pendant les heures creuses",
				"settings.weekendMode": "Mode week-end",
				"settings.weekendMode.desc": "Détecter les week-ends → pas de pause auto le week-end",
				"settings.queueFallback": "File d’attente de secours",
				"settings.queueFallback.desc": "Repli sur la file d’attente verrouillée quand la passerelle personnalisée est indisponible (fail-open)",
				"settings.retryEnabled": "Nouvelle tentative auto",
				"settings.retryEnabled.desc": "Reprise auto après échec transitoire (désactivé par défaut, conservateur)",
				"settings.retryPauseWhenOffline": "Suspendre la reprise hors ligne",
				"settings.retryPauseWhenOffline.desc": "Retient les reprises hors ligne ; les suspensions ne consomment pas le budget de réessai (désactivé par défaut)",
				"settings.timezone": "Fuseau horaire",
				"settings.peakWindows": "Plages horaires de pic",
				"settings.providerGuard": "Garde source officielle",
				"settings.providerGuard.desc": "En période de pic, seules les sources officielles DeepSeek sont bloquées ; les fournisseurs locaux/tiers continuent",
				"settings.officialProviders": "IDs de fournisseur officiels supplémentaires",
				"settings.officialProviders.desc": "Correspondance exacte, priorité maximale (séparés par des virgules)",
				"settings.officialBaseURLs": "Hôtes des points de terminaison officiels",
				"settings.officialBaseURLs.desc": "Hôtes après normalisation de la baseURL (séparés par des virgules)",
				"settings.deferredMode": "Mode d’interception",
				"settings.deferredMode.desc": "Suspendre sans erreur, ou générer une erreur et mettre en file différée",
				"settings.deferredResume": "Reprise auto après le pic",
				"settings.deferredResume.desc": "Si désactivé, les requêtes/sessions différées restent en attente jusqu’à un /resume manuel",
				"settings.deferredResumeText": "Message de reprise",
				"settings.deferredResumeText.desc": "Texte envoyé lorsqu’une session en mode erreur reprend hors pic",
				"settings.guardSubagents": "Inclure les sous-agents",
				"settings.guardSubagents.desc": "Les requêtes des sous-agents sont aussi facturées ; gardées par défaut",
				"settings.pauseStopsJobs": "Suspendre les tâches d arrière-plan",
				"settings.pauseStopsJobs.desc": "À la suspension, arrêter aussi les jobs run_in_background de la session (y c. stopping) ; désactivé = ils continuent",
				"settings.pauseStopsChildren": "Suspendre les sessions enfants",
				"settings.pauseStopsChildren.desc": "À la suspension, interrompre aussi les sessions sous-agentes (descendants inclus) ; désactivé = elles continuent",
				"settings.officialHint": "Ordre de décision : liste d’ids explicites → point de terminaison baseURL → point de terminaison par défaut du catalogue → id intégré. Pour un verdict erroné, ouvrez /session-guard/provider?provider=<id> et consultez matchedBy.",
				"settings.unavailable": "Paramètres indisponibles : assurez-vous que dsh-session-guard est assemblé dans ce profil.",
				"status.normal": "Fonctionnement normal",
				"status.paused_peak": "Pause pic en cours",
				"status.peak_official": "Pic · officiel uniquement",
				"status.peak_all": "Pic · tout en pause"
			},
			de: {
				"badge.normal": "Normal",
				"badge.paused": "Pausiert (Spitzenzeit)",
				"badge_paused_peak": "Spitzenzeit-Pause aktiv",
				"settings.enabled": "Auto-Pause zur Spitzenzeit",
				"settings.enabled.desc": "Laufende Sitzungen während der Spitzenzeiten automatisch pausieren",
				"settings.offPeakAutoResume": "Auto-Fortsetzung außerhalb der Spitzenzeit",
				"settings.offPeakAutoResume.desc": "Pausierte Sitzungen außerhalb der Spitzenzeiten automatisch fortsetzen",
				"settings.weekendMode": "Wochenendmodus",
				"settings.weekendMode.desc": "Wochenenden erkennen → keine Auto-Pause am Wochenende",
				"settings.queueFallback": "Fallback-Warteschlange",
				"settings.queueFallback.desc": "Auf Sperr-Warteschlange zurückgreifen, wenn eigenes Sitzungs-Gate nicht verfügbar ist (fail-open)",
				"settings.retryEnabled": "Automatischer Wiederholungsversuch",
				"settings.retryEnabled.desc": "Automatische Fortsetzung nach kurzzeitigem Fehler (standardmäßig aus, konservativ)",
				"settings.retryPauseWhenOffline": "Wiederholung offline pausieren",
				"settings.retryPauseWhenOffline.desc": "Versuche bei Offline halten; Wartungen verbrauchen kein Wiederholungsbudget (standardmäßig aus)",
				"settings.timezone": "Zeitzone",
				"settings.peakWindows": "Spitzenzeitfenster",
				"settings.providerGuard": "Offizielle-Quellen-Prüfung",
				"settings.providerGuard.desc": "Zur Spitzenzeit nur DeepSeek-offizielle Quellen blockieren; lokale/Dritt-Anbieter laufen weiter",
				"settings.officialProviders": "Zusätzliche offizielle Provider-IDs",
				"settings.officialProviders.desc": "Exakte Übereinstimmung, höchste Priorität (kommagetrennt)",
				"settings.officialBaseURLs": "Offizielle Endpunkt-Hosts",
				"settings.officialBaseURLs.desc": "Hosts nach baseURL-Normalisierung (kommagetrennt)",
				"settings.deferredMode": "Abfangmodus",
				"settings.deferredMode.desc": "Ohne Fehler anhalten oder Fehler erzeugen und in Warteschlange stellen",
				"settings.deferredResume": "Auto-Fortsetzung nach Spitzenzeit",
				"settings.deferredResume.desc": "Wenn aus, bleiben zurückgestellte Anfragen/Sitzungen bis zum manuellen /resume geparkt",
				"settings.deferredResumeText": "Fortsetzungsnachricht",
				"settings.deferredResumeText.desc": "Text, der gesendet wird, wenn eine Sitzung im Fehlermodus nach der Spitzenzeit fortgesetzt wird",
				"settings.guardSubagents": "Unteragenten einbeziehen",
				"settings.guardSubagents.desc": "Anfragen von Unteragenten werden ebenfalls abgerechnet; standardmäßig überwacht",
				"settings.pauseStopsJobs": "Pausiert Hintergrund-Jobs",
				"settings.pauseStopsJobs.desc": "Beim Pausieren auch run_in_background-Jobs der Session stoppen (inkl. stopping); aus = sie laufen weiter",
				"settings.pauseStopsChildren": "Pausiert Kind-Sessions",
				"settings.pauseStopsChildren.desc": "Beim Pausieren auch Subagent-/Unteraufgaben-Sessions (inkl. tiefer Nachkommen) unterbrechen; aus = sie laufen weiter",
				"settings.officialHint": "Entscheidungsreihenfolge: explizite ID-Liste → baseURL-Endpunkt → Katalog-Standardendpunkt → eingebaute ID. Bei Fehlentscheidung /session-guard/provider?provider=<id> öffnen und matchedBy prüfen.",
				"settings.unavailable": "Einstellungen nicht verfügbar: Stellen Sie sicher, dass dsh-session-guard in diesem Profil eingebunden ist.",
				"status.normal": "Normaler Betrieb",
				"status.paused_peak": "Spitzenzeit-Pause aktiv",
				"status.peak_official": "Spitzenzeit · nur offizielle",
				"status.peak_all": "Spitzenzeit · alle pausiert"
			},
			it: {
				"badge.normal": "Normale",
				"badge.paused": "In pausa (picco)",
				"badge_paused_peak": "Pausa di picco attiva",
				"settings.enabled": "Pausa automatica durante il picco",
				"settings.enabled.desc": "Metti automaticamente in pausa le sessioni attive durante le ore di picco",
				"settings.offPeakAutoResume": "Ripresa automatica fuori picco",
				"settings.offPeakAutoResume.desc": "Riprendi automaticamente le sessioni in pausa durante le ore fuori picco",
				"settings.weekendMode": "Modalità fine settimana",
				"settings.weekendMode.desc": "Rileva i fine settimana → nessuna pausa automatica nel weekend",
				"settings.queueFallback": "Coda di riserva con blocco",
				"settings.queueFallback.desc": "Ripiega sulla coda di attesa bloccata quando il gate di sessione personalizzato non è disponibile (fail-open)",
				"settings.retryEnabled": "Nuovo tentativo automatico",
				"settings.retryEnabled.desc": "Ripresa automatica dopo errore transitorio (disattivato per impostazione predefinita, conservativo)",
				"settings.retryPauseWhenOffline": "Sospendi il tentativo offline",
				"settings.retryPauseWhenOffline.desc": "Trattiene i tentativi offline; le sospensioni non consumano il budget di tentativi (disattivato per impostazione predefinita)",
				"settings.timezone": "Fuso orario",
				"settings.peakWindows": "Finestre temporali di picco",
				"settings.providerGuard": "Guardia sorgente ufficiale",
				"settings.providerGuard.desc": "Durante il picco blocca solo le sorgenti ufficiali DeepSeek; i provider locali/terzi continuano a funzionare",
				"settings.officialProviders": "ID provider ufficiali aggiuntivi",
				"settings.officialProviders.desc": "Corrispondenza esatta, priorità massima (separati da virgola)",
				"settings.officialBaseURLs": "Host degli endpoint ufficiali",
				"settings.officialBaseURLs.desc": "Host dopo la normalizzazione della baseURL (separati da virgola)",
				"settings.deferredMode": "Modalità di intercettazione",
				"settings.deferredMode.desc": "Sospendi senza errore, oppure genera errore e accoda come differito",
				"settings.deferredResume": "Ripresa automatica dopo il picco",
				"settings.deferredResume.desc": "Se disattivato, le richieste/sessioni differite restano in attesa fino a un /resume manuale",
				"settings.deferredResumeText": "Messaggio di ripresa",
				"settings.deferredResumeText.desc": "Testo inviato quando una sessione in modalità errore riprende fuori picco",
				"settings.guardSubagents": "Includi sottoagenti",
				"settings.guardSubagents.desc": "Anche le richieste dei sottoagenti sono fatturate; protette per impostazione predefinita",
				"settings.pauseStopsJobs": "Sospendi i job in background",
				"settings.pauseStopsJobs.desc": "In pausa, ferma anche i job run_in_background della sessione (incl. stopping); disattivo = continuano",
				"settings.pauseStopsChildren": "Sospendi le sessioni figlie",
				"settings.pauseStopsChildren.desc": "In pausa, interrompi anche le sessioni subagente/figlie (discendenti profondi incl.); disattivo = continuano",
				"settings.officialHint": "Ordine di decisione: elenco id espliciti → endpoint baseURL → endpoint predefinito del catalogo → id integrato. Per un verdetto errato apri /session-guard/provider?provider=<id> e controlla matchedBy.",
				"settings.unavailable": "Impostazioni non disponibili: assicurati che dsh-session-guard sia integrato in questo profilo.",
				"status.normal": "Funzionamento normale",
				"status.paused_peak": "Pausa di picco attiva",
				"status.peak_official": "Picco · solo ufficiale",
				"status.peak_all": "Picco · tutto in pausa"
			},
			ru: {
				"badge.normal": "Норма",
				"badge.paused": "Приостановлено (пик)",
				"badge_paused_peak": "Пиковая пауза активна",
				"settings.enabled": "Автопауза в час пик",
				"settings.enabled.desc": "Автоматически приостанавливать активные сессии в часы пиковой нагрузки",
				"settings.offPeakAutoResume": "Автопродолжение вне пика",
				"settings.offPeakAutoResume.desc": "Автоматически возобновлять приостановленные сессии в непиковые часы",
				"settings.weekendMode": "Режим выходных",
				"settings.weekendMode.desc": "Определять выходные → не приостанавливать автоматически в выходные",
				"settings.queueFallback": "Резервная очередь блокировки",
				"settings.queueFallback.desc": "Откат к очереди блокировки, когда собственный гейт сессий недоступен (fail-open)",
				"settings.retryEnabled": "Автоповтор",
				"settings.retryEnabled.desc": "Автоматическое продолжение после временного сбоя (по умолчанию выключено, консервативно)",
				"settings.retryPauseWhenOffline": "Пауза повторов при офлайне",
				"settings.retryPauseWhenOffline.desc": "Удерживать повторы офлайн; удержание не расходует бюджет повторов (по умолчанию выключено)",
				"settings.timezone": "Часовой пояс",
				"settings.peakWindows": "Пиковые временные окна",
				"settings.providerGuard": "Проверка официального источника",
				"settings.providerGuard.desc": "В час пик блокируются только официальные источники DeepSeek; локальные/сторонние провайдеры работают",
				"settings.officialProviders": "Дополнительные ID официальных провайдеров",
				"settings.officialProviders.desc": "Точное совпадение, наивысший приоритет (через запятую)",
				"settings.officialBaseURLs": "Хосты официальных эндпоинтов",
				"settings.officialBaseURLs.desc": "Хосты после нормализации baseURL (через запятую)",
				"settings.deferredMode": "Режим перехвата",
				"settings.deferredMode.desc": "Приостановить без ошибки, или выдать ошибку и поставить в отложенную очередь",
				"settings.deferredResume": "Автопродолжение после пика",
				"settings.deferredResume.desc": "Если выключено, отложенные запросы/сессии ожидают ручного /resume",
				"settings.deferredResumeText": "Сообщение возобновления",
				"settings.deferredResumeText.desc": "Текст, отправляемый при возобновлении сессии в режиме ошибки после пика",
				"settings.guardSubagents": "Включить субагентов",
				"settings.guardSubagents.desc": "Запросы субагентов также тарифицируются; по умолчанию защищаются",
				"settings.pauseStopsJobs": "Останавливать фоновые задачи при паузе",
				"settings.pauseStopsJobs.desc": "При паузе сессии также останавливать её run_in_background-задачи (включая stopping); иначе продолжают",
				"settings.pauseStopsChildren": "Останавливать дочерние сессии при паузе",
				"settings.pauseStopsChildren.desc": "При паузе также прерывать дочерние сессии субагентов (включая глубоких потомков); иначе продолжают",
				"settings.officialHint": "Порядок принятия решения: явный список id → эндпоинт baseURL → эндпоинт по умолчанию из каталога → встроенный id. При ошибочном вердикте откройте /session-guard/provider?provider=<id> и проверьте matchedBy.",
				"settings.unavailable": "Настройки недоступны: убедитесь, что dsh-session-guard подключён к этому профилю.",
				"status.normal": "Штатная работа",
				"status.paused_peak": "Пиковая пауза активна",
				"status.peak_official": "Пик · только официальные",
				"status.peak_all": "Пик · все приостановлены"
			},
			es: {
				"badge.normal": "Normal",
				"badge.paused": "Pausado (pico)",
				"badge_paused_peak": "Pausa por pico activa",
				"settings.enabled": "Pausa automática en hora pico",
				"settings.enabled.desc": "Pausar automáticamente las sesiones activas durante las horas pico",
				"settings.offPeakAutoResume": "Reanudación automática fuera de pico",
				"settings.offPeakAutoResume.desc": "Reanudar automáticamente las sesiones pausadas durante las horas valle",
				"settings.weekendMode": "Modo fin de semana",
				"settings.weekendMode.desc": "Detectar fines de semana → sin pausa automática el fin de semana",
				"settings.queueFallback": "Cola de bloqueo de reserva",
				"settings.queueFallback.desc": "Alternativa a la cola de bloqueo cuando la puerta de sesión personalizada no está disponible (fail-open)",
				"settings.retryEnabled": "Reintento automático",
				"settings.retryEnabled.desc": "Reanudación automática tras fallo transitorio (desactivado por defecto, conservador)",
				"settings.retryPauseWhenOffline": "Pausar reintento sin conexión",
				"settings.retryPauseWhenOffline.desc": "Retiene los reintentos sin conexión; las retenciones no consumen el presupuesto de reintentos (desactivado por defecto)",
				"settings.timezone": "Zona horaria",
				"settings.peakWindows": "Ventanas horarias de pico",
				"settings.providerGuard": "Protección de fuente oficial",
				"settings.providerGuard.desc": "En hora pico solo se bloquean las fuentes oficiales de DeepSeek; los proveedores locales/terceros siguen funcionando",
				"settings.officialProviders": "IDs de proveedor oficiales adicionales",
				"settings.officialProviders.desc": "Coincidencia exacta, prioridad máxima (separados por comas)",
				"settings.officialBaseURLs": "Hosts de endpoints oficiales",
				"settings.officialBaseURLs.desc": "Hosts tras normalización de la baseURL (separados por comas)",
				"settings.deferredMode": "Modo de intercepción",
				"settings.deferredMode.desc": "Suspender sin error, o generar error y encolar como diferido",
				"settings.deferredResume": "Reanudación automática tras el pico",
				"settings.deferredResume.desc": "Si se desactiva, las solicitudes/sesiones diferidas quedan en espera hasta un /resume manual",
				"settings.deferredResumeText": "Mensaje de reanudación",
				"settings.deferredResumeText.desc": "Texto enviado cuando una sesión en modo error se reanuda fuera de pico",
				"settings.guardSubagents": "Incluir subagentes",
				"settings.guardSubagents.desc": "Las solicitudes de subagentes también se facturan; protegidas por defecto",
				"settings.pauseStopsJobs": "Detener tareas en segundo plano al pausar",
				"settings.pauseStopsJobs.desc": "Al pausar, detiene también los jobs run_in_background de la sesión (incl. stopping); desactivado = siguen corriendo",
				"settings.pauseStopsChildren": "Detener sesiones hijas al pausar",
				"settings.pauseStopsChildren.desc": "Al pausar, interrumpe también las sesiones subagente/hijas (descendientes incluidos); desactivado = siguen corriendo",
				"settings.officialHint": "Orden de decisión: lista explícita de ids → endpoint de baseURL → endpoint predeterminado del catálogo → id integrado. Para un veredicto erróneo abra /session-guard/provider?provider=<id> y consulte matchedBy.",
				"settings.unavailable": "Configuración no disponible: asegúrese de que dsh-session-guard esté integrado en este perfil.",
				"status.normal": "Funcionamiento normal",
				"status.paused_peak": "Pausa por pico activa",
				"status.peak_official": "Pico · solo oficial",
				"status.peak_all": "Pico · todo pausado"
			},
			pt: {
				"badge.normal": "Normal",
				"badge.paused": "Pausada (pico)",
				"badge_paused_peak": "Pausa por pico ativa",
				"settings.enabled": "Pausa automática no pico",
				"settings.enabled.desc": "Pausar automaticamente as sessões ativas durante as horas de pico",
				"settings.offPeakAutoResume": "Retomada automática fora do pico",
				"settings.offPeakAutoResume.desc": "Retomar automaticamente as sessões pausadas durante as horas de vale",
				"settings.weekendMode": "Modo fim de semana",
				"settings.weekendMode.desc": "Detectar fins de semana → sem pausa automática no fim de semana",
				"settings.queueFallback": "Fila de espera com lock como reserva",
				"settings.queueFallback.desc": "Recorrer à fila de espera com lock quando a porta de sessão própria não estiver disponível (fail-open)",
				"settings.retryEnabled": "Nova tentativa automática",
				"settings.retryEnabled.desc": "Retomar automaticamente após falhas transitórias (desativado por padrão, conservador)",
				"settings.retryPauseWhenOffline": "Pausar nova tentativa quando off-line",
				"settings.retryPauseWhenOffline.desc": "Retém as tentativas quando off-line; as esperas não consomem o orçamento de tentativas (desativado por padrão)",
				"settings.timezone": "Fuso horário",
				"settings.peakWindows": "Janelas de horário de pico",
				"settings.providerGuard": "Veredito bidimensional de fonte oficial",
				"settings.providerGuard.desc": "No pico, bloquear somente as fontes oficiais do DeepSeek; provedores locais/de terceiros continuam rodando",
				"settings.officialProviders": "IDs de provedor oficiais adicionais",
				"settings.officialProviders.desc": "Correspondência exata, prioridade máxima (separados por vírgula)",
				"settings.officialBaseURLs": "Hosts de endpoints oficiais",
				"settings.officialBaseURLs.desc": "Hosts após a normalização da baseURL (separados por vírgula)",
				"settings.deferredMode": "Modo de interceptação",
				"settings.deferredMode.desc": "Reter sem erro; ou gerar erro e enfileirar como adiado",
				"settings.deferredResume": "Continuação automática após o pico",
				"settings.deferredResume.desc": "Desativado, requisições/sessões adiadas não retomam sozinhas; exigem /resume manual",
				"settings.deferredResumeText": "Mensagem de retomada",
				"settings.deferredResumeText.desc": "Conteúdo da mensagem enviada na retomada pós-pico no modo error",
				"settings.guardSubagents": "Incluir requisições de subagentes",
				"settings.guardSubagents.desc": "Requisições de subagentes também são cobradas; interceptadas por padrão",
				"settings.pauseStopsJobs": "Parar tarefas em segundo plano ao pausar",
				"settings.pauseStopsJobs.desc": "Ao pausar, para também os jobs run_in_background da sessão (incl. stopping); desativado = continuam",
				"settings.pauseStopsChildren": "Parar sessões filhas ao pausar",
				"settings.pauseStopsChildren.desc": "Ao pausar, interrompe também as sessões subagente/filhas (descendentes profundos incl.); desativado = continuam",
				"settings.officialHint": "Cadeia do veredito: lista explícita de ids → endpoint da baseURL → endpoint padrão do catálogo → id embutido. Para investigar um veredito equivocado, abra /session-guard/provider?provider=<id> e veja matchedBy.",
				"settings.unavailable": "Configurações indisponíveis: confirme que o dsh-session-guard foi montado neste profile.",
				"status.normal": "Operação normal",
				"status.paused_peak": "Pausa por pico ativa",
				"status.peak_official": "Pico · só oficiais",
				"status.peak_all": "Pico · todas pausadas"
			}
		};
		//#endregion
		//#region src/client/guide.tsx
		/**
		* ⚠️ 生成副本 —— 请勿手改。真源：mine-dsh-plugins/_tools/guide-kit/guide.tsx
		* 重新同步：node _tools/guide-kit/sync.mjs
		*/
		/**
		* guide-kit —— 九插件共用的「首次使用引导」件（**生成副本，勿手改**）。
		*
		* 唯一真源：`mine-dsh-plugins/_tools/guide-kit/guide.tsx`
		* 同步命令：`node _tools/guide-kit/sync.mjs`（会覆盖本文件；改这里等于白改）
		*
		* 六条契约（见 .agents/plans/unified-i18n-onboarding/spec.md §2）：
		* 1. Skip 恒定可见，任何步骤都能退；
		* 2. 永远有字：引导外壳（标题/按钮/步进）自带 10 语词表，按 <html lang> 取词，
		*    认不出的一律落 en；步骤正文按「本语 → en → zh → 任意可用」逐级回退，绝不留空白；
		* 3. 重启入口：`GuideRestartButton`（或自己调 `resetGuide(ns)` + setOpen(true)）就地重开；
		* 4. 零依赖：只 react + localStorage，不 import 平台包，不抢宿主设置表单；
		* 5. 引导自己绝不能成为卡面渲染的失败点：样式注入与存储访问全部 try/catch + 能力探测；
		* 6. 外壳词表与步骤正文分离：外壳跨插件统一（本文件），正文每插件一份 `guide-steps.ts`。
		*/
		/** 生态通用的十个语言码（与各插件 `locale/*.json`、README 的十语镜像同口径）。 */
		const GUIDE_LOCALES = [
			"zh",
			"en",
			"ja",
			"ko",
			"fr",
			"de",
			"it",
			"ru",
			"es",
			"pt"
		];
		/**
		* 引导外壳词表（10 语）。
		*
		* 为什么不塞进各插件 locales：这七个词是**跨插件同一套**，塞进九个字典要重复翻译
		* 9×10 次，且一旦措辞调整就得动九个仓。外壳留在本文件，正文留各插件。
		*/
		const GUIDE_COPY = {
			zh: {
				title: "快速上手",
				skip: "跳过引导",
				next: "下一步",
				prev: "上一步",
				done: "开始使用",
				restart: "重新查看引导",
				stepOf: (current, total) => `第 ${current} / ${total} 步`
			},
			en: {
				title: "Quick start",
				skip: "Skip guide",
				next: "Next",
				prev: "Back",
				done: "Get started",
				restart: "Show guide again",
				stepOf: (current, total) => `Step ${current} of ${total}`
			},
			ja: {
				title: "クイックスタート",
				skip: "ガイドをスキップ",
				next: "次へ",
				prev: "戻る",
				done: "はじめる",
				restart: "ガイドをもう一度表示",
				stepOf: (current, total) => `ステップ ${current} / ${total}`
			},
			ko: {
				title: "빠른 시작",
				skip: "가이드 건너뛰기",
				next: "다음",
				prev: "이전",
				done: "시작하기",
				restart: "가이드 다시 보기",
				stepOf: (current, total) => `${current} / ${total} 단계`
			},
			fr: {
				title: "Démarrage rapide",
				skip: "Ignorer le guide",
				next: "Suivant",
				prev: "Retour",
				done: "Commencer",
				restart: "Revoir le guide",
				stepOf: (current, total) => `Étape ${current} sur ${total}`
			},
			de: {
				title: "Schnellstart",
				skip: "Anleitung überspringen",
				next: "Weiter",
				prev: "Zurück",
				done: "Loslegen",
				restart: "Anleitung erneut anzeigen",
				stepOf: (current, total) => `Schritt ${current} von ${total}`
			},
			it: {
				title: "Avvio rapido",
				skip: "Salta la guida",
				next: "Avanti",
				prev: "Indietro",
				done: "Inizia",
				restart: "Rivedi la guida",
				stepOf: (current, total) => `Passo ${current} di ${total}`
			},
			ru: {
				title: "Быстрый старт",
				skip: "Пропустить руководство",
				next: "Далее",
				prev: "Назад",
				done: "Начать",
				restart: "Показать руководство снова",
				stepOf: (current, total) => `Шаг ${current} из ${total}`
			},
			es: {
				title: "Inicio rápido",
				skip: "Omitir la guía",
				next: "Siguiente",
				prev: "Atrás",
				done: "Empezar",
				restart: "Ver la guía de nuevo",
				stepOf: (current, total) => `Paso ${current} de ${total}`
			},
			pt: {
				title: "Início rápido",
				skip: "Ignorar o guia",
				next: "Próximo",
				prev: "Voltar",
				done: "Começar",
				restart: "Ver o guia novamente",
				stepOf: (current, total) => `Passo ${current} de ${total}`
			}
		};
		/** 语言标签 → 语言码：只认主标签，认不出的落 null（由调用方回退 en）。 */
		function normalizeGuideLocale(tag) {
			const primary = tag.toLowerCase().trim().split(/[-_]/)[0] ?? "";
			return GUIDE_LOCALES.includes(primary) ? primary : null;
		}
		function htmlLang() {
			try {
				return typeof document === "undefined" ? "" : document.documentElement?.lang ?? "";
			} catch {
				return "";
			}
		}
		/**
		* 当前引导语言：以宿主 `<html lang>` 为准（语言切换会改写这个属性）。
		*
		* 认不出 → en：引导是「帮助」面，宁可给英文也不能给空白或中文硬串。
		*/
		function currentGuideLocale() {
			return normalizeGuideLocale(htmlLang()) ?? "en";
		}
		/** 引导外壳取词。 */
		function guideLabels(locale = currentGuideLocale()) {
			return GUIDE_COPY[locale] ?? GUIDE_COPY.en;
		}
		/**
		* 步骤正文取词：本语 → en → zh → 表里第一个可用。
		*
		* 为什么需要回退链：九插件分批补语种，某个插件可能只有 zh/en 而宿主是 ru；
		* 这时给英文是可用的，给空白等于「引导坏了」。`undefined` 步骤表按空表处理。
		*/
		function guideSteps(map) {
			if (map === void 0) return [];
			const order = [
				currentGuideLocale(),
				"en",
				"zh"
			];
			for (const key of order) {
				const hit = key === void 0 ? void 0 : map[key];
				if (hit !== void 0 && hit.length > 0) return hit;
			}
			for (const key of GUIDE_LOCALES) {
				const hit = map[key];
				if (hit !== void 0 && hit.length > 0) return hit;
			}
			return [];
		}
		function guideStorageKey(ns) {
			return `dsh.guide.${ns}.skipped`;
		}
		/** 是否已跳过（存储不可用时按「未跳过」处理：宁可多教一次，不要静默不教）。 */
		function isGuideSkipped(ns) {
			try {
				return typeof localStorage !== "undefined" && localStorage.getItem(guideStorageKey(ns)) === "1";
			} catch {
				return false;
			}
		}
		/** 记下跳过；写失败不抛（隐私模式 / 存储禁用）。 */
		function skipGuide(ns) {
			try {
				localStorage?.setItem(guideStorageKey(ns), "1");
			} catch {}
		}
		/** 清标记 = 允许重新教学。 */
		function resetGuide(ns) {
			try {
				localStorage?.removeItem(guideStorageKey(ns));
			} catch {}
		}
		const GUIDE_CSS = `
.sgGuide{border:1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.28));background:var(--dsw-alias-bg-layer-2, rgba(127,127,127,.06));border-radius:12px;padding:14px 16px;margin:0 0 12px}
.sgGuideHead{display:flex;align-items:center;gap:8px;margin:0 0 10px}
.sgGuideTitle{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary, currentColor)}
.sgGuideStep{font-size:12px;color:var(--dsw-alias-label-tertiary, rgba(127,127,127,.9));margin-left:auto}
.sgGuideBody{font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary, currentColor);min-height:52px}
.sgGuideBody b{color:var(--dsw-alias-label-primary, currentColor);font-weight:600}
.sgGuideDots{display:flex;gap:6px;margin:10px 0 0}
.sgGuideDot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-border-l2, rgba(127,127,127,.3))}
.sgGuideDot-on{background:var(--dsw-alias-button-primary-fill, #4d6bfe)}
.sgGuideFoot{display:flex;align-items:center;gap:8px;margin:12px 0 0}
.sgGuideBtn{appearance:none;font:inherit;font-size:12px;padding:5px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));background:transparent;color:var(--dsw-alias-label-primary, currentColor);cursor:pointer}
.sgGuideBtn-primary{background:var(--dsw-alias-button-primary-fill, #4d6bfe);border-color:transparent;color:#fff}
.sgGuideBtn-skip{margin-right:auto;color:var(--dsw-alias-label-tertiary, rgba(127,127,127,.9));border-color:transparent;text-decoration:underline}
.sgGuideRestart{appearance:none;font:inherit;font-size:12px;line-height:1.4;padding:4px 12px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35));background:var(--dsw-alias-bg-layer-2, rgba(127,127,127,.06));color:var(--dsw-alias-label-primary, currentColor);cursor:pointer;text-decoration:none}
.sgGuideRestart:hover{border-color:var(--dsw-alias-button-primary-fill, #4d6bfe);color:var(--dsw-alias-button-primary-fill, #4d6bfe)}
`;
		function injectGuideCss() {
			try {
				if (typeof document === "undefined") return;
				if (typeof document.querySelector !== "function") return;
				if (typeof document.createElement !== "function") return;
				if (!document.head) return;
				if (document.querySelector("style[data-plugin-css=\"guide-kit\"]") !== null) return;
				const tag = document.createElement("style");
				tag.dataset.pluginCss = "guide-kit";
				tag.textContent = GUIDE_CSS;
				document.head.appendChild(tag);
			} catch {}
		}
		/** 语言变更订阅：语言切换后重渲染词表（引导是短生命周期，直接跟随 <html lang>）。 */
		function useLangTick() {
			const [, setTick] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				try {
					if (typeof MutationObserver === "undefined" || typeof document === "undefined") return;
					if (!document.documentElement) return;
					const observer = new MutationObserver(() => setTick((n) => n + 1));
					observer.observe(document.documentElement, {
						attributes: true,
						attributeFilter: ["lang"]
					});
					return () => observer.disconnect();
				} catch {
					return;
				}
			}, []);
		}
		/**
		* 引导主体：≤10 步的小教学（惯例：末条讲「用量端点」贴士）+ 恒定可见的 Skip。
		*
		* `onClose` 由宿主卡面传：Skip/Done 都会调用它（Skip 同时写标记）。
		*/
		function GuidePanel(props) {
			const { ns, steps, onClose } = props;
			const [index, setIndex] = (0, react.useState)(0);
			useLangTick();
			const labels = guideLabels();
			(0, react.useEffect)(() => {
				injectGuideCss();
			}, []);
			if (steps.length === 0) return null;
			const current = steps[Math.min(index, steps.length - 1)];
			const last = index >= steps.length - 1;
			const finish = () => {
				skipGuide(ns);
				onClose();
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "sgGuide",
				"aria-label": labels.title,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: "sgGuideHead",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "sgGuideTitle",
							children: labels.title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "sgGuideStep",
							children: labels.stepOf(index + 1, steps.length)
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sgGuideBody",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: current.title }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: current.body })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "sgGuideDots",
						"aria-hidden": "true",
						children: steps.map((step, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "sgGuideDot" + (i === index ? " sgGuideDot-on" : "") }, step.title))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
						className: "sgGuideFoot",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "sgGuideBtn sgGuideBtn-skip",
								onClick: () => finish(),
								children: labels.skip
							}),
							index > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "sgGuideBtn",
								onClick: () => setIndex(index - 1),
								children: labels.prev
							}),
							last ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "sgGuideBtn sgGuideBtn-primary",
								onClick: () => finish(),
								children: labels.done
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "sgGuideBtn sgGuideBtn-primary",
								onClick: () => setIndex(index + 1),
								children: labels.next
							})
						]
					})
				]
			});
		}
		/**
		* 重启入口：清标记 + 就地重开引导。
		*
		* 统一件，避免九插件各写一份（措辞/样式/清标记时机容易走样）。跳过之后
		* 用户想再看一次，不需要去清浏览器存储。
		*/
		function GuideRestartButton(props) {
			const { ns, onOpen, style } = props;
			useLangTick();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "sgGuideRestart",
				style,
				onClick: () => {
					resetGuide(ns);
					onOpen();
				},
				children: guideLabels().restart
			});
		}
		//#endregion
		//#region src/client/star-row-copy.ts
		/**
		* star-row 真源（面板 star 快车道行，v1）——纯 DOM 实现，零依赖。
		*
		* 副本约束：生成文件名 star-row-copy.ts，头部须保留 /** 块注释，单行 ≤140
		* 字宽（sidebar-fold 仓 lint 门禁：max-line + file-header）。
		*
		* 契约（对齐 panel-star-row spec）：
		*  - 渲染一行 <a>：GitHub 单色 SVG + `owner/name`；variant A 追加一句工程话术；
		*  - 整行即链接（A/L 档），新标签页打开；不做弹窗、不做按钮交互；
		*  - 文案内嵌 10 语，按 `document.documentElement.lang` 前缀自选
		*    （同 sidebar-fold `pickDictionary` 口径），不依赖宿主 locale 服务，
		*    避免逐仓动字典文件；
		*  - 样式一次性注入 <style data-dsh-star-row>，色随 currentColor，深浅主题自适应；
		*  - 副本由 _tools/star-row/sync.mjs 生成到各仓 `src/client/star-row-copy.ts`
		*    （文件名含 copy，locale 守卫豁免规则命中），改副本无效，改真源后重跑 sync。
		*
		* 每仓生成时在文件头部烘焙 REPO_URL / STAR_NS / STAR_VARIANT 三个常量。
		*/
		/** 生成段：REPO_URL / STAR_NS / STAR_VARIANT 由 sync 注入。 */
		const REPO_URL = "https://github.com/drscrewdriver/dsh-session-guard";
		const STAR_NS = "session-guard";
		const STAR_LANGS = [
			"zh",
			"en",
			"ja",
			"ko",
			"fr",
			"de",
			"it",
			"ru",
			"es",
			"pt"
		];
		/** GitHub mark（Simple Icons / octicon 轮廓，24 视口），fill 随 currentColor。 */
		const GITHUB_MARK_PATH = "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332 -5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12";
		const STYLE_ID = "dsh-star-row-style";
		const STYLE_CSS = [
			".dsh-star-row{display:flex;align-items:center;gap:7px;font-size:12px;",
			"line-height:1.5;color:inherit;text-decoration:none;opacity:.72;padding:3px 0;",
			"margin-top:6px;min-width:0;flex-wrap:wrap}",
			".dsh-star-row:hover{opacity:1;text-decoration:underline}",
			".dsh-star-row svg{width:14px;height:14px;flex:none;display:block}",
			".dsh-star-row .dsh-star-ask{opacity:.85;font-weight:400}"
		].join("");
		const STAR_FOOT_COPY = {
			zh: {
				ask: "觉得好用？",
				star: "去 GitHub 点个 Star",
				issue: "反馈建议 / 提 issue"
			},
			en: {
				ask: "Finding it useful?",
				star: "Star on GitHub",
				issue: "Feedback / open an issue"
			},
			ja: {
				ask: "お役に立っていますか？",
				star: "GitHub でスター",
				issue: "ご意見・不具合報告"
			},
			ko: {
				ask: "유용한가요?",
				star: "GitHub 에서 스타",
				issue: "피드백 / 이슈 열기"
			},
			fr: {
				ask: "Utile ?",
				star: "Une étoile sur GitHub",
				issue: "Retour / ouvrir un ticket"
			},
			de: {
				ask: "Hilfreich?",
				star: "Stern auf GitHub",
				issue: "Feedback / Issue öffnen"
			},
			it: {
				ask: "Ti è utile?",
				star: "Stella su GitHub",
				issue: "Feedback / apri una issue"
			},
			ru: {
				ask: "Полезно?",
				star: "Звезда на GitHub",
				issue: "Отзыв / открыть issue"
			},
			es: {
				ask: "¿Te resulta útil?",
				star: "Danos una estrella",
				issue: "Sugerencias / abrir issue"
			},
			pt: {
				ask: "Achou útil?",
				star: "Dê uma estrela no GitHub",
				issue: "Feedback / abrir uma issue"
			}
		};
		const STAR_FOOT_STYLE_ID = "dsh-star-foot-style";
		const STAR_FOOT_STYLE = [
			".dsh-star-foot{display:flex;align-items:center;gap:6px;flex-wrap:wrap;",
			"font-size:12px;line-height:1.6;color:inherit;opacity:.72;margin-top:10px}",
			".dsh-star-foot:hover{opacity:1}",
			".dsh-star-foot .dsh-star-ver{opacity:.6;font-variant-numeric:tabular-nums}",
			".dsh-star-foot .dsh-star-dot{opacity:.4}",
			".dsh-star-foot a{color:inherit;text-decoration:none}",
			".dsh-star-foot a:hover{text-decoration:underline}"
		].join("");
		/** 宿主语言标签归一：取 `documentElement.lang` 的前缀，命中 STAR_LANGS 即用。 */
		function starLang() {
			const low = (typeof document !== "undefined" && document.documentElement.lang || "").toLowerCase();
			for (const cand of STAR_LANGS) if (low.startsWith(cand)) return cand;
			return "en";
		}
		/** 关闭态新键（v2）。**必须换键**：≤2.0.25 把「点 ★」误写成了关闭，旧键里的 1 是误判产物。 */
		const STAR_DISMISS_KEY = "dsh.star." + STAR_NS + ".v2.dismissed";
		/** 旧键（脏数据源）：读到即清掉，**不迁值**——迁过来等于把旧 bug 固化。 */
		const STAR_DISMISS_KEY_V1 = "dsh.star." + STAR_NS + ".dismissed";
		/** 是否已被用户点掉话术（隐私模式下读失败按未关闭处理，只影响本次会话）。 */
		function starDismissed() {
			try {
				if (localStorage.getItem(STAR_DISMISS_KEY_V1) !== null) localStorage.removeItem(STAR_DISMISS_KEY_V1);
				return localStorage.getItem(STAR_DISMISS_KEY) === "1";
			} catch {
				return false;
			}
		}
		/** 记住关闭态（隐私模式写失败不报错，话术本次隐藏、刷新复活）。 */
		function starDismiss() {
			try {
				localStorage.setItem(STAR_DISMISS_KEY, "1");
			} catch {}
		}
		/** 一次性注入页脚样式。 */
		function injectFootStyle(d) {
			if (d.getElementById(STAR_FOOT_STYLE_ID)) return;
			const style = d.createElement("style");
			style.id = STAR_FOOT_STYLE_ID;
			style.textContent = STAR_FOOT_STYLE;
			d.head.appendChild(style);
		}
		/** 页脚里的一段：可点即 <a>，纯文字即 <span>。 */
		function footItem(d, tag, text, href) {
			const el = d.createElement(tag);
			el.className = "dsh-star-ask";
			if (tag === "a" && href) {
				const a = el;
				a.href = href;
				a.target = "_blank";
				a.rel = "noopener noreferrer";
			}
			el.textContent = text;
			return el;
		}
		/** 分隔点。 */
		function footDot(d) {
			const dot = d.createElement("span");
			dot.className = "dsh-star-dot";
			dot.textContent = "·";
			return dot;
		}
		/**
		* S 档：一行页脚；非 S 档或已关掉过话术时返回 null（走裸链接原路径）。
		* 点过任一链接 → 记关闭 + 换回中性一行，链接本身照常跳转（不 preventDefault）。
		*/
		function extendedStarRow(neutral, d) {
			if (starDismissed()) return null;
			injectFootStyle(d);
			const copy = STAR_FOOT_COPY[starLang()] ?? STAR_FOOT_COPY.en;
			const issuesUrl = REPO_URL.replace(/\/+$/, "") + "/issues/new";
			const row = d.createElement("div");
			row.className = "dsh-star-foot";
			const ver = d.createElement("span");
			ver.className = "dsh-star-ver";
			ver.textContent = "v4.4.5";
			row.appendChild(ver);
			row.appendChild(footDot(d));
			row.appendChild(footItem(d, "span", copy.ask));
			const star = footItem(d, "a", "⭐ " + copy.star, REPO_URL);
			const issue = footItem(d, "a", "💬 " + copy.issue, issuesUrl);
			row.appendChild(star);
			row.appendChild(footDot(d));
			row.appendChild(issue);
			const collapse = () => {
				starDismiss();
				if (row.parentNode) {
					neutral.className = "dsh-star-row";
					row.parentNode.replaceChild(neutral, row);
				}
			};
			star.addEventListener("click", collapse);
			issue.addEventListener("click", collapse);
			return row;
		}
		/** 在目标文档上建出快车道行（一次性注入样式）。纯 DOM，React 仓经 ref 回调挂载。 */
		function mountStarRow(doc) {
			const d = doc ?? document;
			if (!d.getElementById(STYLE_ID)) {
				const tag = d.createElement("style");
				tag.id = STYLE_ID;
				tag.textContent = STYLE_CSS;
				d.head.appendChild(tag);
			}
			const match = REPO_URL.match(/github\.com\/([^/]+\/[^/#?]+)/);
			const repo = match ? match[1] : "drscrewdriver";
			const a = d.createElement("a");
			a.className = "dsh-star-row";
			a.href = REPO_URL;
			a.target = "_blank";
			a.rel = "noreferrer";
			a.dataset.starNs = STAR_NS;
			const svg = d.createElementNS("http://www.w3.org/2000/svg", "svg");
			svg.setAttribute("viewBox", "0 0 24 24");
			svg.setAttribute("aria-hidden", "true");
			const path = d.createElementNS("http://www.w3.org/2000/svg", "path");
			path.setAttribute("fill", "currentColor");
			path.setAttribute("d", GITHUB_MARK_PATH);
			svg.appendChild(path);
			a.appendChild(svg);
			const label = d.createElement("span");
			label.textContent = repo;
			a.appendChild(label);
			const row = extendedStarRow(a, d);
			if (row) return row;
			return a;
		}
		//#endregion
		//#region src/client/settings-card.tsx
		/**
		* dsh-session-guard — 插件配置卡片（dsh-family.tab 共用设置节，抽屉默认展开）。
		*
		* 对齐 dsh-thinking-levels / dsh-tidychat 的卡片语法：一个可展开的 `<li>`，
		* header 按钮（插件名 + 描述 + chevron）切换字段体；开关为 pill switch
		* （track + thumb），不是复选框对勾。
		*
		* 经 `configForms.get('session-guard')` 绑定本插件 entry 的配置
		* （0.1.7 configForms 缝）；每次变更立即经 scope 提交（无 staged form）。
		* 仅依赖 react；CSS 经 `<style data-plugin-css>` 注入一次，控件为原生 HTML，
		* 客户端 bundle 无 value-import @deepseek-ai/* 平台包（类型导入被构建擦除）。
		*/
		/**
		* 本卡片历史上方均硬编码中文（旧债，本次不动），但 locale 棘轮只降不升，
		* 所以新增行一律走字典。根据 <html lang> 取词，认不出落 en（再落 zh）。
		*/
		const LOCALE_LANGS = [
			"zh",
			"en",
			"ja",
			"ko",
			"fr",
			"de",
			"it",
			"ru",
			"es",
			"pt"
		];
		function currentLocale() {
			const doc = typeof document !== "undefined" ? document.documentElement?.lang ?? "" : "";
			const nav = typeof navigator !== "undefined" ? navigator.language ?? "" : "";
			const base = (doc || nav || "en").toLowerCase().split("-")[0];
			return LOCALE_LANGS.includes(base) ? base : "en";
		}
		function t(key) {
			const loc = currentLocale();
			return dictionaries[loc]?.[key] ?? dictionaries.en?.[key] ?? dictionaries.zh?.[key] ?? key;
		}
		/** 首次使用引导文案（zh/en 为一等公民；其余语种由 guide-kit 的回退链落到 en）。 */
		const GUIDE_STEPS = {
			zh: [
				{
					title: "它会替你踩刹车",
					body: "高峰时段自动暂停运行中的会话，退峰后自动续跑；周末模式让你无视峰谷畅快跑。"
				},
				{
					title: "判定口径按「官方源」",
					body: "默认只拦 DeepSeek 官方源，本地/第三方 provider 照常跑；需要更严时再打开「官方源二维判定」下的名单。"
				},
				{
					title: "状态永远可见",
					body: "输入框右侧的徽标显示当前状态（正常 / 峰值暂停中）；停不下来时用旁边的暂停按钮手动接管。"
				}
			],
			en: [
				{
					title: "It pumps the brakes for you",
					body: "Running sessions auto-pause during peak hours and resume off-peak. Weekend mode ignores peaks entirely."
				},
				{
					title: "Official-source scoping",
					body: "By default only the DeepSeek official source is gated; local/third-party providers keep running. Tighten it via the official-source allowlists when needed."
				},
				{
					title: "Status stays visible",
					body: "The badge right of the composer shows the current state (Normal / Peak paused). Use the pause button beside it to take over manually."
				}
			]
		};
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
		/** 卡面字段消毒：宿主 describe 形态异常（≤0.1.5 骨架残留等）时槽崩会殉葬全族
		* tab——ListRow 的 values 非 nullish 非数组（如 {}）会让 `?? []` 失守，逐卡硬护栏。 */
		function toList(v) {
			return Array.isArray(v) ? v.map(String) : [];
		}
		/** 插件配置卡片主体：可展开的 <li> + header 按钮 + pill switch 字段体。 */
		function SessionGuardCard({ scope }) {
			const snapshot = (0, react.useSyncExternalStore)((listener) => scope.subscribe(listener), () => scope.getSnapshot());
			const unavailable = snapshot.status === "unavailable";
			const readonly = unavailable || !snapshot.writable;
			const value = snapshot.value ?? {};
			const [open, setOpen] = (0, react.useState)(true);
			const [guideOpen, setGuideOpen] = (0, react.useState)(() => !isGuideSkipped("session-guard"));
			injectCss();
			const toggle = (field, next) => {
				scope.set(field, next);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: "sgCard" + (open ? " sgCard-open" : ""),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
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
					}),
					open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sgCardBody",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "sgHint",
								style: { marginBottom: 12 },
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GuideRestartButton, {
									ns: "session-guard",
									onOpen: () => setGuideOpen(true)
								})
							}),
							guideOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GuidePanel, {
								ns: "session-guard",
								steps: guideSteps(GUIDE_STEPS),
								onClose: () => setGuideOpen(false)
							}),
							unavailable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
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
									values: toList(value.officialProviders),
									placeholder: "deepseek-official",
									disabled: readonly,
									onCommit: (next) => {
										scope.set("officialProviders", next);
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ListRow, {
									label: "官方端点名单",
									description: "baseURL 归一化后的 host（逗号分隔）",
									values: toList(value.officialBaseURLs),
									placeholder: "api.deepseek.com",
									disabled: readonly,
									onCommit: (next) => {
										scope.set("officialBaseURLs", next);
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectRow, {
									label: "拦截方式",
									description: "挂起等待不报错；或报错并记入延后队列",
									value: value.deferredMode === "error" ? "error" : "hold",
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
									label: t("settings.pauseStopsJobs"),
									description: t("settings.pauseStopsJobs.desc"),
									checked: value.pauseStopsJobs ?? true,
									disabled: readonly,
									onChange: (next) => toggle("pauseStopsJobs", next)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
									label: t("settings.pauseStopsChildren"),
									description: t("settings.pauseStopsChildren.desc"),
									checked: value.pauseStopsChildren ?? true,
									disabled: readonly,
									onChange: (next) => toggle("pauseStopsChildren", next)
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
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
									label: t("settings.retryPauseWhenOffline"),
									description: t("settings.retryPauseWhenOffline.desc"),
									checked: value.retryPauseWhenOffline ?? false,
									disabled: readonly,
									onChange: (next) => toggle("retryPauseWhenOffline", next)
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
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { ref: (node) => {
						if (node && !node.firstChild) node.appendChild(mountStarRow());
					} })
				]
			});
		}
		//#endregion
		//#region \0@oxc-project+runtime@0.146.0/helpers/esm/typeof.js
		function _typeof(o) {
			"@babel/helpers - typeof";
			return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
				return typeof o;
			} : function(o) {
				return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
			}, _typeof(o);
		}
		//#endregion
		//#region \0@oxc-project+runtime@0.146.0/helpers/esm/toPrimitive.js
		function toPrimitive(t, r) {
			if ("object" != _typeof(t) || !t) return t;
			var e = t[Symbol.toPrimitive];
			if (void 0 !== e) {
				var i = e.call(t, r || "default");
				if ("object" != _typeof(i)) return i;
				throw new TypeError("@@toPrimitive must return a primitive value.");
			}
			return ("string" === r ? String : Number)(t);
		}
		//#endregion
		//#region \0@oxc-project+runtime@0.146.0/helpers/esm/toPropertyKey.js
		function toPropertyKey(t) {
			var i = toPrimitive(t, "string");
			return "symbol" == _typeof(i) ? i : i + "";
		}
		//#endregion
		//#region \0@oxc-project+runtime@0.146.0/helpers/esm/defineProperty.js
		function _defineProperty(e, r, t) {
			return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
				value: t,
				enumerable: !0,
				configurable: !0,
				writable: !0
			}) : e[r] = t, e;
		}
		//#endregion
		//#region src/client/settings-bridge.ts
		/**
		* BridgeDocHandle — 设置卡双轨数据源的桥轨（M4/T20-b）。
		*
		* ≤0.1.5（settingsScope fiber 永不解 / 0.1.0-0.1.1 无 client 服务）时，
		* 配置卡经本句柄走自家 webServer 桥（describe/mutate）读写宿主 settings 服务。
		* 与原生 SettingsScope（scope-face.ts）同构：getSnapshot/subscribe/set/unset。
		* 读 = POST /api/<ns>/settings/describe；写 = POST …/mutate（ops 转发宿主服务），
		* 成功即用回填描述符刷新快照并通知订阅者（无本地第二份状态——权威值始终在宿主）。
		*
		* 与 perm-gate src/client/bridge-scope.ts（T13b/T20-b 泛化模板）的差异：
		* ① 快照形状对齐本仓 SettingsScope（status: loading/ready/unavailable + mode）；
		* ② describe 未就绪（settings-unavailable/ns-not-registered）时有限重试
		*    （宿主 settings 服务解析晚于卡挂载的窗口），重试耗尽才落 'unavailable'。
		*/
		/** 与 server 侧 settingsBridgeRoutesFor（src/settings-bridge.js）必须逐字符一致。 */
		function settingsBridgeRoutesFor(ns) {
			return {
				describe: `/api/${ns}/settings/describe`,
				mutate: `/api/${ns}/settings/mutate`
			};
		}
		/**
		* ≤0.1.5 宿主 describe 的 descriptor.value 是「每字段 → {}」骨架（0.1.0/0.1.5
		* 实测：value={enabled:{},…,officialProviders:{}}，真值拆在 base（合并默认层）
		* 与 user（用户层））——直接吞 value 会让卡拿到 officialProviders={}，
		* `?? []` 不兜底（{} 非 nullish）→ ListRow values.join 崩，整族 tab 槽殉葬。
		* 判特征：对象且每个自有值都是空 plain 对象（guard 字段是标量/数组，不会全空）。
		* 命中即以 {...base, ...user} 重组有效值（guard 配置全是顶层标量/数组，浅合并即语义）。
		*/
		function isFieldSkeleton(v) {
			if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
			const values = Object.values(v);
			return values.length > 0 && values.every((x) => x !== null && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length === 0);
		}
		function plainObject(v) {
			return v !== null && typeof v === "object" && !Array.isArray(v) ? { ...v } : {};
		}
		/** descriptor → 卡面可用 plain 值：正常代际用 value；骨架代际用 base+user 浅合并。 */
		function descriptorPlainValue(d) {
			if (!isFieldSkeleton(d.value)) return d.value;
			return {
				...plainObject(d.base),
				...plainObject(d.user)
			};
		}
		/** describe 不可就绪码：宿主 settings 未解析/未注册——值得重试的瞬态。 */
		const RETRYABLE_CODES = /* @__PURE__ */ new Set(["settings-unavailable", "ns-not-registered"]);
		const RETRY_DELAY_MS = 1500;
		const RETRY_MAX = 4;
		var BridgeDocHandle = class {
			constructor(ns) {
				_defineProperty(this, "snapshot", void 0);
				_defineProperty(this, "listeners", /* @__PURE__ */ new Set());
				_defineProperty(this, "revision", void 0);
				_defineProperty(this, "retriesLeft", RETRY_MAX);
				_defineProperty(this, "inflight", void 0);
				_defineProperty(this, "ns", void 0);
				_defineProperty(this, "routes", void 0);
				this.ns = ns;
				this.routes = settingsBridgeRoutesFor(ns);
				this.snapshot = {
					status: "loading",
					value: void 0,
					revision: void 0,
					writable: true,
					base: void 0,
					user: void 0,
					mode: "bridge"
				};
				this.refresh();
			}
			getSnapshot() {
				return this.snapshot;
			}
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			async set(field, value) {
				return this.mutate([{
					op: "set",
					path: [field],
					value
				}]);
			}
			async unset(field) {
				return this.mutate([{
					op: "unset",
					path: [field]
				}]);
			}
			notify() {
				for (const l of [...this.listeners]) l();
			}
			applyDescriptor(d, writable) {
				this.revision = typeof d.revision === "number" ? d.revision : void 0;
				this.snapshot = {
					status: "ready",
					value: descriptorPlainValue(d),
					revision: this.revision,
					writable,
					base: void 0,
					user: void 0,
					mode: "bridge"
				};
			}
			async request(path, body) {
				const response = await fetch(path, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body ?? {})
				});
				if (!response.ok) throw new Error(`bridge ${path} HTTP ${response.status}`);
				return await response.json();
			}
			/** describe 拉取；瞬态未就绪码在重试预算内延迟重拉，耗尽才落 unavailable。 */
			refresh() {
				if (this.inflight !== void 0) return this.inflight;
				this.inflight = (async () => {
					try {
						const body = await this.request(this.routes.describe);
						if (body.ok && body.value?.descriptor !== void 0) {
							this.retriesLeft = RETRY_MAX;
							this.applyDescriptor(body.value.descriptor, body.value.writable !== false);
						} else if (body.code !== void 0 && RETRYABLE_CODES.has(body.code) && this.retriesLeft > 0) {
							this.retriesLeft -= 1;
							this.inflight = void 0;
							setTimeout(() => {
								this.refresh();
							}, RETRY_DELAY_MS);
							return;
						} else this.snapshot = {
							...this.snapshot,
							status: "unavailable",
							writable: false
						};
					} catch {
						if (this.retriesLeft > 0) {
							this.retriesLeft -= 1;
							this.inflight = void 0;
							setTimeout(() => {
								this.refresh();
							}, RETRY_DELAY_MS);
							return;
						}
						this.snapshot = {
							...this.snapshot,
							status: "unavailable",
							writable: false
						};
					}
					this.inflight = void 0;
					this.notify();
				})();
				return this.inflight;
			}
			async mutate(ops) {
				const body = await this.request(this.routes.mutate, {
					ops,
					expectedRevision: this.revision
				});
				if (body.ok && body.value?.descriptor !== void 0) {
					this.applyDescriptor(body.value.descriptor, this.snapshot.writable);
					this.notify();
					return true;
				}
				if (body.code === "settings-conflict") {
					await this.refresh();
					return false;
				}
				throw new Error(`bridge mutate failed: ${body.code ?? "unknown"} ${body.message ?? ""}`);
			}
		};
		//#endregion
		//#region src/client/family-section.tsx
		/**
		* dsh-session-guard — 家族节接管组件（fallback host section）。
		*
		* 仅当宿主 dsh-thinking-levels 缺席、且本插件在接管选举中胜出时，由
		* index.ts 注册为顶级 `settings.section`（id 固定 `dsh-family`，节名仍为
		* 「起子插件设置」）。组件是纯通用渲染：把 `dsh-family.tab` 账本里的每张
		* 贡献卡（含本插件自己的，因为接管时本插件也声明了该子席位）按 order
		* 依次 renderSlot —— 卡片本身是默认展开的抽屉，整节即一页抽屉。
		*
		* 与 thinking-levels 的 FamilySettingsSection 一致：接管时本插件既是 owner 又是成员，
		* 自宣 dsh-family.tab 不触发自身 inject（账本恒无本卡），故本卡作 OWN 行内联直挂
		* （props.renderOwn/ownId），其余成员仍走账本。缺 renderOwn 时退回纯账本渲染（向后兼容）。
		*/
		const NO_TABS = [];
		function GuardFamilySection(props) {
			const raw = props.hooks?.tabs;
			const [polled, setPolled] = (0, react.useState)(() => raw?.getSnapshot() ?? NO_TABS);
			(0, react.useEffect)(() => {
				if (props.useTabs !== void 0 || raw === void 0) return;
				return raw.subscribe(() => setPolled(raw.getSnapshot()));
			});
			const tabs = props.useTabs !== void 0 ? props.useTabs((value) => value) : polled;
			const ownId = props.ownId ?? "__own__";
			const rows = props.renderOwn ? [{
				id: ownId,
				order: Number.NEGATIVE_INFINITY,
				label: ownId
			}, ...tabs.filter((tab) => tab.id !== ownId)] : tabs;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "grid",
					gap: "12px"
				},
				children: rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: props.renderOwn && row.id === ownId ? props.renderOwn() : props.renderSlot ? props.renderSlot("dsh-family.tab", {}, {
					only: row.id,
					fallback: null
				}) : props.renderContributor?.(row.id) ?? null }, row.id))
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
		* - 跨版本（universal-rc）：持久设置经 configForms(0.1.7+)/settingsScope(≤0.1.5)
		*   双代腰产出同形 scope；无设置页宿主（0.1.0/0.1.1）经 shell.overlay 浮窗
		*   齿轮提供配置入口（配置存储全在 host 侧，浮层与宿主设置页解耦）。
		*
		* 构建：tsdown → lib/client.js（__ModuleLoader__.load 注册，与 input-traffic 同构）。
		*/
		/** 家族节固定 id（与 thinking-levels 的注册严格一致）。 */
		const FAMILY_SECTION_ID = "dsh-family";
		/** 家族子席位 key（与 thinking-levels 的声明严格一致）。 */
		const FAMILY_CHILD_KEY = "dsh-family.tab";
		/** 让位宽限（由分级派生）：TL rank 0 在 200ms 落账，本插件 rank 1 到 1100ms 才查账本——
		* 落账时刻由各家 rank 决定（不再依赖 inject 注册顺序里谁先 fire），此延迟后足以分辨「TL 在场」。 */
		const FAMILY_YIELD_MS = 2e3;
		/**
		* 客户端所需服务：slots（状态徽标）+ locale。持久设置走双代腰
		* （registerSettingsFaces）：configForms 为 0.1.7+ 独有，顶层注入会在
		* 0.1.0/0.1.1（无此服务）上让整段 apply 静默死。
		*/
		const inject = ["slots", "locale"];
		/** 单面注册护栏：某条宿主线上未知槽名/缺服务的同步异常不得带走其它面。 */
		function safe(tag, fn) {
			try {
				fn();
			} catch (error) {
				console.warn(`dsh-session-guard: client surface '${tag}' failed:`, error);
			}
		}
		/**
		* 双代持久设置腰（移植 input-traffic registerSettingsFaces）：两个 scoped
		* 子注入各自产出同形 scope 后回调。M4 P0 重构后本函数**只承担数据臂**——
		* 回调仅写 scopeRef 活引用（0.1.7+ 原生优先，mounted 位防双挂），卡面注册
		* 已全部提到 apply 顶层（≤0.1.5 回调永不触发，注册不能关在这里）。
		*/
		function registerSettingsFaces(ctx, onScope) {
			let mounted = false;
			ctx.inject(["configForms"], (sctx) => {
				if (mounted) return;
				mounted = true;
				onScope(sctx.configForms.get("session-guard"), "configForms");
			});
			ctx.inject(["settingsScope"], (sctx) => {
				if (mounted) return;
				mounted = true;
				onScope(sctx.settingsScope.bind({ namespace: "session-guard" }), "settingsScope");
			});
		}
		/** scope 活引用（perm-gate client/index.ts L166-257 形态）：回调填、卡面现读。 */
		const scopeRef = { scope: void 0 };
		/** 桥轨惰性单例：≤0.1.5（settingsScope 死路 / 0.1.0-0.1.1 无服务）的数据源。 */
		let bridgeScopeSingleton;
		function bridgeScope() {
			if (bridgeScopeSingleton === void 0) bridgeScopeSingleton = new BridgeDocHandle("session-guard");
			return bridgeScopeSingleton;
		}
		/** 卡面现取数据源：原生句柄解到即原生，否则桥兜底（perm-gate 同式）。 */
		function currentScope() {
			return scopeRef.scope ?? bridgeScope();
		}
		/** 两张配置卡（family tab + bundle 详情页）挂载；数据经 currentScope() 现取。 */
		function mountConfigCards(ctx) {
			ctx.slots.inject("dsh-family.tab", () => ctx.slots.register({
				name: "dsh-family.tab",
				id: "session-guard",
				order: 20,
				label: "会话守护门禁",
				locale: "session-guard",
				inject: () => ({ scope: currentScope() })
			}, SessionGuardCard));
			ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
				name: "plugins.bundle.config",
				key: "dsh-session-guard",
				inject: () => ({ scope: currentScope() })
			}, SessionGuardCard));
		}
		function apply(ctx) {
			safe("locale/dictionaries", () => {
				const locale = ctx.locale;
				if (!locale) return;
				if (typeof ctx.effect === "function") ctx.effect(() => locale.register(NS, dictionaries), "dsh-session-guard: dictionaries");
				else locale.register(NS, dictionaries);
			});
			safe("conversation.input.right/pause", () => ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
				name: "conversation.input.right",
				id: "session-guard-pause",
				order: 20,
				locale: "session-guard"
			}, PauseButton)));
			safe("conversation.input.right/status", () => ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
				name: "conversation.input.right",
				id: "session-guard-status",
				order: 40,
				locale: "session-guard"
			}, StatusBadge)));
			safe("config-cards/family-tab", () => mountConfigCards(ctx));
			registerSettingsFaces(ctx, (scope, generation) => {
				if (generation === "configForms") scopeRef.scope = scope;
			});
			safe("family-section-election", () => {
				console.log("[dsh-session-guard] election: registering settings.section inject (apply-time)");
				ctx.slots.inject("settings.section", () => {
					console.log("[dsh-session-guard] election: factory fired (settings.section declared)");
					setTimeout(() => {
						if (ctx.slots.entries("settings.section").some((e) => e.options.id === FAMILY_SECTION_ID)) {
							console.log("[dsh-session-guard] election: dsh-family already seated — stand down");
							return;
						}
						const base = {
							name: "settings.section",
							id: FAMILY_SECTION_ID,
							order: 40,
							priority: 10,
							label: () => "起子插件设置",
							inject: () => ({
								hooks: makeGuardFamilyTabsHooks(ctx.slots),
								renderContributor,
								ownId: "session-guard",
								renderOwn: () => (0, react.createElement)(SessionGuardCard, { scope: currentScope() })
							})
						};
						try {
							ctx.slots.register({
								...base,
								children: { [FAMILY_CHILD_KEY]: {
									kind: "list",
									scope: "root"
								} }
							}, GuardFamilySection);
							console.log("[dsh-session-guard] family takeover registered (children declared)");
						} catch (error) {
							console.log(`[dsh-session-guard] children claim lost — withdrawing (${error instanceof Error ? error.message : error})`);
						}
					}, FAMILY_YIELD_MS);
				});
			});
		}
		/** 直接挂载面（≤0.1.5 壳无 renderSlot 的降级）：从账本原始条目现挂激活卡。
		* entries 每代都带 component + inject（ui-slots SlotCore.entries 原始记录）；
		* 任何失败（条目消失/抛错 inject）降级为 null，不炸接管节。 */
		function renderContributor(id) {
			try {
				const entry = ctx.slots.entries(FAMILY_CHILD_KEY).find((e) => e.options.id === id);
				if (entry === void 0 || typeof entry.component !== "function") return null;
				const injected = typeof entry.inject === "function" ? entry.inject() : void 0;
				return (0, react.createElement)(entry.component, injected ?? {});
			} catch {
				return null;
			}
		}
		/** 接管节的账本投影 hooks（与 thinking-levels 的 FamilySectionInjected 同形）。 */
		function makeGuardFamilyTabsHooks(slots) {
			let version = -1;
			let tabs = [];
			return {
				getSnapshot: () => {
					const next = slots.getVersion(FAMILY_CHILD_KEY);
					if (next !== version) {
						version = next;
						tabs = slots.entries(FAMILY_CHILD_KEY).map((entry) => ({
							id: entry.options.id ?? "",
							order: entry.options.order ?? 0,
							label: typeof entry.options.label === "function" ? (() => {
								try {
									return String(entry.options.label() ?? entry.options.id ?? "");
								} catch {
									return String(entry.options.id ?? "");
								}
							})() : String(entry.options.label ?? entry.options.id ?? "")
						})).sort((a, b) => a.order - b.order);
					}
					return tabs;
				},
				subscribe: (listener) => slots.subscribe(FAMILY_CHILD_KEY, listener)
			};
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map