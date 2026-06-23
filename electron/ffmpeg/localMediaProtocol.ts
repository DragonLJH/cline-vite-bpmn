import { net, protocol } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { pathToFileURL } from 'url'

export function resolveLocalMediaPath(requestUrl: string): string {
  const parsed = new URL(requestUrl)

  let filePath = decodeURIComponent(parsed.pathname || '')
  if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(filePath)) {
    filePath = filePath.slice(1)
  }
  if (filePath) {
    return path.normalize(filePath)
  }

  if (parsed.hostname) {
    const legacy = decodeURIComponent(`${parsed.hostname}${parsed.pathname || ''}`)
    return path.normalize(legacy)
  }

  const raw = requestUrl.replace(/^local-media:\/\//i, '')
  return path.normalize(decodeURIComponent(raw))
}

export function registerLocalMediaProtocol(): void {
  protocol.handle('local-media', async (request) => {
    try {
      const filePath = resolveLocalMediaPath(request.url)
      if (!fs.existsSync(filePath)) {
        return new Response(null, { status: 404, statusText: 'Not Found' })
      }
      return net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response(null, { status: 500, statusText: 'Internal Server Error' })
    }
  })
}
