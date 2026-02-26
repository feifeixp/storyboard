/**
 * 九宫格分镜草图提示词模板
 * 用于生成九宫格分镜草图的提示词结构
 */

/**
 * 九宫格布局配置
 */
export const GRID_LAYOUT_TEMPLATE = `Create a professional storyboard sheet as a strict three-by-three grid (nine equal panels) on a single wide landscape canvas.

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

/**
 * 面板位置名称（避免数字，减少模型绘制数字的概率）
 */
export const PANEL_POSITION_NAMES = [
  'top left',
  'top center',
  'top right',
  'middle left',
  'center',
  'middle right',
  'bottom left',
  'bottom center',
  'bottom right',
] as const;

/**
 * 获取面板位置名称
 */
export function getPanelPositionName(idx: number): string {
  return PANEL_POSITION_NAMES[idx] || 'unknown panel';
}

/**
 * 静态镜头面板模板
 */
export function getStaticPanelTemplate(panelPos: string, sceneContent: string, angleInstruction: string): string {
  return `${panelPos} panel (still):
${angleInstruction ? angleInstruction + '\n' : ''}Scene content: ${sceneContent}
	IMPORTANT: Do NOT draw any text, labels, numbers, arrows, or captions inside the panel.`;
}

/**
 * 运动镜头面板模板
 */
export function getMotionPanelTemplate(panelPos: string, startFrame: string, endFrame: string, angleInstruction: string): string {
  return `${panelPos} panel (motion):
	${angleInstruction ? angleInstruction + '\n' : ''}Left half (start frame): ${startFrame}
	Right half (end frame): ${endFrame}
	IMPORTANT: Do NOT draw any text, labels, numbers, arrows, or captions inside the panel.`;
}

/**
 * 空面板模板
 */
export function getEmptyPanelTemplate(positionName: string): string {
  return `${positionName} panel: leave this panel blank with a plain neutral background (e.g., light gray). Absolutely no text.`;
}

/**
 * 构建完整九宫格提示词
 */
export interface NineGridPromptParams {
  allPanels: string;
  characterSection: string;
  sceneSection: string;
  artStyleSection: string;
  styleSuffix: string;
  styleName: string;
}

export function buildNineGridPrompt(params: NineGridPromptParams): string {
  return GRID_LAYOUT_TEMPLATE
    .replace('{{CHARACTER_SECTION}}', params.characterSection)
    .replace('{{SCENE_SECTION}}', params.sceneSection)
    .replace('{{ART_STYLE_SECTION}}', params.artStyleSection)
    .replace('{{STYLE_SUFFIX}}', params.styleSuffix)
    .replace('{{STYLE_NAME}}', params.styleName)
    .replace('{{ALL_PANELS}}', params.allPanels);
}
