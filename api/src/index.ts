import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import characterRoutes from './routes/character'
import scriptRoutes from './routes/script'
import promptRoutes from './routes/prompts'

import authRoutes from './routes/auth'
import storyboardRoutes from './routes/storyboard'

export type Env = {
    Bindings: {
        VITE_OPENROUTER1_API_KEY: string;
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

// === OpenClaw API Authentication Middleware ===
// Intercept all API requests to validate the user's accessToken against Neodomain's backend
app.use('/api/*', async (c, next) => {
    // Bypass authentication for login and send-code routes
    if (c.req.path.startsWith('/api/v1/auth')) {
        return next();
    }

    const authHeader = c.req.header('Authorization');
    const customTokenHeader = c.req.header('accessToken');
    
    let userToken = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
        userToken = authHeader.split(' ')[1];
    } else if (customTokenHeader) {
        userToken = customTokenHeader;
    }

    if (!userToken) {
        return c.json({ error: 'Unauthorized', message: 'Token is empty or missing.' }, 401);
    }

    try {
        // Send a probe request to Neodomain API to verify if the token is valid for a logged-in user
        const probeRes = await fetch('https://story.neodomain.cn/agent/user/points/info', {
            method: 'GET',
            headers: {
                'accessToken': userToken
            }
        });

        const probeData: any = await probeRes.json();
        
        // If the backend rejects the token, block the OpenClaw request
        if (!probeData || probeData.success !== true) {
            console.warn('API Key Validation Failed:', probeData.errMessage);
            return c.json({ 
                error: 'Unauthorized', 
                message: probeData.errMessage || 'Invalid API Key or expired account session. Please login to get a new accessToken.' 
            }, 401);
        }

        // Token is valid! Allow the request to pass to the Skill handlers.
        await next();
        
    } catch (e: any) {
        console.error('Authentication backend probe failed:', e);
        return c.json({ 
            error: 'Authentication Server Error', 
            message: 'Failed to validate API Key against the Neodomain authentication server.' 
        }, 500);
    }
});

// Register skill routes
app.route('/api/v1/auth', authRoutes)
app.route('/api/v1/characters', characterRoutes)
app.route('/api/v1/script', scriptRoutes)
app.route('/api/v1/prompts', promptRoutes)
app.route('/api/v1/storyboard', storyboardRoutes)

export default app
