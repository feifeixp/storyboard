import { Hono } from 'hono'
import type { Env } from '../index'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { Buffer } from 'node:buffer'
import { AwsClient } from 'aws4fetch'

// We need these templates but since they are simple strings we can just import them
// from the frontend, but we'll reimplement the builder manually to avoid frontend tight coupling (like auth/localStorage).
const GRID_LAYOUT_TEMPLATE = `Create a professional storyboard sheet as a strict three-by-three grid (nine equal panels) on a single wide landscape canvas.

================================================================================
LAYOUT (MUST FOLLOW)
================================================================================
	- The canvas is divided into exactly three columns and three rows.
	- All panels are EXACTLY the same size (equal width and equal height).
	- The grid must fill the entire canvas edge-to-edge: NO title area, NO page header/footer, NO margins, NO extra whitespace.
	- Use thin, uniform panel separators (optional) to make the grid clear, but do NOT add any labels.
	- Panel lines must be perfectly straight and axis-aligned (no perspective tilt, no irregular comic panels).

================================================================================
ABSOLUTE PROHIBITIONS (CRITICAL)
================================================================================
- NO text, NO words, NO numbers, NO captions, NO subtitles, NO labels, NO UI overlays.
- NO watermark, NO signature, NO logo, NO page number, NO frame index.
- Do not draw any Chinese or English characters anywhere.

{{CHARACTER_SECTION}}{{SCENE_SECTION}}{{ART_STYLE_SECTION}}

================================================================================
PANELS (CONTENT ONLY — DO NOT WRITE ANY TEXT ON THE IMAGE)
================================================================================

{{ALL_PANELS}}

================================================================================
STYLE
================================================================================
- Visual style: {{STYLE_SUFFIX}}
- Keep all panels consistent in {{STYLE_NAME}} style.
- For motion panels: split the panel vertically into two equal halves (left = start frame, right = end frame). No arrows, no text.
- Follow each panel's requested camera angle strictly.
- Keep the same character recognizable and consistent across panels.`;

const PANEL_POSITION_NAMES = [
  'top left', 'top center', 'top right',
  'middle left', 'center', 'middle right',
  'bottom left', 'bottom center', 'bottom right',
];

const app = new Hono<Env>()
const API_BASE_URL = 'https://story.neodomain.cn'

// === Helper: Fetch OSS STS Token ===
async function getSTSToken(accessToken: string) {
    const response = await fetch(`${API_BASE_URL}/agent/sts/oss/token`, {
        method: 'GET',
        headers: {
            'accessToken': accessToken,
        },
    });
    const result: any = await response.json();
    if (!result.success || !result.data) {
        throw new Error(result.errMessage || 'Failed to get OSS token');
    }
    return result.data;
}

// === 1. Generate 9-Grid Storyboard ===
app.post('/generate-grid', async (c) => {
    try {
        const body = await c.req.json()
        const { shots, styleName = "Rough Sketch", styleSuffix = "rough sketch, black and white, storyboard style", characterSection = "", sceneSection = "", artStyleSection = "" } = body
        const accessToken = c.req.header('accessToken') || c.req.header('Authorization')?.split(' ')[1]

        if (!accessToken) return c.json({ success: false, message: 'Missing accessToken' }, 401)
        if (!shots || !Array.isArray(shots) || shots.length === 0) {
            return c.json({ success: false, message: 'Missing or empty shots array' }, 400)
        }

        // Build the Panels part of the prompt
        let allPanels = "";
        for (let i = 0; i < 9; i++) {
            const pos = PANEL_POSITION_NAMES[i];
            if (i < shots.length) {
                const shot = shots[i];
                allPanels += `${pos} panel: \n  Scene content: ${shot.description || shot.storyBeat || 'Blank'}\n  Angle instruction: ${shot.cameraAngle || 'Eye level'}\n  IMPORTANT: Do NOT draw any text, labels, numbers, arrows, or captions inside the panel.\n\n`;
            } else {
                allPanels += `${pos} panel: leave this panel blank with a plain neutral background.\n\n`;
            }
        }

        const imagePrompt = GRID_LAYOUT_TEMPLATE
            .replace('{{CHARACTER_SECTION}}', characterSection)
            .replace('{{SCENE_SECTION}}', sceneSection)
            .replace('{{ART_STYLE_SECTION}}', artStyleSection)
            .replace('{{STYLE_SUFFIX}}', styleSuffix)
            .replace('{{STYLE_NAME}}', styleName)
            .replace('{{ALL_PANELS}}', allPanels);

        // Fetch dynamic model
        let modelName = 'gemini-3.0-flash-image'
        try {
            const modelsRes = await fetch(`${API_BASE_URL}/agent/ai-image-generation/models/by-scenario?scenarioType=5`, { // Scenario 5 = Storyboard
                method: 'GET',
                headers: { 'accessToken': accessToken }
            })
            const modelsData: any = await modelsRes.json()
            if (modelsData.success && modelsData.data && modelsData.data.length > 0) {
                const defaultModel = modelsData.data.find((m: any) => m.is_default_shot_model)
                modelName = defaultModel ? defaultModel.model_name : modelsData.data[0].model_name
            }
        } catch (e) { console.error('[GridGen] Failed to fetch dynamic models', e) }

        // Start Generation Task
        const generateRes = await fetch(`${API_BASE_URL}/agent/ai-image-generation/generate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'accessToken': accessToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: imagePrompt,
                modelName: modelName,
                numImages: "1",
                aspectRatio: "16:9",
                size: "2K",
            })
        })

        const generateData: any = await generateRes.json()
        if (!generateData.success || !generateData.data || !generateData.data.task_code) {
            return c.json({ success: false, message: 'Failed to submit grid generation', error: generateData.errMessage }, 500)
        }

        const taskCode = generateData.data.task_code

        // Polling
        for (let i = 0; i < 25; i++) {
            await new Promise(resolve => setTimeout(resolve, 3000))
            const resultRes = await fetch(`${API_BASE_URL}/agent/ai-image-generation/result/${taskCode}`, {
                method: 'GET',
                headers: { 'accessToken': accessToken }
            })
            const resultData: any = await resultRes.json()
            if (resultData.success && resultData.data) {
                if (resultData.data.status === 'SUCCESS') {
                    return c.json({ success: true, imageUrls: resultData.data.image_urls })
                }
                if (resultData.data.status === 'FAILED') {
                    return c.json({ success: false, message: 'Grid generation failed', error: resultData.data.failure_reason }, 500)
                }
            }
        }

        return c.json({ success: false, message: 'Grid generation timed out' }, 504)

    } catch (e: any) {
        return c.json({ success: false, message: 'Internal server error', error: e.message }, 500)
    }
})

// === 2. Export PDF ===
app.post('/export-pdf', async (c) => {
    try {
        const body = await c.req.json()
        const { shots, title = "Storyboard Export" } = body
        const accessToken = c.req.header('accessToken') || c.req.header('Authorization')?.split(' ')[1]

        if (!accessToken) return c.json({ success: false, message: 'Missing accessToken' }, 401)
        if (!shots || !Array.isArray(shots)) return c.json({ success: false, message: 'Missing shots' }, 400)

        const pdfDoc = await PDFDocument.create()
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

        // Simple layout: 3 shots per A4 page (Portrait)
        const PAGE_WIDTH = 595.28;
        const PAGE_HEIGHT = 841.89;
        const MARGIN = 50;
        const SHOT_HEIGHT = 220;

        let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
        let yCursor = PAGE_HEIGHT - MARGIN

        // Title
        page.drawText(title, { x: MARGIN, y: yCursor, size: 24, font: fontBold })
        yCursor -= 40

        for (let i = 0; i < shots.length; i++) {
            const shot = shots[i]
            
            // Add new page if out of space
            if (yCursor < MARGIN + SHOT_HEIGHT) {
                page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
                yCursor = PAGE_HEIGHT - MARGIN
            }

            // Draw text side
            page.drawText(`Shot ${shot.shotNumber || (i+1)}: ${shot.shotSize || ''}`, { x: MARGIN + 220, y: yCursor - 20, size: 14, font: fontBold })
            
            // Description (handle basic text wrapping)
            const desc = shot.description || shot.storyBeat || ''
            // Truncate for simplicity in this basic remote PDF generator
            const cleanDesc = desc.replace(/[\u4e00-\u9fa5]/g, '').substring(0, 150) + (desc.length > 50 ? '...' : '') 
            page.drawText(cleanDesc, { x: MARGIN + 220, y: yCursor - 50, size: 10, font, maxWidth: 280 })

            // Embed Image if exists
            if (shot.imageUrl) {
                try {
                    const imgRes = await fetch(shot.imageUrl)
                    if (imgRes.ok) {
                        const imgBytes = await imgRes.arrayBuffer()
                        
                        let embeddedImage;
                        if (shot.imageUrl.toLowerCase().endsWith('.png') || shot.imageUrl.toLowerCase().includes('.png?')) {
                            embeddedImage = await pdfDoc.embedPng(imgBytes)
                        } else {
                            embeddedImage = await pdfDoc.embedJpg(imgBytes)
                        }

                        const imgDims = embeddedImage.scaleToFit(200, 150)
                        page.drawImage(embeddedImage, {
                            x: MARGIN,
                            y: yCursor - 170,
                            width: imgDims.width,
                            height: imgDims.height,
                        })
                    }
                } catch (e) {
                    console.error("Failed to embed image for shot", i, e)
                }
            }

            yCursor -= SHOT_HEIGHT
        }

        const pdfBytes = await pdfDoc.save()

        // Upload to OSS
        const stsToken = await getSTSToken(accessToken)
        const fileName = `storyboard/agent-exports/storyboard_${Date.now()}.pdf`
        const buffer = Buffer.from(pdfBytes)

        // Upload to OSS via AWS4 fetch (Cloudflare Worker compatible alternative to ali-oss)
        // Aliyun OSS supports AWS Signature Version 4
        const aws = new AwsClient({
            accessKeyId: stsToken.accessKeyId,
            secretAccessKey: stsToken.accessKeySecret,
            sessionToken: stsToken.securityToken,
            service: 's3',
            region: 'oss-cn-shanghai'
        })
        
        // Use virtual-hosted style endpoint
        const bucketUrl = `https://${stsToken.bucketName}.oss-cn-shanghai.aliyuncs.com/${fileName}`
        
        const uploadRes = await aws.fetch(bucketUrl, {
            method: 'PUT',
            body: buffer,
            headers: {
                'Content-Type': 'application/pdf',
            }
        });

        if (!uploadRes.ok) {
            const errText = await uploadRes.text();
            throw new Error(`OSS Upload Failed: ${uploadRes.status} - ${errText}`);
        }

        return c.json({
            success: true,
            pdfUrl: bucketUrl
        })
    } catch (e: any) {
        return c.json({ success: false, message: 'Internal server error', error: e.message }, 500)
    }
})

export default app
