window.__ModuleLoader__.load({
	id: "dsh-session-guard",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/locales.ts
		/** `session-guard` client dictionaries (zh / en / ja / ko / fr / de / it / ru / es). */
		/** Dictionary namespace owned by this plugin. */
		const NS = "session-guard";
		/** Combined dictionary map — all 9 languages, for one-call registration. */
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
				"settings.officialHint": "Orden de decisión: lista explícita de ids → endpoint de baseURL → endpoint predeterminado del catálogo → id integrado. Para un veredicto erróneo abra /session-guard/provider?provider=<id> y consulte matchedBy.",
				"settings.unavailable": "Configuración no disponible: asegúrese de que dsh-session-guard esté integrado en este perfil.",
				"status.normal": "Funcionamiento normal",
				"status.paused_peak": "Pausa por pico activa",
				"status.peak_official": "Pico · solo oficial",
				"status.peak_all": "Pico · todo pausado"
			}
		};
		//#endregion
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
			const [open, setOpen] = (0, react.useState)(true);
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
		* 与 thinking-levels 的 FamilySettingsSection 的差别仅在不需要 thinking-
		* levels 自己的卡（宿主不在了，它的卡也不在）：渲染循环没有 own-tab 特例。
		*/
		function GuardFamilySection(props) {
			const tabs = (0, react.useSyncExternalStore)(props.hooks.tabs.subscribe, props.hooks.tabs.getSnapshot);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "grid",
					gap: "12px"
				},
				children: tabs.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: props.renderSlot("dsh-family.tab", {}, {
					only: row.id,
					fallback: null
				}) }, row.id))
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
		/** 家族节固定 id（与 thinking-levels 的注册严格一致）。 */
		const FAMILY_SECTION_ID = "dsh-family";
		/** 家族子席位 key（与 thinking-levels 的声明严格一致）。 */
		const FAMILY_CHILD_KEY = "dsh-family.tab";
		/**
		* 接管宽限期：等宿主（以及排名更前的贡献方）先落座。下载量排名 guard(1522)
		* 高于 session-steward(1090) → guard 宽限期更短、先尝试接管；并发冲突由
		* ui-slots 的「同 id 同 priority 重复注册抛错」仲裁，后到者放弃即可。
		*/
		const FAMILY_HOST_GRACE_MS = 2e3;
		/** 客户端所需服务：slots（状态徽标）+ locale + configForms（共用 tab 设置卡）。 */
		const inject = [
			"slots",
			"locale",
			"configForms"
		];
		function apply(ctx) {
			if (ctx.locale) {
				const locale = ctx.locale;
				ctx.effect(() => locale.register(NS, dictionaries), "dsh-session-guard: dictionaries");
			}
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
			ctx.slots.inject("dsh-family.tab", () => ctx.slots.register({
				name: "dsh-family.tab",
				id: "session-guard",
				order: 20,
				label: "会话守护门禁",
				locale: "session-guard",
				inject: () => ({ scope: ctx.configForms.get("session-guard") })
			}, SessionGuardCard));
			ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
				name: "plugins.bundle.config",
				key: "dsh-session-guard",
				inject: () => ({ scope: ctx.configForms.get("session-guard") })
			}, SessionGuardCard));
			setTimeout(() => {
				if (ctx.slots.entries("settings.section").some((e) => e.options.id === FAMILY_SECTION_ID)) return;
				try {
					ctx.slots.register({
						name: "settings.section",
						id: FAMILY_SECTION_ID,
						order: 40,
						label: () => "起子插件设置",
						inject: () => makeGuardFamilyTabsHooks(ctx.slots),
						children: { [FAMILY_CHILD_KEY]: {
							kind: "list",
							scope: "root"
						} }
					}, GuardFamilySection);
				} catch {}
			}, FAMILY_HOST_GRACE_MS);
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