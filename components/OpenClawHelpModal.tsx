import React, { useState } from 'react';

interface OpenClawHelpModalProps {
    onClose: () => void;
}

export function OpenClawHelpModal({ onClose }: OpenClawHelpModalProps) {
    const [activeTab, setActiveTab] = useState<'deployment' | 'agent'>('deployment');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div
                className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 shadow-2xl relative overflow-hidden"
                style={{
                    background: 'radial-gradient(circle at top right, rgba(40,40,45,1) 0%, rgba(20,20,22,1) 100%)',
                }}
            >
                {/* 标题栏 */}
                <div className="flex items-center justify-between p-5 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">⚡️</span>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-100 mt-0 pt-0">OpenClaw 智能体接入指南</h2>
                            <p className="text-xs text-gray-400">Visionary Storyboard Skill API</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg"
                    >
                        ✕
                    </button>
                </div>

                {/* 标签栏 */}
                <div className="flex px-6 pt-4 gap-6 border-b border-white/5">
                    <button
                        onClick={() => setActiveTab('deployment')}
                        className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'deployment' ? 'border-primary-500 text-primary-400' : 'border-transparent text-gray-400 hover:text-gray-200'
                            }`}
                    >
                        后端 API 部署说明
                    </button>
                    <button
                        onClick={() => setActiveTab('agent')}
                        className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'agent' ? 'border-primary-500 text-primary-400' : 'border-transparent text-gray-400 hover:text-gray-200'
                            }`}
                    >
                        OpenClaw Agent 系统提示词
                    </button>
                </div>

                {/* 内容区 */}
                <div className="flex-1 overflow-y-auto p-6 text-gray-300 space-y-6 text-sm leading-relaxed custom-scrollbar">

                    {activeTab === 'deployment' && (
                        <div className="space-y-6 animate-fade-in">
                            <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                                <h3 className="text-md font-medium text-white mb-2 flex items-center gap-2">
                                    <span className="text-primary-400">1.</span> 登录与环境认证
                                </h3>
                                <p className="mb-3">您的后端 API 架构基于 Cloudflare Workers 部署，位于项目的 <code>api/</code> 目录下。请在终端执行：</p>
                                <div className="bg-black/50 p-3 rounded-lg font-mono text-xs text-gray-400 border border-white/5">
                                    cd api<br />
                                    npx wrangler login
                                </div>
                            </div>

                            <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                                <h3 className="text-md font-medium text-white mb-2 flex items-center gap-2">
                                    <span className="text-primary-400">2.</span> 注入机密 API Key
                                </h3>
                                <p className="mb-3">API 代理大模型请求时需要使用您的私有密钥。该手段可避免秘钥暴露在前端代码中。</p>
                                <div className="bg-black/50 p-3 rounded-lg font-mono text-xs text-gray-400 border border-white/5 mb-2">
                                    npx wrangler secret put OPENROUTER_API_KEY
                                </div>
                                <p className="text-xs text-gray-500">提示：输入上述命令后，在终端粘贴您的 OpenRouter 密钥并回车。</p>
                            </div>

                            <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                                <h3 className="text-md font-medium text-white mb-2 flex items-center gap-2">
                                    <span className="text-primary-400">3.</span> 一键发布上线
                                </h3>
                                <p className="mb-3">确认密钥注入完毕后，执行发布：</p>
                                <div className="bg-black/50 p-3 rounded-lg font-mono text-xs text-gray-400 border border-white/5">
                                    npm run deploy
                                </div>
                                <p className="mt-3 text-xs text-gray-400 bg-primary-500/10 p-2 rounded text-primary-300 border border-primary-500/20">
                                    成功部署后，使用控制台返回的 URL 更新项目下的 <code>docs/openapi.yaml</code> 的 server url，该文件用于供给智能体作为能力清单。
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'agent' && (
                        <div className="space-y-4 animate-fade-in">
                            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-xs mb-4 flex items-start gap-2">
                                <div>ℹ️</div>
                                <div>当您在 OpenClaw (或 Dify 等框架) 导入 <code>openapi.yaml</code> 后，请把以下大段文字直接粘贴进 Agent 的 <strong>系统级提示词 (System Prompt)</strong> 或插件技能描述中，以驯化它正确使用本引擎。</div>
                            </div>

                            <div className="bg-black/50 p-4 rounded-xl border border-white/5 relative group">
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(`## Tool Identity & Purpose
你现在具备了 Visionary Storyboard Studio 核心引擎的调用能力。这是一套专业的影视分镜自动化工作流辅助工具。当用户输入小说或剧本时，你**必须**使用本插件提供的 API 节点产生符合专业视听语言和主流 AI 视频工具的提示词。

### 1. POST /api/v1/characters/extract
- **时机**：用户提供全新剧本，请求“列出角色”或“设计人物外观”。
- **要求**：直接透传剧本，返回给用户高度结构化的角色静态外观词 (appearance)。

### 2. POST /api/v1/script/clean
- **时机**：要求划分镜头、拆分画面和对话。
- **要求**：输出剥去主观修辞的纯画面视觉内容、提炼情绪基调(moodTags)，并对齐场景剧情节奏。

### 3. POST /api/v1/prompts/generate-video-prompts
- **时机**：用户已确认分镜数据，要求生成最终用于 AI (如 Nano Banana Pro / Kling / Seedance 2.0) 的提示词时。
- **红色禁忌**：绝对不要尝试用你自己的常识组装生图提示词！必须调用此接口翻译摄影角度和景深，并将 imagePromptCn 呈现给用户。`);
                                    }}
                                    className="absolute top-3 right-3 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded transition-colors"
                                >
                                    复制代码
                                </button>
                                <div className="font-mono text-gray-400 text-xs whitespace-pre-wrap leading-relaxed select-all">
                                    {`## Tool Identity & Purpose
你现在具备了 Visionary Storyboard Studio 核心引擎的调用能力。这是一套专业的影视分镜自动化工作流辅助工具。当用户输入小说或剧本时，你**必须**使用本插件提供的 API 节点产生符合专业视听语言和主流 AI 视频工具的提示词。

### 1. POST /api/v1/characters/extract
- **时机**：用户提供全新剧本，请求“列出角色”或“设计人物外观”。
- **要求**：直接透传剧本，返回给用户高度结构化的角色静态外观词 (appearance)。

### 2. POST /api/v1/script/clean
- **时机**：要求划分镜头、拆分画面和对话。
- **要求**：输出剥去主观修辞的纯画面视觉内容、提炼情绪基调(moodTags)，并对齐场景剧情节奏。

### 3. POST /api/v1/prompts/generate-video-prompts
- **时机**：用户已确认分镜数据，要求生成最终用于 AI (如 Nano Banana Pro / Kling / Seedance 2.0) 的提示词时。
- **红色禁忌**：绝对不要尝试用你自己的常识组装生图提示词！必须调用此接口翻译摄影角度和景深，并将 imagePromptCn 呈现给用户。`}
                                </div>
                            </div>
                        </div>
                    )}

                </div>

                {/* 底部装饰线 */}
                <div className="h-1 w-full bg-gradient-to-r from-primary-600 via-purple-500 to-blue-500"></div>
            </div>
        </div>
    );
}
