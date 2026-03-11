import { Hono } from 'hono'
import type { Env } from '../index'
import { buildCleanScriptPrompt } from '../../../prompts/cleanScriptPrompt'
import { callOpenAICompatibleAPI } from '../utils/llm'

const app = new Hono<Env>()

app.post('/clean', async (c) => {
    try {
        const { scriptContent, model = 'google/gemini-2.5-pro' } = await c.req.json()

        if (!scriptContent) {
            return c.json({ error: 'scriptContent is required' }, 400)
        }

        // 1. Build the prompt
        const prompt = buildCleanScriptPrompt(scriptContent)

        // 2. Call the LLM
        const apiKey = c.env.OPENROUTER_API_KEY
        if (!apiKey) {
            return c.json({ error: 'Server missing OPENROUTER_API_KEY' }, 500)
        }

        // Usually DeepSeek handles script cleaning better as defined in your workflow
        const responseContent = await callOpenAICompatibleAPI(
            'https://openrouter.ai/api/v1/chat/completions',
            apiKey,
            model,
            prompt
        )

        // 3. Parse JSON object
        let cleanedData = {}
        try {
            const jsonMatch = responseContent.match(/\\{[\\s\\S]*\\}/)
            if (jsonMatch) {
                cleanedData = JSON.parse(jsonMatch[0])
            } else {
                cleanedData = JSON.parse(responseContent)
            }
        } catch (e) {
            return c.json({ error: 'Failed to parse LLM output as JSON', raw: responseContent }, 500)
        }

        return c.json(cleanedData)

    } catch (error: any) {
        console.error('Script Cleaning Error:', error)
        return c.json({ error: error.message || 'Internal Server Error' }, 500)
    }
})

export default app
