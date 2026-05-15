import { Hono } from 'hono'

const app = new Hono()

const NEODOMAIN_API_BASE = 'https://story.neodomain.cn'

// 🆕 登录相关 API 代理
app.post('/oauth/authorize', async (c) => {
    try {
        const body = await c.req.json()
        const url = `${NEODOMAIN_API_BASE}/user/oauth/authorize?clientId=${encodeURIComponent(body.clientId)}&redirectUri=${encodeURIComponent(body.redirectUri)}&responseType=code&state=${encodeURIComponent(body.state)}`
        const response = await fetch(url)
        const data = await response.json()
        return c.json(data, response.status as any)
    } catch (e: any) {
        return c.json({ success: false, errMessage: e.message }, 500)
    }
})

app.post('/oauth/token', async (c) => {
    try {
        const body = await c.req.json()
        const response = await fetch(`${NEODOMAIN_API_BASE}/user/oauth/token`, {
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

app.post('/ark-asset-review/submit', async (c) => {
    try {
        const body = await c.req.json()
        const token = c.req.header('accessToken') || ''
        const response = await fetch(`${NEODOMAIN_API_BASE}/agent/ark-asset-review/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'accessToken': token },
            body: JSON.stringify(body)
        })
        const data = await response.json()
        return c.json(data, response.status as any)
    } catch (e: any) {
        return c.json({ success: false, errMessage: e.message }, 500)
    }
})

app.get('/user/points/info', async (c) => {
    try {
        const token = c.req.header('accessToken') || ''
        const response = await fetch(`${NEODOMAIN_API_BASE}/agent/user/points/info`, {
            method: 'GET',
            headers: { 'accessToken': token }
        })
        const data = await response.json()
        return c.json(data, response.status as any)
    } catch (e: any) {
        return c.json({ success: false, errMessage: e.message }, 500)
    }
})

export default app
