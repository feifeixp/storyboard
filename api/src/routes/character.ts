import { Hono } from 'hono'
import type { Env } from '../index'
import { buildExtractCharactersPrompt } from '../../../prompts/extractCharactersPrompt'
import { callOpenAICompatibleAPI } from '../utils/llm'

const app = new Hono<Env>()

app.post('/extract', async (c) => {
    try {
        const { scriptContent, model = 'gemini-2.5-flash' } = await c.req.json()

        if (!scriptContent) {
            return c.json({ error: 'scriptContent is required' }, 400)
        }

        // 1. Build the prompt
        const prompt = buildExtractCharactersPrompt(scriptContent)

        // 2. Call the LLM
        const apiKey = c.env.VITE_OPENROUTER1_API_KEY
        if (!apiKey) {
            return c.json({ error: 'Server missing VITE_OPENROUTER1_API_KEY' }, 500)
        }

        const responseContent = await callOpenAICompatibleAPI(
            'https://ai-api.neodomain.cn/v1/chat/completions',
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

// === Generate Character Reference Sheet (Avatar + 3-Views) ===
app.post('/generate-reference', async (c) => {
    try {
        const body = await c.req.json()
        const { name, appearance, visualStyle = "Rough Sketch", backgroundDescription = "Clean white background" } = body
        const accessToken = c.req.header('accessToken') || c.req.header('Authorization')?.split(' ')[1]

        if (!name || !appearance) {
            return c.json({ success: false, message: 'Missing character name or appearance description' }, 400)
        }

        if (!accessToken) {
            return c.json({ success: false, message: 'Missing accessToken' }, 401)
        }

        const API_BASE_URL = 'https://story.neodomain.cn'

        // 1. Construct the detailed prompt enforcing the reference sheet style
        const imagePrompt = `Character reference sheet, ${name}, ${appearance}, turnaround, multiple views, front view, side view, back view, headshot avatar, concept art, masterpiece, highest quality. Note: Art style MUST be ${visualStyle}. Background context: ${backgroundDescription}.`

        // 1.5 Fetch dynamic available models for scenarioType=4 (Design/Avatar) or 1 (General)
        let modelName = 'gemini-3.0-flash-image'
        try {
            const modelsRes = await fetch(`${API_BASE_URL}/agent/ai-image-generation/models/by-scenario?scenarioType=4`, {
                method: 'GET',
                headers: { 'accessToken': accessToken }
            })
            const modelsData: any = await modelsRes.json()
            if (modelsData.success && modelsData.data && modelsData.data.length > 0) {
                // Find a default design model, or fallback to the first available model
                const defaultModel = modelsData.data.find((m: any) => m.is_default_design_model)
                if (defaultModel) {
                    modelName = defaultModel.model_name
                } else {
                    modelName = modelsData.data[0].model_name
                }
                console.log(`[Generate-Reference] Fetched dynamic model: ${modelName}`)
            } else {
                console.warn('[Generate-Reference] Failed to fetch dynamic models from scenarioType=4, attempting scenarioType=1...')
                // Fallback to scenario 1
                const fallbackModelsRes = await fetch(`${API_BASE_URL}/agent/ai-image-generation/models/by-scenario?scenarioType=1`, {
                    method: 'GET',
                    headers: { 'accessToken': accessToken }
                })
                const fallbackModelsData: any = await fallbackModelsRes.json()
                if (fallbackModelsData.success && fallbackModelsData.data && fallbackModelsData.data.length > 0) {
                    modelName = fallbackModelsData.data[0].model_name
                    console.log(`[Generate-Reference] Fetched fallback dynamic model: ${modelName}`)
                }
            }
        } catch (e) {
            console.error('[Generate-Reference] Error fetching dynamic model list:', e)
        }

        // 2. Submit the generation request
        const generateReqBody = {
            prompt: imagePrompt,
            modelName: modelName, // Dynamically assigned model
            numImages: "1",
            sourceType: "character_reference"
        }

        const generateRes = await fetch(`${API_BASE_URL}/agent/ai-image-generation/generate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'accessToken': accessToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(generateReqBody)
        })

        const generateData: any = await generateRes.json()
        
        console.log('[Generate-Reference] POST Submit Response:', JSON.stringify(generateData, null, 2))

        if (!generateData.success || !generateData.data || !generateData.data.task_code) {
            return c.json({ 
                success: false, 
                message: 'Failed to submit image generation task', 
                error: generateData.errMessage,
                rawResponse: generateData
            }, 500)
        }

        const taskCode = generateData.data.task_code
        console.log(`[Generate-Reference] Task Code Received: ${taskCode}. Starting polling...`)

        // 3. Block and Poll for the Result (Max 60 seconds)
        // Cloudflare Workers CPU time is strict, but awaiting promises (I/O wait) is very cheap and usually permitted for around 30-100s depending on the plan.
        const maxRetries = 20
        const intervalMs = 3000

        for (let i = 0; i < maxRetries; i++) {
            await new Promise(resolve => setTimeout(resolve, intervalMs))

            const resultRes = await fetch(`${API_BASE_URL}/agent/ai-image-generation/result/${taskCode}`, {
                method: 'GET',
                headers: {
                    'accessToken': accessToken
                }
            })

            const resultData: any = await resultRes.json()
            console.log(`[Generate-Reference] Polling attempt ${i+1}:`, JSON.stringify(resultData, null, 2))

            if (resultData.success && resultData.data) {
                if (resultData.data.status === 'SUCCESS') {
                    return c.json({
                        success: true,
                        message: 'Character reference sheet generated successfully',
                        imageUrls: resultData.data.image_urls
                    })
                }

                if (resultData.data.status === 'FAILED') {
                    return c.json({
                        success: false,
                        message: 'Image generation task failed during processing',
                        error: resultData.data.failure_reason || resultData.errMessage,
                        rawResponse: resultData
                    }, 500)
                }
            }
            // If PENDING, loop continues
        }

        return c.json({
            success: false,
            message: 'Image generation timed out after 60 seconds polling.',
        }, 504)

    } catch (error: any) {
        return c.json({
            success: false,
            message: 'Internal server error while generating reference sheet',
            error: error.message
        }, 500)
    }
})

export default app
