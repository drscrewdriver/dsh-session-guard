#requires -Version 5.1
<#
.SYNOPSIS
  Read-only API-drift guard for dsh-session-guard.

.DESCRIPTION
  Asserts that every upstream interface this plugin depends on still exists in each
  DSH tag we claim to support. Nothing is written; only `git grep` / `git show` run.

  Required (a miss is a FAILURE):
    - `agent/request` waterfall + payload `{ agent, ... }`
    - `session/event` `request/header`
    - `settings.register` and `settings.get(ns)`
    - `llm.listConfigurableProviders()`
    - `llm-deepseek` directory entry (`settingsNs: 'llm-deepseek'`, `settingsPath: []`)
    - pi-ai directory entry (`settingsPath: ['providers', <id>]`)
  Record-only (printed, never fails):
    - `model/selection` (0.1.2+ only; the plugin feature-probes it)

  Also asserts this plugin's own source never reaches for the two APIs that drift
  (`settings.installSection` / `settings.installSettingsSection`).

.EXAMPLE
  pwsh -File tools/check-api-drift.ps1
  pwsh -File tools/check-api-drift.ps1 -Repo D:\dsh-repo
#>
[CmdletBinding()]
param(
  [string]$Repo = 'E:\test\rewrite-agently\dsh-repo',
  [string[]]$Tags = @('dsh-v0.1.1-rc.2', 'dsh-v0.1.2-rc.1', 'dsh-v0.1.3-alpha.2', 'dsh-v0.1.5-alpha.1'),
  [string]$PluginRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$failures = New-Object System.Collections.Generic.List[string]

if (-not (Test-Path -LiteralPath (Join-Path $Repo '.git'))) {
  Write-Host "SKIP  repo not found: $Repo" -ForegroundColor Yellow
  exit 2
}

function Test-GitGrep {
  param([string]$Tag, [string]$Pattern, [string]$Path)
  git -C $Repo grep -q -e $Pattern $Tag -- $Path 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}

function Assert-Interface {
  param([string]$Tag, [string]$Label, [string]$Pattern, [string]$Path)
  if (Test-GitGrep -Tag $Tag -Pattern $Pattern -Path $Path) {
    Write-Host ("  PASS  {0}" -f $Label) -ForegroundColor Green
  } else {
    Write-Host ("  FAIL  {0}  (pattern '{1}' not found in {2})" -f $Label, $Pattern, $Path) -ForegroundColor Red
    $failures.Add("$Tag :: $Label")
  }
}

function Get-Note {
  param([string]$Tag, [string]$Pattern, [string]$Path)
  if (Test-GitGrep -Tag $Tag -Pattern $Pattern -Path $Path) { return 'present' }
  return 'absent'
}

foreach ($tag in $Tags) {
  Write-Host ""
  Write-Host "== $tag ==" -ForegroundColor Cyan
  Assert-Interface $tag 'agent/request waterfall' "agent/request" 'packages/core/agent-loop/src/agent.ts'
  Assert-Interface $tag 'agent/request payload carries agent' "agent: Agent; turn: number; step: number; signal: AbortSignal" 'packages/core/agent/src/runtime-types.ts'
  Assert-Interface $tag 'request/header session event' "request/header" 'packages/core/agent-loop/src/agent.ts'
  Assert-Interface $tag 'settings.register' "register<" 'packages/settings/settings/src/index.ts'
  Assert-Interface $tag 'settings.get(ns)' "get" 'packages/settings/settings/src/index.ts'
  Assert-Interface $tag 'llm.listConfigurableProviders' "listConfigurableProviders" 'packages/llm/llm/src/index.ts'
  Assert-Interface $tag 'llm-deepseek directory entry' "settingsPath: \[\]" 'packages/llm/llm-deepseek/src/index.ts'
  Assert-Interface $tag 'llm-deepseek registers directory' "registerConfigurableProviders" 'packages/llm/llm-deepseek/src/index.ts'
  Assert-Interface $tag 'pi-ai directory entry' "settingsPath: \['providers', provider\]" 'packages/llm/llm-pi-ai/src/index.ts'

  $modelSelection = Get-Note $tag "model/selection" 'packages/api/session-controller/src/agent.ts'
  Write-Host ("  NOTE  model/selection: {0} (optional, feature-probed)" -f $modelSelection) -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "== plugin source discipline ==" -ForegroundColor Cyan
$srcDir = Join-Path $PluginRoot 'src'
foreach ($banned in @('installSettingsSection', 'installSection')) {
  $hits = Select-String -Path (Join-Path $srcDir '*.js') -Pattern $banned -SimpleMatch -ErrorAction SilentlyContinue
  if ($null -ne $hits -and $hits.Count -gt 0) {
    Write-Host ("  FAIL  src references {0}" -f $banned) -ForegroundColor Red
    $failures.Add("plugin :: $banned")
  } else {
    Write-Host ("  PASS  src does not reference {0}" -f $banned) -ForegroundColor Green
  }
}

$valueImports = Select-String -Path (Join-Path $srcDir '*.js') -Pattern "^import .* from '@deepseek-ai/(?!schemastery)" -ErrorAction SilentlyContinue
if ($null -ne $valueImports -and $valueImports.Count -gt 0) {
  Write-Host "  FAIL  value import of a platform package (only @deepseek-ai/schemastery is allowed)" -ForegroundColor Red
  $failures.Add('plugin :: platform value import')
} else {
  Write-Host "  PASS  no platform value imports besides @deepseek-ai/schemastery" -ForegroundColor Green
}

Write-Host ""
if ($failures.Count -eq 0) {
  Write-Host "API DRIFT OK - all required interfaces present on $($Tags.Count) tag(s)" -ForegroundColor Green
  exit 0
}
Write-Host ("API DRIFT FAILED - {0} issue(s):" -f $failures.Count) -ForegroundColor Red
foreach ($f in $failures) { Write-Host "  - $f" -ForegroundColor Red }
exit 1
