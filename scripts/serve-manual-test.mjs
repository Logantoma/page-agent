import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const publicRoot = resolve(repoRoot, 'packages/website/public')
const port = Number(process.env.PORT || 4173)
const host = '127.0.0.1'

const mimeTypes = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
}

function resolvePath(urlPath) {
	const decoded = decodeURIComponent((urlPath || '/').split('?')[0])
	const relative = normalize(decoded).replace(/^([/\\])+/, '')
	const candidate = resolve(publicRoot, relative || 'index.html')
	if (!candidate.startsWith(publicRoot)) return null
	if (existsSync(candidate) && statSync(candidate).isDirectory()) return join(candidate, 'index.html')
	return candidate
}

const server = createServer((req, res) => {
	const filePath = resolvePath(req.url)
	if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
		res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
		res.end('Not found')
		return
	}

	res.writeHead(200, {
		'content-type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
		'cache-control': 'no-store',
	})
	createReadStream(filePath).pipe(res)
})

server.listen(port, host, () => {
	console.log(`Manual test server: http://${host}:${port}/`)
	console.log(`Footprint test: http://${host}:${port}/manual-test/inpage-ui-document-footprint.html`)
})
