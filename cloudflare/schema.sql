-- Cloudflare D1 数据库 Schema
-- 用于存储分镜脚本生成项目的所有数据

-- ============================================
-- 用户表
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_email ON users(email);

-- ============================================
-- 项目表
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  
  -- 项目设定（JSON）
  settings TEXT NOT NULL DEFAULT '{}',
  
  -- 角色库（JSON数组）
  characters TEXT NOT NULL DEFAULT '[]',
  
  -- 场景库（JSON数组）
  scenes TEXT NOT NULL DEFAULT '[]',
  
  -- 故事分卷（JSON数组）
  volumes TEXT DEFAULT '[]',
  
  -- 反派档案（JSON数组）
  antagonists TEXT DEFAULT '[]',
  
  -- 剧情大纲（JSON数组）
  story_outline TEXT NOT NULL DEFAULT '[]',
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_updated_at ON projects(updated_at);

-- ============================================
-- 剧集表
-- ============================================
CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  episode_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  
  -- 原始剧本内容
  script TEXT NOT NULL DEFAULT '',
  
  -- 剧本清洗结果（JSON）
  cleaning_result TEXT,
  
  -- 分镜列表（JSON数组）
  shots TEXT NOT NULL DEFAULT '[]',
  
  -- 状态：draft, cleaned, generated, reviewed, exported
  status TEXT NOT NULL DEFAULT 'draft',
  
  updated_at INTEGER NOT NULL,
  
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, episode_number)
);

CREATE INDEX idx_episodes_project_id ON episodes(project_id);
CREATE INDEX idx_episodes_status ON episodes(status);

-- ============================================
-- 角色参考图表（存储OSS URL）
-- ============================================
CREATE TABLE IF NOT EXISTS character_images (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  oss_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_character_images_project_id ON character_images(project_id);
CREATE INDEX idx_character_images_character_id ON character_images(character_id);

-- ============================================
-- 生成的图片表（存储OSS URL）
-- ============================================
CREATE TABLE IF NOT EXISTS generated_images (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  shot_number TEXT NOT NULL,
  oss_url TEXT NOT NULL,
  image_type TEXT NOT NULL, -- 'storyboard', 'hq', 'video_thumbnail'
  created_at INTEGER NOT NULL,
  
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

CREATE INDEX idx_generated_images_episode_id ON generated_images(episode_id);
CREATE INDEX idx_generated_images_shot_number ON generated_images(shot_number);

-- ============================================
-- AI对话历史表
-- ============================================
CREATE TABLE IF NOT EXISTS chat_history (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  episode_id TEXT,
  role TEXT NOT NULL, -- 'user', 'assistant'
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE SET NULL
);

CREATE INDEX idx_chat_history_project_id ON chat_history(project_id);
CREATE INDEX idx_chat_history_episode_id ON chat_history(episode_id);
CREATE INDEX idx_chat_history_created_at ON chat_history(created_at);

-- ============================================
-- 用户会话表（用于认证）
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  access_token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_access_token ON sessions(access_token);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

