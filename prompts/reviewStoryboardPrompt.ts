import type { Shot } from '../types';

/**
 * 审核分镜脚本的提示词构建器
 * 用于 reviewStoryboardOpenRouter 函数
 */
export function buildReviewStoryboardPrompt(
  shots: Shot[],
  customCriteria: string,
  currentShotCount: number,
  shotCountWarning: string
): string {
  return `
  角色：资深动画导演 / 分镜审核专家

  ## 审核标准（用户自定义）
  ${customCriteria}
  ${shotCountWarning}

  ## 审核重点
  0. **🚨镜头数量**：当前共 ${currentShotCount} 个镜头。如果少于24个，必须在第一条建议中指出并要求增加！
  1. **叙事连贯性**：故事事件是否清晰？读者能否理解每个镜头在讲什么？
  2. **构图合理性**：景别、角度是否符合情绪？有没有过多的平视或中景？
  3. **动线清晰度**：角色的移动路径是否明确？是否遵守180度法则？
  4. **首尾帧质量**：对于需要动画的镜头，首帧和尾帧描述是否足够具体？
  5. **视觉多样性**：镜头是否有足够变化？避免连续相同的景别或角度
  6. **AI可生成性**：提示词是否避免了"8k"、"超写实"等不适合水墨风格的词汇？
  7. **🚨空间连续性**：
     - 相邻镜头的角色位置是否逻辑连贯（如A镜头右摇到B角色→B镜头必须以B角色开始）
     - 墙壁等环境参照物的方位是否一致（左侧墙/右侧墙是否跳轴）
     - 运动镜头的尾帧与下一镜头的首帧是否空间衔接
  8. **🚨提示词完整性**：
     - promptCn/promptEn是否包含完整信息（景别、角度、角色位置、动作、构图、光影）
     - 是否有模糊描述需要具体化（如"指着墙"→"手指向画面右侧墙面"）

  ## 输出要求
  - 所有内容必须使用**中文**输出
  - 返回JSON数组，每个建议包含：
    - shotNumber: 镜头编号（如"01"）或"GLOBAL"表示全局问题
    - suggestion: 具体修改建议（中文）
    - reason: 修改原因和理论依据（中文）
  - **如果镜头数量不足24个，第一条必须是镜头数量不足的建议！**

  ## 输出格式
  返回纯JSON数组，不要markdown代码块。示例：
  [
    {"shotNumber": "GLOBAL", "suggestion": "镜头数量不足！需要增加X个镜头", "reason": "标准90秒动画需要24-30个镜头"},
    {"shotNumber": "05", "suggestion": "将平视改为低角度仰拍", "reason": "此时敌人出现，低角度可以增加威胁感，符合Framed Ink的权力角度理论"},
    {"shotNumber": "12", "suggestion": "补充首帧描述，明确角色起始位置", "reason": "当前首帧描述过于简略，AI视频生成可能无法正确理解运动起点"}
  ]

  ## 分镜数据（共${currentShotCount}个镜头）
  ${JSON.stringify(shots)}
  `;
}

