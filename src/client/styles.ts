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
export const CLIENT_CSS = `
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
