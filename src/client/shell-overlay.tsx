/**
 * dsh-session-guard — 无设置页宿主（0.1.0/0.1.1）的兜底配置入口。
 *
 * 壳级 `shell.overlay` 席位渲染：右下角固定齿轮钮，点开固定定位浮层承载
 * SessionGuardCard（page 形态，默认展开）。配置存储全在 host 侧（settings
 * 服务），浮层与宿主设置页解耦——壳再老也不影响读写。有设置页的宿主上
 * 该齿轮与行配置卡/家族 tab 并存，作为全局快捷入口。
 */
import { useState } from 'react'
import { SessionGuardCard } from './settings-card'
import type { SessionGuardConfig } from './settings-card'
import type { SettingsScope } from './scope-face'

export function ShellSettingsEntry(props: {
  scope: SettingsScope<SessionGuardConfig>
}): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'fixed', right: 16, bottom: 64, zIndex: 10000 }}>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.45)', zIndex: 10000 }}
        />
      )}
      {open && (
        <div
          style={{
            position: 'fixed',
            top: '6vh',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(760px, 92vw)',
            maxHeight: '84vh',
            overflowY: 'auto',
            zIndex: 10001,
          }}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{ position: 'sticky', top: 6, float: 'right', marginRight: 8, zIndex: 2 }}
          >
            ✕ 关闭
          </button>
          <SessionGuardCard scope={props.scope} />
        </div>
      )}
      <button
        type="button"
        title="会话守护设置"
        onClick={() => setOpen(state => !state)}
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '1px solid rgba(127,127,127,.4)',
          background: 'rgba(30,30,32,.85)',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: 16,
          boxShadow: '0 4px 16px rgba(0,0,0,.35)',
        }}
      >
        🛡
      </button>
    </div>
  )
}
