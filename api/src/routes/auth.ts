import { Hono } from 'hono'

const app = new Hono()

const NEODOMAIN_API_BASE = 'https://story.neodomain.cn'

app.post('/send-code', async (c) => {
    try {
        const body = await c.req.json()
        const response = await fetch(`${NEODOMAIN_API_BASE}/user/login/send-unified-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        const data = await response.json()
        return c.json(data, response.status as any)
    } catch (e: any) {
        return c.json({ success: false, errMessage: e.message }, 500)
    }
})

app.post('/login', async (c) => {
    try {
        const body = await c.req.json()
        const response = await fetch(`${NEODOMAIN_API_BASE}/user/login/unified-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        const data = await response.json()
        return c.json(data, response.status as any)
    } catch (e: any) {
        return c.json({ success: false, errMessage: e.message }, 500)
    }
})

export default app
