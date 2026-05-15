import { Hono } from 'hono'

const app = new Hono()
const NEODOMAIN_API_BASE = 'https://story.neodomain.cn'

app.all('/*', async (c) => {
    try {
        const path = c.req.path.replace(/^\/api\/v1\/neodomain/, '')
        const url = new URL(NEODOMAIN_API_BASE + path)
        url.search = new URL(c.req.url).search
        
        const headers = new Headers()
        const token = c.req.header('accessToken')
        if (token) headers.set('accessToken', token)
        
        const contentType = c.req.header('Content-Type')
        if (contentType) headers.set('Content-Type', contentType)

        let body
        if (['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
            body = await c.req.arrayBuffer()
        }

        const response = await fetch(url.toString(), {
            method: c.req.method,
            headers,
            body
        })

        const data = await response.arrayBuffer()
        
        return new Response(data, {
            status: response.status,
            headers: {
                'Content-Type': response.headers.get('Content-Type') || 'application/json'
            }
        })
    } catch (e: any) {
        return c.json({ success: false, errMessage: e.message }, 500)
    }
})

export default app
