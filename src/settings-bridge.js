/**
 * dsh-session-guard — settings webServer 桥（M4/T20-b 泛化）。
 *
 * 设置卡双轨数据源的桥轨：≤0.1.5（settingsScope fiber 永不解 / 0.1.0-0.1.1 无
 * client 服务）时，client BridgeDocHandle 经 describe/mutate 两端点读写宿主
 * settings 服务。桥只是 HTTP 皮：读 = svc.describe 取自家 ns 描述符；写 =
 * svc.mutate 转 ops 落宿主服务（不落第二份状态）；mutate 成功即 describe 回填，
 * 带 expectedRevision 乐观并发。守卫：POST-only + redactSecrets + 256KB。
 * 语义与 perm-gate src/bridge.ts（5260fe6 泛化）逐字对齐，本仓为 JS 形态。
 */

/** 一个 settings ns 的桥路由对——client 侧（src/client/settings-bridge.ts）必须同式派生（测试钉死一致）。 */
function settingsBridgeRoutesFor(ns) {
  return { describe: `/api/${ns}/settings/describe`, mutate: `/api/${ns}/settings/mutate` }
}

function readJsonBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buf.length
      if (size > limit) {
        reject(new Error('bridge body too large'))
        if (typeof req.resume === 'function') req.resume()
        return
      }
      chunks.push(buf)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (raw === '') {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' })
  res.end(JSON.stringify(body))
}

function isConflict(e) {
  return e instanceof Error && /conflict|revision/i.test(e.message)
}

function describeNs(svc, ns) {
  return svc.describe({ redactSecrets: true }).find((d) => d.ns === ns)
}

/**
 * 注册 describe/mutate 两端点（kind:'exact'）。
 * @param {unknown} server 宿主 webServer 服务（须有 register(kind,path,handler)）
 * @param {() => unknown} getSettingsSvc 惰性取宿主 settings 服务（cordis ctx.get 永不 throw，可安全常取）
 * @param {string} ns 自家 settings 命名空间
 * @returns {Array<() => void>} 注销函数数组
 */
export function registerSettingsBridgeRoutes(server, getSettingsSvc, ns) {
  if (typeof server !== 'object' || server === null) return []
  const ws = typeof server.register === 'function' ? server : undefined
  if (ws === undefined) return []
  const offs = []
  const routes = settingsBridgeRoutesFor(ns)

  offs.push(ws.register({
    kind: 'exact',
    path: routes.describe,
    handler: (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, code: 'method-not-allowed' })
        return
      }
      const svc = getSettingsSvc()
      if (svc === undefined || svc === null || typeof svc.describe !== 'function') {
        sendJson(res, 200, { ok: false, code: 'settings-unavailable', message: 'settings service not resolved yet' })
        return
      }
      try {
        const descriptor = describeNs(svc, ns)
        if (descriptor === undefined) {
          sendJson(res, 200, { ok: false, code: 'ns-not-registered', message: `settings namespace "${ns}" is not registered` })
          return
        }
        sendJson(res, 200, { ok: true, value: { descriptor, writable: svc.writable !== false } })
      } catch (e) {
        sendJson(res, 200, { ok: false, code: 'internal', message: e instanceof Error ? e.message : String(e) })
      }
    },
  }))

  offs.push(ws.register({
    kind: 'exact',
    path: routes.mutate,
    handler: (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, code: 'method-not-allowed' })
        return
      }
      const svc = getSettingsSvc()
      if (svc === undefined || svc === null || typeof svc.mutate !== 'function') {
        sendJson(res, 200, { ok: false, code: 'settings-unavailable', message: 'settings service mutate not available' })
        return
      }
      readJsonBody(req).then((body) => {
        const ops = body.ops
        const valid = Array.isArray(ops) && ops.every((op) => op !== null && typeof op === 'object' && (op.op === 'set' || op.op === 'unset'))
        if (!valid) {
          sendJson(res, 200, { ok: false, code: 'settings-rejected', message: 'malformed bridge mutate ops' })
          return
        }
        const expectedRevision = typeof body.expectedRevision === 'number' ? body.expectedRevision : undefined
        svc.mutate(ns, ops, expectedRevision).then(() => {
          // mutate 成功即 describe 回填（写路径归口宿主服务，无第二份状态）
          const descriptor = describeNs(svc, ns)
          if (descriptor === undefined) {
            sendJson(res, 200, { ok: false, code: 'internal', message: `namespace "${ns}" disposed after mutate` })
            return
          }
          sendJson(res, 200, { ok: true, value: { descriptor } })
        }).catch((e) => {
          sendJson(res, 200, isConflict(e)
            ? { ok: false, code: 'settings-conflict', message: e instanceof Error ? e.message : String(e) }
            : { ok: false, code: 'internal', message: e instanceof Error ? e.message : String(e) })
        })
      }).catch((e) => {
        sendJson(res, 200, { ok: false, code: 'bad-request', message: e instanceof Error ? e.message : String(e) })
      })
    },
  }))

  return offs
}
