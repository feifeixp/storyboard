/**
 * 项目路由
 */

import { Hono } from 'hono';
import { Env } from '../index';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

export const projectRoutes = new Hono<{ Bindings: Env }>();

// 所有项目路由都需要认证
projectRoutes.use('/*', authMiddleware);

/**
 * 获取所有项目（仅元数据）
 * GET /api/projects
 */
projectRoutes.get('/', async (c) => {
  const user = getCurrentUser(c);

  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, name, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC'
    )
      .bind(user.id)
      .all();

    return c.json({ projects: results });
  } catch (error) {
    console.error('Get projects error:', error);
    return c.json({ error: 'Failed to get projects' }, 500);
  }
});

/**
 * 获取单个项目（完整数据）
 * GET /api/projects/:id
 */
projectRoutes.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const projectId = c.req.param('id');

  try {
    const project = await c.env.DB.prepare(
      'SELECT * FROM projects WHERE id = ? AND user_id = ?'
    )
      .bind(projectId, user.id)
      .first();

    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // 解析 JSON 字段
    const projectData = {
      id: project.id,
      name: project.name,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      settings: JSON.parse(project.settings as string),
      characters: JSON.parse(project.characters as string),
      scenes: JSON.parse(project.scenes as string),
      volumes: JSON.parse(project.volumes as string || '[]'),
      antagonists: JSON.parse(project.antagonists as string || '[]'),
      storyOutline: JSON.parse(project.story_outline as string),
    };

    // 获取剧集列表
    const { results: episodes } = await c.env.DB.prepare(
      'SELECT * FROM episodes WHERE project_id = ? ORDER BY episode_number ASC'
    )
      .bind(projectId)
      .all();

    projectData.episodes = episodes.map((ep: any) => ({
      id: ep.id,
      episodeNumber: ep.episode_number,
      title: ep.title,
      script: ep.script,
      cleaningResult: ep.cleaning_result ? JSON.parse(ep.cleaning_result) : null,
      shots: JSON.parse(ep.shots),
      status: ep.status,
      updatedAt: ep.updated_at,
    }));

    return c.json(projectData);
  } catch (error) {
    console.error('Get project error:', error);
    return c.json({ error: 'Failed to get project' }, 500);
  }
});

/**
 * 创建项目
 * POST /api/projects
 */
projectRoutes.post('/', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json();

  const projectId = `proj-${Date.now()}`;
  const now = Date.now();

  try {
    await c.env.DB.prepare(
      `INSERT INTO projects (
        id, user_id, name, created_at, updated_at,
        settings, characters, scenes, volumes, antagonists, story_outline
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        projectId,
        user.id,
        body.name,
        now,
        now,
        JSON.stringify(body.settings || {}),
        JSON.stringify(body.characters || []),
        JSON.stringify(body.scenes || []),
        JSON.stringify(body.volumes || []),
        JSON.stringify(body.antagonists || []),
        JSON.stringify(body.storyOutline || [])
      )
      .run();

    return c.json({
      id: projectId,
      name: body.name,
      createdAt: now,
      updatedAt: now,
      settings: body.settings || {},
      characters: body.characters || [],
      scenes: body.scenes || [],
      volumes: body.volumes || [],
      antagonists: body.antagonists || [],
      storyOutline: body.storyOutline || [],
      episodes: [],
    });
  } catch (error) {
    console.error('Create project error:', error);
    return c.json({ error: 'Failed to create project' }, 500);
  }
});

/**
 * 更新项目
 * PUT /api/projects/:id
 */
projectRoutes.put('/:id', async (c) => {
  const user = getCurrentUser(c);
  const projectId = c.req.param('id');
  const body = await c.req.json();

  try {
    // 验证项目所有权
    const project = await c.env.DB.prepare(
      'SELECT id FROM projects WHERE id = ? AND user_id = ?'
    )
      .bind(projectId, user.id)
      .first();

    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // 更新项目
    await c.env.DB.prepare(
      `UPDATE projects SET
        name = ?,
        settings = ?,
        characters = ?,
        scenes = ?,
        volumes = ?,
        antagonists = ?,
        story_outline = ?,
        updated_at = ?
      WHERE id = ?`
    )
      .bind(
        body.name,
        JSON.stringify(body.settings),
        JSON.stringify(body.characters),
        JSON.stringify(body.scenes),
        JSON.stringify(body.volumes || []),
        JSON.stringify(body.antagonists || []),
        JSON.stringify(body.storyOutline),
        Date.now(),
        projectId
      )
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Update project error:', error);
    return c.json({ error: 'Failed to update project' }, 500);
  }
});

/**
 * 删除项目
 * DELETE /api/projects/:id
 */
projectRoutes.delete('/:id', async (c) => {
  const user = getCurrentUser(c);
  const projectId = c.req.param('id');

  try {
    // 验证项目所有权
    const project = await c.env.DB.prepare(
      'SELECT id FROM projects WHERE id = ? AND user_id = ?'
    )
      .bind(projectId, user.id)
      .first();

    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // 删除项目（级联删除剧集）
    await c.env.DB.prepare('DELETE FROM projects WHERE id = ?')
      .bind(projectId)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete project error:', error);
    return c.json({ error: 'Failed to delete project' }, 500);
  }
});

