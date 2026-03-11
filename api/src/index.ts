import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import characterRoutes from './routes/character'
import scriptRoutes from './routes/script'
import promptRoutes from './routes/prompts'

export type Env = {
    Bindings: {
        OPENROUTER_API_KEY: string;
        GEMINI_API_KEY: string;
        DEEPSEEK_API_KEY: string;
    }
}

const app = new Hono<Env>()

app.use('*', logger())
app.use('*', cors())

app.get('/', (c) => {
    return c.text('Visionary Storyboard Studio - OpenClaw API Service is running!')
})

// Register skill routes
app.route('/api/v1/characters', characterRoutes)
app.route('/api/v1/script', scriptRoutes)
app.route('/api/v1/prompts', promptRoutes)

export default app
