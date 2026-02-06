---
type: "always_apply"
description: "代码操作前置校验、代码完整性约束、规则简洁性等通用开发规范，适用于所有代码增删改操作"
---

# Augment Code 规则配置文件（完整版）

**版本**: 1.0
**最后更新**: 2024-12-26

> ⚠️ **重要说明**：
> - 本文件包含全局规则和项目规则的完整定义
> - **全局规则**（R001-R007, G001-G004）已提取到 `global-rules.md`
> - **项目规则**（R008）已提取到 `project-rules.md`
> - 建议使用分离后的文件，本文件保留作为完整参考

---

## 📋 规则分层结构

```
.augment/rules/
├── global-rules.md      # 全局规则（可复制到其他项目）
│   ├── R001-R007        # 通用强制规则
│   └── G001-G004        # 通用建议规则
├── project-rules.md     # 项目规则（仅当前项目）
│   └── R008             # 分镜角度规则
└── rules.md             # 完整规则（本文件，保留作为参考）
```

---

# 配置文件版本（匹配Augment Code v1.0+）
version: "1.0"
# 规则分组（便于管理）
rule_groups:
  - group_id: "general_code_operation"
    group_name: "通用代码操作规则"
    description: "覆盖代码增删改查的核心强制规则"
    rules:
      # 规则R001：代码操作前置校验
      - rule_id: "R001"
        rule_name: "code_modify_pre_check"
        rule_type: "mandatory"  # 强制规则
        description: "代码增删改前必须输出方案和影响分析，用户确认后执行"
        trigger_conditions:  # 触发条件：代码修改/删除/新增操作
          - event_type: "code_modify"
          - event_type: "code_delete"
          - event_type: "code_add"
        execution_actions:  # 执行动作
          - action: "block_direct_operation"  # 拦截直接操作
          - action: "generate_analysis_report"  # 生成分析报告
            report_template: |
              ## 操作分析报告
              1. 拟操作代码范围：{{code_range}}
              2. 操作目的：{{operation_purpose}}
              3. 关联影响代码：{{related_code}}
              4. 潜在风险：{{potential_risk}}
              5. 备选方案：{{alternative_solution}}
          - action: "wait_user_approval"  # 等待用户确认
        validation:  # 校验逻辑
          - check: "report_completeness"  # 校验报告完整性
            error_message: "分析报告缺失关键信息（如影响范围），请补充后重试"
      
      # 规则R002：代码完整性约束
      - rule_id: "R002"
        rule_name: "code_integrity_check"
        rule_type: "mandatory"
        description: "生成/修改的代码必须包含注释、异常处理、依赖说明"
        trigger_conditions:
          - event_type: "code_generate"
          - event_type: "code_modify"
        execution_actions:
          - action: "validate_code_elements"  # 校验代码要素
            check_items:
              - "basic_comments"  # 基础注释
              - "exception_handling"  # 异常处理
              - "dependency_description"  # 依赖说明
          - action: "prompt_missing_elements"  # 提示缺失要素
        validation:
          - check: "element_completeness"
            error_message: "代码缺失{{missing_item}}，请补充后再输出"
      
      # 规则R006：规则简洁性约束
      - rule_id: "R006"
        rule_name: "rule_conciseness"
        rule_type: "mandatory"
        description: "单条规则内容控制在500行以内，复杂规则拆分子规则"
        trigger_conditions:
          - event_type: "rule_create"
          - event_type: "rule_edit"
        execution_actions:
          - action: "check_rule_length"  # 校验规则长度
            max_length: 500
          - action: "prompt_split_rule"  # 提示拆分
        validation:
          - check: "length_limit"
            error_message: "规则内容超过500行，请拆分为多个子规则"

  - group_id: "rule_management"
    group_name: "规则设计与维护指南"
    description: "规则自身设计的建议性指南"
    rules:
      # 指南类规则（非强制，type为guideline）
      - rule_id: "G001"
        rule_name: "complex_concept_split"
        rule_type: "guideline"
        description: "将复杂概念拆分为多个可组合的小规则"
        execution_actions:
          - action: "suggest_split"  # 仅建议，不强制
            example: |
              原规则："优化代码性能并保证兼容性" → 拆分后：
              1. G001-1：优化代码性能（选择高效数据结构）
              2. G001-2：保证代码兼容性（适配主流运行环境）
      - rule_id: "G002"
        rule_name: "rule_with_example"
        rule_type: "guideline"
        description: "规则中添加具体示例/代码片段提升可理解性"
        execution_actions:
          - action: "suggest_add_example"
      - rule_id: "G003"
        rule_name: "manual_rule_call"
        rule_type: "guideline"
        description: "交互时可通过@规则名手动调用特定规则（如@R001）"
        execution_actions:
          - action: "prompt_call_format"
            example: "输入：@R001 帮我修改这段代码 → 工具优先执行R001规则"
      - rule_id: "G004"
        rule_name: "rule_update_timely"
        rule_type: "guideline"
        description: "重复强调的要求及时固化为规则"
        execution_actions:
          - action: "suggest_create_rule"

  - group_id: "development_logging"
    group_name: "开发日志记录规范"
    description: "标准化开发日志记录机制，用于项目回顾、避免重复工作和保持开发一致性"
    rules:
      # 规则R007：开发日志强制记录
      - rule_id: "R007"
        rule_name: "development_log_mandatory"
        rule_type: "mandatory"  # 强制规则
        description: "重大功能开发、架构调整、问题修复时必须记录开发日志"
        trigger_conditions:  # 触发条件
          - event_type: "major_feature_development"  # 重大功能开发
          - event_type: "architecture_adjustment"    # 架构调整
          - event_type: "bug_fix"                    # 问题修复
          - event_type: "refactoring"                # 代码重构
          - event_type: "performance_optimization"   # 性能优化
        execution_actions:  # 执行动作
          - action: "generate_log_entry"  # 生成日志条目
            log_template: |
              ## [{{timestamp}}] {{change_type}}

              **修改内容**：{{summary}}

              **影响范围**：
              - 文件/模块：{{affected_files}}

              **修改原因**：{{reason}}

              **预期效果**：{{expected_result}}

              **相关文档**：{{related_docs}}

              ---
          - action: "append_to_log_file"  # 追加到日志文件
            file_path: "DEVELOPMENT_LOG.md"
          - action: "validate_log_format"  # 校验日志格式
        validation:  # 校验逻辑
          - check: "timestamp_format"  # 校验时间格式
            format: "YYYY-MM-DD HH:MM"
            error_message: "时间格式错误，应为 YYYY-MM-DD HH:MM"
          - check: "summary_length"  # 校验摘要长度
            min_length: 50
            max_length: 200
            error_message: "修改内容摘要应在50-200字之间"
          - check: "required_fields"  # 校验必填字段
            fields:
              - "timestamp"
              - "change_type"
              - "summary"
              - "affected_files"
              - "reason"
              - "expected_result"
            error_message: "日志缺失必填字段：{{missing_fields}}"
          - check: "no_code_details"  # 校验不包含代码细节
            error_message: "开发日志不应包含具体代码实现细节，请移除"

        # 日志分类定义
        change_types:
          - type: "feature"
            label: "新功能"
            icon: "✨"
          - type: "fix"
            label: "问题修复"
            icon: "🐛"
          - type: "refactor"
            label: "代码重构"
            icon: "♻️"
          - type: "perf"
            label: "性能优化"
            icon: "⚡"
          - type: "arch"
            label: "架构调整"
            icon: "🏗️"
          - type: "docs"
            label: "文档更新"
            icon: "📝"

        # 日志示例
        examples:
          - example_name: "新功能开发日志"
            content: |
              ## [2024-12-26 14:30] ✨ 新功能

              **修改内容**：实现场景重新提取功能，支持从剧本中智能提取新场景，自动去重（精确匹配+相似度检测）

              **影响范围**：
              - 文件/模块：services/sceneExtraction.ts（新增）、components/ProjectDashboard.tsx（修改）

              **修改原因**：初次分析可能遗漏场景，需要提供重新提取功能补充场景库

              **预期效果**：用户可以随时从剧本中重新提取场景，自动过滤重复场景，提升场景库完整性

              **相关文档**：场景重新提取功能-实现文档.md、场景重新提取功能-用户指南.md

              ---

          - example_name: "问题修复日志"
            content: |
              ## [2024-12-26 10:15] 🐛 问题修复

              **修改内容**：修复场景数量递减问题，增强预扫描取样（3000字→5000字），新增场景验证机制

              **影响范围**：
              - 文件/模块：services/projectAnalysis.ts（修改）

              **修改原因**：重新分析时场景数量从10个减少到9个，预扫描发现的场景在分批分析中丢失

              **预期效果**：场景数量稳定，预扫描发现的场景100%被保留，遗漏场景以占位符形式出现

              **相关文档**：项目分析功能修复总结.md

              ---

        # 最佳实践
        best_practices:
          - practice: "及时记录"
            description: "完成修改后立即记录，避免遗忘细节"
          - practice: "简洁明确"
            description: "摘要控制在50-200字，突出核心修改点"
          - practice: "关联文档"
            description: "如有详细技术文档，在日志中添加引用链接"
          - practice: "分类清晰"
            description: "使用标准分类（新功能/问题修复/重构等）"
          - practice: "避免代码"
            description: "不在日志中粘贴代码片段，保持日志简洁"

        # 预期效果
        expected_benefits:
          - benefit: "清晰的开发历史轨迹"
            description: "通过时间线了解项目演进过程"
          - benefit: "防止重复开发"
            description: "查看日志避免重复实现相同功能"
          - benefit: "保持决策一致性"
            description: "确保前后开发决策的连贯性"
          - benefit: "便于团队协作"
            description: "团队成员快速了解项目变更历史"
          - benefit: "问题追溯"
            description: "出现问题时快速定位相关修改"

  - group_id: "storyboard_angle_rules"
    group_name: "分镜角度规则（最高优先级）"
    description: "分镜脚本生成的核心角度规则，防止回归"
    rules:
      # 规则R008：角度规则强制校验
      - rule_id: "R008"
        rule_name: "angle_rules_enforcement"
        rule_type: "mandatory"  # 强制规则
        description: "修改角度相关代码前必须查阅角度规则文件，确保符合规范"
        trigger_conditions:
          - event_type: "code_modify"
            file_patterns:
              - "services/constants.ts"
              - "services/openrouter.ts"
              - "prompts/chain-of-thought/stage3-shot-planning.ts"
        execution_actions:
          - action: "check_rule_file"  # 检查规则文件
            rule_file: ".augment/rules/角度规则优化总结.ini"
          - action: "validate_angle_constants"  # 校验角度常量
            check_items:
              - constant: "DEFAULTS.ANGLE_HEIGHT"
                expected_value: "轻微仰拍(Mild Low)"
                error_message: "默认角度高度必须为'轻微仰拍(Mild Low)'，不能是平视"
              - constant: "SHOT_RULES.MAX_FRONT_VIEW_SHOTS"
                expected_value: 2
                error_message: "正面镜头最大数量必须为2（30个镜头最多2个）"
              - constant: "SHOT_RULES.MAX_EYE_LEVEL_RATIO"
                expected_value: 0.15
                error_message: "平视镜头最大占比必须为0.15（15%）"
          - action: "validate_prompt_rules"  # 校验提示词规则
            check_items:
              - location: "services/openrouter.ts:1250-1265"
                rule: "正面占比"
                expected: "≤7%"
                error_message: "提示词中正面占比必须为≤7%，不是30-40%"
              - location: "services/openrouter.ts:1250-1265"
                rule: "平视占比"
                expected: "10-15%"
                error_message: "提示词中平视占比必须为10-15%，不是25-35%"
              - location: "prompts/chain-of-thought/stage3-shot-planning.ts:277-285"
                rule: "正面占比"
                expected: "≤7%"
                error_message: "思维链提示词中正面占比必须为≤7%，不是≤10%"
        validation:
          - check: "angle_distribution"
            error_message: "角度分布不符合规则，请查阅 .augment/rules/角度规则优化总结.ini"

        # 核心规则定义
        core_rules:
          - rule: "正面镜头占比"
            value: "≤7%（30个镜头最多2个）"
            priority: "最高"
          - rule: "平视镜头占比"
            value: "10-15%（禁止连续2个以上）"
            priority: "最高"
          - rule: "默认角度高度"
            value: "轻微仰拍/轻微俯拍（40-50%）"
            priority: "最高"
          - rule: "极端角度占比"
            value: "≥15%（必须有，不能全是温和角度）"
            priority: "高"

        # 相关文件清单
        related_files:
          - file: "services/constants.ts"
            description: "角度常量定义"
            key_constants:
              - "DEFAULTS.ANGLE_HEIGHT"
              - "SHOT_RULES.MAX_FRONT_VIEW_SHOTS"
              - "SHOT_RULES.MAX_EYE_LEVEL_RATIO"
          - file: "services/openrouter.ts"
            description: "分镜生成提示词"
            key_sections:
              - "第1250-1265行：角度分布规则表格"
          - file: "prompts/chain-of-thought/stage3-shot-planning.ts"
            description: "思维链阶段3角度分配"
            key_sections:
              - "第277-285行：朝向角度分布要求"
              - "第337-342行：角度高度分布示例"

        # 防回归检查清单
        regression_checklist:
          - check: "正面镜头占比 ≤7%"
          - check: "平视镜头占比 10-15%"
          - check: "默认角度高度为'轻微仰拍'而非'平视'"
          - check: "极端角度占比 ≥15%"
          - check: "所有提示词中的角度分布规则与规则文件一致"
          - check: "没有修改关键常量（除非有明确的规则更新）"