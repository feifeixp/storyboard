import { Hono } from 'hono'
import type { Env } from '../index'
import { buildExtractImagePromptsPrompt } from '../../../prompts/extractImagePromptsPrompt'
import { callOpenAICompatibleAPI } from '../utils/llm'

const app = new Hono<Env>()

app.post('/generate-video-prompts', async (c) => {
    try {
        const { shots, model = 'google/gemini-2.5-pro' } = await c.req.json()

        if (!shots || !Array.isArray(shots)) {
            return c.json({ error: 'shots array is required' }, 400)
        }

        // 1. Build the prompt
        const prompt = buildExtractImagePromptsPrompt(shots as any)

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
        let generatedPrompts = []
        try {
            const jsonMatch = responseContent.match(/\\[\\s\\S]*?\\]/)
            if (jsonMatch) {
                generatedPrompts = JSON.parse(jsonMatch[0])
            } else {
                generatedPrompts = JSON.parse(responseContent)
            }
        } catch (e) {
            return c.json({ error: 'Failed to parse LLM output as JSON', raw: responseContent }, 500)
        }

        return c.json({ prompts: generatedPrompts })

    } catch (error: any) {
        console.error('Prompt Generation Error:', error)
        return c.json({ error: error.message || 'Internal Server Error' }, 500)
    }
})

export default app
