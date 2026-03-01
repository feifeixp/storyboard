/**
 * 服装搭配指南类型定义
 */

export interface ProportionGuideline {
  年龄段?: {
    范围: string;
    比例: string;
    说明: string;
  }[];
  美学风格?: {
    风格: string;
    比例: string;
    说明: string;
  }[];
  社会阶层?: {
    阶层: string;
    比例: string;
    说明: string;
  }[];
  剧本类型?: {
    类型: string;
    比例: string;
    说明: string;
  }[];
}

export interface ColorTheory {
  类型: string;
  定义: string;
  示例: string[];
  优点?: string[];
  注意?: string[];
  适用场景: string[];
}

export interface ProportionPrinciple {
  核心: string;
  实现方法: string[];
  效果: string[];
  适用人群: string[];
}

export interface StylePrinciple {
  核心: string;
  示例?: string[];
  常见错误?: string[];
  正确做法?: string[];
  为什么?: string[];
}

export interface AccessoryPrinciple {
  核心: string;
  作用?: string[];
  示例?: string[];
  建议?: string[];
  效果?: string[];
  为什么?: string[];
}

export interface SeasonGuideline {
  特点: string[];
  推荐款式: string[];
  颜色: string[];
  注意?: string[];
}

export interface IdentityGuideline {
  服装特点: string[];
  示例: string[];
  注意: string[];
}

export interface FilmPrinciple {
  原因: string;
  替代方案?: string[];
  推荐面料?: string[];
  避免面料?: string[];
}

export interface ThinkingExample {
  角色信息: {
    年龄: string;
    身份: string;
    剧本类型: string;
    场景: string;
    季节: string;
  };
  思考过程: {
    场景分析: string[];
    人物比例判断: string[];
    色彩策略: string[];
    款式策略: string[];
    季节适配: string[];
  };
  搭配变体: {
    名称: string;
    上装: string;
    下装: string;
    外套?: string;
    理由: string;
  }[];
  关键原则: string[];
  错误示例: string[];
}

export interface StylingGuide {
  人物比例原则: ProportionGuideline;
  色彩搭配理论: ColorTheory[];
  身材比例原则: ProportionPrinciple[];
  风格协调原则: StylePrinciple[];
  配饰搭配技巧: AccessoryPrinciple[];
  季节穿搭原则: {
    春季: SeasonGuideline;
    夏季: SeasonGuideline;
    秋季: SeasonGuideline;
    冬季: SeasonGuideline;
  };
  角色身份适配原则: {
    底层角色: IdentityGuideline;
    中层角色: IdentityGuideline;
    上层角色: IdentityGuideline;
  };
  影视化设计原则: FilmPrinciple[];
  综合应用示例: ThinkingExample[];
}

