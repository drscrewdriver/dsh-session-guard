/**
 * dsh-session-guard — 客户端样式（与 composer 右侧 input-traffic 冻结按钮同一视觉语言）。
 *
 * 为什么注入 `<style>` 而不是 CSS Modules：本插件的 tsdown 配置没有 CSS Modules 管线
 * （input-traffic 有），而 settings-card 已经用 `<style data-plugin-css>` 的既有约定。
 * 这里只做一件事：把「暂停会话 / 继续会话」按钮与状态徽标对齐到同一行的其它控件
 * （高度 24px、圆角 6px、12px 字号、同样的 border / hover / pressed 令牌）。
 */

/** 与 `dsh-input-traffic/src/client/freeze-button.module.css` 对齐的控件外观。 */
export const CLIENT_CSS = `
.sg-pause{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;line-height:1;cursor:pointer;white-space:nowrap;flex:none}
.sg-pause:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04))}
.sg-pause:disabled{opacity:.55;cursor:default}
.sg-pause[aria-pressed='true']{border-color:var(--dsw-alias-state-warning-primary,#d97706);color:var(--dsw-alias-state-warning-primary,#d97706);background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#d97706) 8%,transparent)}
.sg-status{display:inline-flex;align-items:center;height:24px;padding:0 8px;border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));border-radius:6px;font-size:12px;line-height:1;color:var(--dsw-alias-label-secondary,#6b7280);white-space:nowrap;flex:none}
.sg-status.sg-peak{border-color:var(--dsw-alias-state-warning-primary,#d97706);color:var(--dsw-alias-state-warning-primary,#d97706)}
.sg-status.sg-weekend{border-color:var(--dsw-alias-state-success-primary,#30a46c);color:var(--dsw-alias-state-success-primary,#30a46c)}
`

/** 注入一次（幂等；无 document 时静默跳过）。 */
export function injectClientCss(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-plugin-css="session-guard-client"]') !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-session-guard'
  tag.dataset.pluginCss = 'session-guard-client'
  tag.textContent = CLIENT_CSS
  document.head.appendChild(tag)
}
