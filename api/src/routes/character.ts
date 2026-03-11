import { Hono } from 'hono'
import type { Env } from '../index'
import { buildExtractCharactersPrompt } from '../../../prompts/extractCharactersPrompt'
import { callOpenAICompatibleAPI } from '../utils/llm'

const app = new Hono<Env>()

app.post('/extract', async (c) => {
    try {
        const { scriptContent, model = 'google/gemini-2.5-pro' } = await c.req.json()

        if (!scriptContent) {
            return c.json({ error: 'scriptContent is required' }, 400)
        }

        // 1. Build the prompt
        const prompt = buildExtractCharactersPrompt(scriptContent)

        // 2. Call the LLM
        const apiKey = c.env.OPENROUTER_API_KEY
        if (!apiKey) {
            return c.json({ error: 'Server missing OPENROUTER_API_KEY' }, 500)
        }

        const responseContent = await callOpenAICompatibleAPI(
            'https://openrouter.ai/api/v1/chat/completions',
            apiKey,
            model,
            prompt
        )

        // 3. Parse JSON array
        let characters = []
        try {
            // Find the JSON array inside markdown codeblocks or raw output
            const jsonMatch = responseContent.match(/\\[\\s\\S]*?\\]/)
            if (jsonMatch) {
                characters = JSON.parse(jsonMatch[0])
            } else {
                characters = JSON.parse(responseContent)
            }
        } catch (e) {
            return c.json({ error: 'Failed to parse LLM output as JSON', raw: responseContent }, 500)
        }

        return c.json({ characters })

    } catch (error: any) {
        console.error('Character Extraction Error:', error)
        return c.json({ error: error.message || 'Internal Server Error' }, 500)
    }
})

export default app
