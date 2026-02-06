/**
 * 剧集路由
 */

import { Hono } from 'hono';
import { Env } from '../index';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

export const episodeRoutes = new Hono<{ Bindings: Env }>();

// 所有剧集路由都需要认证
episodeRoutes.use('/*', authMiddleware);

/**
 * 获取项目的所有剧集
 * GET /api/episodes?projectId=xxx
 */
episodeRoutes.get('/', async (c) => {
  const user = getCurrentUser(c);
  const projectId = c.req.query('projectId');

  if (!projectId) {
    return c.json({ error: 'projectId is required' }, 400);
  }

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

    // 获取剧集列表
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM episodes WHERE project_id = ? ORDER BY episode_number ASC'
    )
      .bind(projectId)
      .all();

    const episodes = results.map((ep: any) => ({
      id: ep.id,
      episodeNumber: ep.episode_number,
      title: ep.title,
      script: ep.script,
      cleaningResult: ep.cleaning_result ? JSON.parse(ep.cleaning_result) : null,
      shots: JSON.parse(ep.shots),
      status: ep.status,
      updatedAt: ep.updated_at,
    }));

    return c.json({ episodes });
  } catch (error) {
    console.error('Get episodes error:', error);
    return c.json({ error: 'Failed to get episodes' }, 500);
  }
});

/**
 * 获取单个剧集
 * GET /api/episodes/:id
 */
episodeRoutes.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const episodeId = c.req.param('id');

  try {
    const episode = await c.env.DB.prepare(
      `SELECT e.* FROM episodes e
       JOIN projects p ON e.project_id = p.id
       WHERE e.id = ? AND p.user_id = ?`
    )
      .bind(episodeId, user.id)
      .first();

    if (!episode) {
      return c.json({ error: 'Episode not found' }, 404);
    }

    return c.json({
      id: episode.id,
      episodeNumber: episode.episode_number,
      title: episode.title,
      script: episode.script,
      cleaningResult: episode.cleaning_result ? JSON.parse(episode.cleaning_result as string) : null,
      shots: JSON.parse(episode.shots as string),
      status: episode.status,
      updatedAt: episode.updated_at,
    });
  } catch (error) {
    console.error('Get episode error:', error);
    return c.json({ error: 'Failed to get episode' }, 500);
  }
});

/**
 * 创建或更新剧集
 * POST /api/episodes
 */
episodeRoutes.post('/', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json();

  const { projectId, episodeNumber, title, script, cleaningResult, shots, status } = body;

  if (!projectId || !episodeNumber) {
    return c.json({ error: 'projectId and episodeNumber are required' }, 400);
  }

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

    // 检查剧集是否已存在
    const existing = await c.env.DB.prepare(
      'SELECT id FROM episodes WHERE project_id = ? AND episode_number = ?'
    )
      .bind(projectId, episodeNumber)
      .first();

    const now = Date.now();

    if (existing) {
      // 更新现有剧集
      await c.env.DB.prepare(
        `UPDATE episodes SET
          title = ?,
          script = ?,
          cleaning_result = ?,
          shots = ?,
          status = ?,
          updated_at = ?
        WHERE id = ?`
      )
        .bind(
          title || `第${episodeNumber}集`,
          script || '',
          cleaningResult ? JSON.stringify(cleaningResult) : null,
          JSON.stringify(shots || []),
          status || 'draft',
          now,
          existing.id
        )
        .run();

      return c.json({ id: existing.id, success: true });
    } else {
      // 创建新剧集
      const episodeId = `ep-${Date.now()}-${episodeNumber}`;

      await c.env.DB.prepare(
        `INSERT INTO episodes (
          id, project_id, episode_number, title, script,
          cleaning_result, shots, status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          episodeId,
          projectId,
          episodeNumber,
          title || `第${episodeNumber}集`,
          script || '',
          cleaningResult ? JSON.stringify(cleaningResult) : null,
          JSON.stringify(shots || []),
          status || 'draft',
          now
        )
        .run();

      return c.json({ id: episodeId, success: true });
    }
  } catch (error) {
    console.error('Create/update episode error:', error);
    return c.json({ error: 'Failed to save episode' }, 500);
  }
});

