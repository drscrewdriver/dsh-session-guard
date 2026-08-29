/** `session-guard` client dictionaries (zh / en / ja / ko). */

/** Dictionary namespace owned by this plugin. */
export const NS = 'session-guard'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'badge.normal': '正常',
  'badge.paused': '已暂停（峰值）',
  'badge_paused_peak': '峰值暂停中',
  'settings.enabled': '高峰自动暂停',
  'settings.enabled.desc': '高峰时段自动暂停运行中的会话',
  'settings.offPeakAutoResume': '低谷自动恢复',
  'settings.offPeakAutoResume.desc': '低峰时段自动恢复被暂停的会话',
  'settings.weekendMode': '周末模式',
  'settings.weekendMode.desc': '识别周末 → 周末不自动暂停',
  'settings.queueFallback': '回退锁等待队列',
  'settings.queueFallback.desc': '自研会话门不可用时回退锁等待队列（fail-open）',
  'settings.retryEnabled': '自动重试',
  'settings.retryEnabled.desc': '瞬时失败自动续跑（默认关，保守）',
  'settings.timezone': '时区',
  'settings.peakWindows': '高峰时间窗口',
  'settings.unavailable': '设置不可用：请确认 dsh-session-guard 已装配进 profile。',
  'status.normal': '正常运行',
  'status.paused_peak': '峰值暂停中',
} satisfies Record<string, string>

/** English dictionary (keys mirror zh). */
export const en: Record<keyof typeof zh, string> = {
  'badge.normal': 'Normal',
  'badge.paused': 'Paused (peak)',
  'badge_paused_peak': 'Peak paused',
  'settings.enabled': 'Peak auto-pause',
  'settings.enabled.desc': 'Auto-pause running sessions during peak hours',
  'settings.offPeakAutoResume': 'Off-peak auto-resume',
  'settings.offPeakAutoResume.desc': 'Auto-resume paused sessions during off-peak hours',
  'settings.weekendMode': 'Weekend mode',
  'settings.weekendMode.desc': 'Detect weekends → no auto-pause on weekends',
  'settings.queueFallback': 'Fallback lock-wait queue',
  'settings.queueFallback.desc': 'Fallback to lock-wait queue when custom session gate is unavailable (fail-open)',
  'settings.retryEnabled': 'Auto-retry',
  'settings.retryEnabled.desc': 'Transient failure auto-resume (off by default, conservative)',
  'settings.timezone': 'Timezone',
  'settings.peakWindows': 'Peak time windows',
  'settings.unavailable': 'Settings unavailable: make sure dsh-session-guard is assembled into this profile.',
  'status.normal': 'Running normally',
  'status.paused_peak': 'Peak paused',
}

/** Japanese dictionary (keys mirror zh). */
export const ja: Record<keyof typeof zh, string> = {
  'badge.normal': '通常',
  'badge.paused': '一時停止（ピーク）',
  'badge_paused_peak': 'ピーク一時停止中',
  'settings.enabled': 'ピーク自動一時停止',
  'settings.enabled.desc': 'ピーク時間帯に実行中セッションを自動一時停止',
  'settings.offPeakAutoResume': 'オフピーク自動再開',
  'settings.offPeakAutoResume.desc': 'オフピーク時に一時停止セッションを自動再開',
  'settings.weekendMode': '週末モード',
  'settings.weekendMode.desc': '週末を認識→週末は自動一時停止しない',
  'settings.queueFallback': 'フォールバックロック待機キュー',
  'settings.queueFallback.desc': 'カスタムセッションゲート利用不可時にロック待機キューにフォールバック（fail-open）',
  'settings.retryEnabled': '自動リトライ',
  'settings.retryEnabled.desc': '瞬時失敗自動再試行（デフォルトオフ、保守的）',
  'settings.timezone': 'タイムゾーン',
  'settings.peakWindows': 'ピーク時間ウィンドウ',
  'settings.unavailable': '設定利用不可：dsh-session-guard が profile に組み込まれているか確認してください。',
  'status.normal': '通常実行中',
  'status.paused_peak': 'ピーク一時停止中',
}

/** Korean dictionary (keys mirror zh). */
export const ko: Record<keyof typeof zh, string> = {
  'badge.normal': '정상',
  'badge.paused': '일시정지(피크)',
  'badge_paused_peak': '피크 일시정지 중',
  'settings.enabled': '피크 자동 일시정지',
  'settings.enabled.desc': '피크 시간대에 실행 중인 세션을 자동 일시정지',
  'settings.offPeakAutoResume': '오피크 자동 재개',
  'settings.offPeakAutoResume.desc': '오피크 시간대에 일시정지된 세션을 자동 재개',
  'settings.weekendMode': '주말 모드',
  'settings.weekendMode.desc': '주말 감지 → 주말에는 자동 일시정지 안 함',
  'settings.queueFallback': '폴백 잠금 대기 큐',
  'settings.queueFallback.desc': '커스텀 세션 게이트 사용 불가 시 잠금 대기 큐로 폴백(fail-open)',
  'settings.retryEnabled': '자동 재시도',
  'settings.retryEnabled.desc': '일시적 실패 자동 재개(기본값 꺼짐, 보수적)',
  'settings.timezone': '타임존',
  'settings.peakWindows': '피크 시간대',
  'settings.unavailable': '설정 사용 불가: dsh-session-guard가 이 profile에 조립되었는지 확인하세요.',
  'status.normal': '정상 실행 중',
  'status.paused_peak': '피크 일시정지 중',
}

/** Dictionary key union. */
export type SessionGuardKey = keyof typeof zh
