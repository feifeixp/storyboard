/**
 * 术语常量定义 - 用于UI下拉菜单
 * 
 * 功能：提供所有标准术语的列表，用于表单输入
 * 依据：.augment/rules/核心规则汇总.md
 * 
 * 创建时间：2024-12-30
 */

/**
 * 景别选项（基础景别 + 特殊景别）
 */
export const SHOT_SIZE_OPTIONS = [
  // 基础景别（8种）
  { value: '特远景(ELS)', label: '特远景 - 广角镜头', description: '环境占主导，人物极小' },
  { value: '远景(LS)', label: '远景 - 远景拍摄', description: '环境占比更大（3:7），交代空间关系' },
  { value: '全景(FS)', label: '全景 - 全景拍摄', description: '人物和环境平衡（5:5），人物全身清晰' },
  { value: '中景(MS)', label: '中景 - 中景拍摄', description: '腰部以上，主体:环境=7:3' },
  { value: '近景(MCU)', label: '近景 - 近景拍摄', description: '胸部以上，主体:环境=8:2' },
  { value: '特写(CU)', label: '特写 - 特写拍摄', description: '肩部以上，主体:环境=9:1' },
  { value: '大特写(ECU)', label: '大特写 - 大特写拍摄', description: '面部局部（眼睛、嘴唇）占满画面' },
  { value: '局部特写(DS)', label: '局部特写 - 局部特写拍摄', description: '身体其他部位（手、脚、物品）占满画面' },
  
  // 特殊景别（3种）
  { value: '过肩镜头(OTS)', label: '过肩镜头', description: '对话场景' },
  { value: '双人镜头', label: '双人镜头', description: '对话、互动场景' },
  { value: '群像镜头', label: '群像镜头', description: '团队、集体场景' },
] as const;

/**
 * 角度高度选项
 */
export const ANGLE_HEIGHT_OPTIONS = [
  { value: '鸟瞰(Bird Eye)', label: '鸟瞰 - 航拍视角', description: '垂直俯视，极少用（<5%）' },
  { value: '极端俯拍(Extreme High)', label: '极端俯拍 - 从高处拍摄', description: '头顶突出，人物显矮小，少用' },
  { value: '中度俯拍(Moderate High)', label: '中度俯拍 - 从上方拍摄', description: '头顶略突出，常用' },
  { value: '轻微俯拍(Mild High)', label: '轻微俯拍 - 略微从上方拍摄', description: '头顶轮廓可见，常用（推荐）' },
  { value: '平视(Eye Level)', label: '平视 - 镜头水平视线', description: '正常比例，仅用于无情绪镜头（10-15%）' },
  { value: '轻微仰拍(Mild Low)', label: '轻微仰拍 - 略微从下方拍摄', description: '下巴轮廓略显，常用（推荐，默认选择）' },
  { value: '中度仰拍(Moderate Low)', label: '中度仰拍 - 从下方拍摄', description: '下巴突出，人物显高大，常用' },
  { value: '极端仰拍(Extreme Low)', label: '极端仰拍 - 从极低处拍摄', description: '下巴突出，鼻孔可见，少用' },
  { value: '虫视(Worm Eye)', label: '虫视 - 贴近地面仰视', description: '极度仰视，身体呈倒三角，少用' },
  { value: '荷兰角(Dutch Angle)', label: '荷兰角 - 镜头倾斜拍摄', description: '画面倾斜，少用' },
] as const;

/**
 * 人物朝向选项
 */
export const ANGLE_DIRECTION_OPTIONS = [
  { value: '正面(Front)', label: '正面 - 直视镜头', description: '极少用（≤7%）' },
  { value: '微侧正面(Slight Front)', label: '微侧正面 - 略微向右转', description: '新增，常用' },
  { value: '3/4正面(3/4 Front)', label: '3/4正面 - 轻微向右转', description: '最常用（推荐）' },
  { value: '1/3侧面(1/3 Side)', label: '1/3侧面 - 侧身轮廓带部分正面', description: '常用' },
  { value: '正侧面(Full Side)', label: '正侧面 - 右侧面轮廓', description: '常用' },
  { value: '1/3背面(1/3 Back)', label: '1/3背面 - 侧身轮廓带部分背面', description: '常用' },
  { value: '3/4背面(3/4 Back)', label: '3/4背面 - 大部分背对镜头', description: '常用' },
  { value: '背面(Back)', label: '背面 - 背对镜头', description: '常用' },
  { value: '主观视角(POV)', label: '主观视角 - 第一人称视角', description: '极少用（≤5%）' },
] as const;

/**
 * 透视类型选项
 */
export const PERSPECTIVE_OPTIONS = [
  { value: '一点透视', label: '一点透视', description: '走廊、隧道、街道（30-40%）' },
  { value: '两点透视', label: '两点透视', description: '建筑外观、街角（30-40%）' },
  { value: '三点透视向上', label: '三点透视向上', description: '仰视高耸建筑（15-25%）' },
  { value: '三点透视向下', label: '三点透视向下', description: '俯视眩晕感（15-25%）' },
] as const;

/**
 * 镜头类型选项
 */
export const LENS_TYPE_OPTIONS = [
  { value: '鱼眼镜头', label: '鱼眼镜头 - <16mm', description: '极端变形，极少用（<5%）' },
  { value: '广角镜头', label: '广角镜头 - 16-35mm', description: '空间纵深感强，少用（15-25%）' },
  { value: '标准镜头', label: '标准镜头 - 35-70mm', description: '自然透视，常用（50-60%）' },
  { value: '长焦镜头', label: '长焦镜头 - 70-200mm+', description: '空间压缩，少用（10-20%）' },
] as const;

/**
 * 光影效果选项
 */
export const LIGHTING_OPTIONS = [
  { value: '顶光', label: '顶光照明', description: '头顶亮，眼窝阴影' },
  { value: '侧光', label: '侧光照明', description: '半明半暗，立体感强' },
  { value: '逆光', label: '逆光照明', description: '剪影效果，轮廓光边' },
  { value: '环境光', label: '环境光照明', description: '自然光，柔和' },
  { value: '自然光', label: '自然光照明', description: '日光，真实' },
] as const;

/**
 * 运镜类型选项
 */
export const CAMERA_MOVE_OPTIONS = [
  { value: '固定镜头', label: '固定镜头 - 镜头固定不动', description: '聚焦动作、稳定画面' },
  { value: '推镜头', label: '推镜头 - 镜头向前推进', description: '聚焦细节、情绪升级' },
  { value: '拉镜头', label: '拉镜头 - 镜头向后拉远', description: '展示环境、情绪释放' },
  { value: '横摇镜头', label: '横摇镜头 - 镜头水平左右摇动', description: '展示空间宽度、跟随视线' },
  { value: '竖摇镜头', label: '竖摇镜头 - 镜头垂直上下摇动', description: '展示空间高度、揭示感' },
  { value: '移镜头', label: '移镜头 - 镜头平移跟随', description: '跟随动作、展示关系' },
  { value: '跟镜头', label: '跟镜头 - 镜头跟随主体', description: '追逐场景、动态展示' },
  { value: '升镜头', label: '升镜头 - 镜头向上升起', description: '展示规模、人物渺小感' },
  { value: '降镜头', label: '降镜头 - 镜头向下降落', description: '聚焦主体、压迫感' },
  { value: '环绕镜头', label: '环绕镜头 - 镜头环绕主体', description: '展示全貌、戏剧效果' },
] as const;

/**
 * 获取所有术语选项（用于AI提示词）
 */
export function getAllTerminologyOptions() {
  return {
    shotSize: SHOT_SIZE_OPTIONS.map(opt => opt.value),
    angleHeight: ANGLE_HEIGHT_OPTIONS.map(opt => opt.value),
    angleDirection: ANGLE_DIRECTION_OPTIONS.map(opt => opt.value),
    perspective: PERSPECTIVE_OPTIONS.map(opt => opt.value),
    lensType: LENS_TYPE_OPTIONS.map(opt => opt.value),
    lighting: LIGHTING_OPTIONS.map(opt => opt.value),
    cameraMove: CAMERA_MOVE_OPTIONS.map(opt => opt.value),
  };
}

/**
 * 获取术语的详细信息
 */
export function getTermInfo(term: string, type: 'shotSize' | 'angleHeight' | 'angleDirection' | 'perspective' | 'lensType' | 'lighting' | 'cameraMove') {
  const options = {
    shotSize: SHOT_SIZE_OPTIONS,
    angleHeight: ANGLE_HEIGHT_OPTIONS,
    angleDirection: ANGLE_DIRECTION_OPTIONS,
    perspective: PERSPECTIVE_OPTIONS,
    lensType: LENS_TYPE_OPTIONS,
    lighting: LIGHTING_OPTIONS,
    cameraMove: CAMERA_MOVE_OPTIONS,
  }[type];
  
  return options.find(opt => opt.value === term);
}

