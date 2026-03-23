import React, { useMemo, useState } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Project } from '../types/project';
import { downloadFile } from '../src/utils/download';

export interface Asset {
  id: string;
  type: 'image' | 'video';
  category: 'character' | 'scene' | 'shot' | 'video';
  label: string;
  url: string;
}

export function AssetManager({ project }: { project: Project }) {
  const [filter, setFilter] = useState<'all' | 'character' | 'scene' | 'shot' | 'video'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);

  // 聚合项目中所有的图片和视频资产
  const assets: Asset[] = useMemo(() => {
    const list: Asset[] = [];

    // 1. 角色设定图
    (project.characters || []).forEach(char => {
      if (char.imageSheetUrl) {
        list.push({
          id: `char_sheet_${char.id}`,
          type: 'image',
          category: 'character',
          label: `${char.name} (主形态)`,
          url: char.imageSheetUrl
        });
      } else if (char.referenceImageUrl || char.data) {
        list.push({
          id: `char_ref_${char.id}`,
          type: 'image',
          category: 'character',
          label: `${char.name} (参考图)`,
          url: char.referenceImageUrl || char.data!
        });
      }
      // 子形态
      (char.forms || []).forEach(form => {
        if (form.imageSheetUrl) {
          list.push({
            id: `char_form_${form.id}`,
            type: 'image',
            category: 'character',
            label: `${char.name} - ${form.name}`,
            url: form.imageSheetUrl
          });
        }
      });
    });

    // 2. 场景设定图
    (project.scenes || []).forEach(scene => {
      if (scene.imageSheetUrl) {
        list.push({
          id: `scene_sheet_${scene.id}`,
          type: 'image',
          category: 'scene',
          label: `${scene.name}`,
          url: scene.imageSheetUrl
        });
      }
    });

    // 3. 分镜草图 & 成片视频
    (project.episodes || []).forEach(ep => {
      (ep.shots || []).forEach((shot, index) => {
        if (shot.startFrameUrl) {
          list.push({
            id: `shot_img_${shot.id}_start`,
            type: 'image',
            category: 'shot',
            label: `Ep${ep.episodeNumber}-镜头${index + 1} 首帧`,
            url: shot.startFrameUrl
          });
        }
        if (shot.endFrameUrl) {
          list.push({
            id: `shot_img_${shot.id}_end`,
            type: 'image',
            category: 'shot',
            label: `Ep${ep.episodeNumber}-镜头${index + 1} 尾帧`,
            url: shot.endFrameUrl
          });
        }
        if (shot.storyboardGridUrl) {
          list.push({
            id: `shot_img_${shot.id}_grid`,
            type: 'image',
            category: 'shot',
            label: `Ep${ep.episodeNumber}-镜头${index + 1} 合板`,
            url: shot.storyboardGridUrl
          });
        }
        if (shot.videoUrl) {
          list.push({
            id: `shot_vid_${shot.id}`,
            type: 'video',
            category: 'video',
            label: `Ep${ep.episodeNumber}-镜头${index + 1} 视频`,
            url: shot.videoUrl
          });
        }
      });
    });

    return list;
  }, [project]);

  const filteredAssets = useMemo(() => {
    if (filter === 'all') return assets;
    return assets.filter(a => a.category === filter);
  }, [assets, filter]);

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredAssets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAssets.map(a => a.id)));
    }
  };

  const handleBatchDownload = async () => {
    if (selectedIds.size === 0) return;
    setIsDownloading(true);

    try {
      const zip = new JSZip();
      const assetsToDownload = assets.filter(a => selectedIds.has(a.id));

      // 统计以避免同名冲突
      const nameCounts: Record<string, number> = {};

      const promises = assetsToDownload.map(async (asset) => {
        try {
          const response = await fetch(asset.url);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const blob = await response.blob();
          
          let extension = asset.type === 'video' ? 'mp4' : 'jpg';
          if (asset.url.includes('.png')) extension = 'png';
          if (asset.url.includes('.webp')) extension = 'webp';

          let safeFileName = `${asset.category}_${asset.label.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}`;
          
          const key = safeFileName;
          if (nameCounts[key] !== undefined) {
             nameCounts[key]++;
             safeFileName = `${safeFileName}_${nameCounts[key]}`;
          } else {
             nameCounts[key] = 0;
          }

          zip.file(`${safeFileName}.${extension}`, blob);
        } catch (err) {
          console.error(`获取资产失败: ${asset.url}`, err);
        }
      });

      await Promise.all(promises);
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${project.name || 'Project'}_Assets.zip`);

    } catch (error) {
       console.error('批量打包失败:', error);
       alert('打包下载失败，请检查网络日志。');
    } finally {
       setIsDownloading(false);
    }
  };

  const getCategoryLabel = (cat: string) => {
    const map: any = { character: '角色设定', scene: '场景设定', shot: '分镜草图', video: '成片视频' };
    return map[cat] || cat;
  };

  return (
    <div className="bg-[#12141c] border border-white/5 rounded-2xl shadow-xl overflow-hidden flex flex-col h-full max-h-[800px]">
      {/* 顶部控制栏 */}
      <div className="p-4 border-b border-white/5 bg-white/5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-10">
        <div className="flex bg-black/40 p-1 rounded-xl border border-white/10">
          {(['all', 'character', 'scene', 'shot', 'video'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => {
                setFilter(cat);
                setSelectedIds(new Set()); // 切换分类时清空选择
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === cat ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
              {cat === 'all' ? '全部' : getCategoryLabel(cat)}
              <span className="ml-1 opacity-50 text-xs">
                ({cat === 'all' ? assets.length : assets.filter(a => a.category === cat).length})
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {filteredAssets.length > 0 && (
            <button
              onClick={handleSelectAll}
              className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              {selectedIds.size === filteredAssets.length ? '取消全选' : '全选'}
            </button>
          )}
          <button
            onClick={handleBatchDownload}
            disabled={selectedIds.size === 0 || isDownloading}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
              selectedIds.size > 0 && !isDownloading
                ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-lg border border-emerald-400/30'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
            }`}
          >
            {isDownloading ? (
               <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> 正在打包...</>
            ) : (
               <>⬇️ 批量下载 ({selectedIds.size})</>
            )}
          </button>
        </div>
      </div>

      {/* 资产画廊区 */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
        {filteredAssets.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-gray-500">
            暂无此分类的资产产出
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredAssets.map(asset => {
              const selected = selectedIds.has(asset.id);
              return (
                <div
                  key={asset.id}
                  onClick={() => handleToggleSelect(asset.id)}
                  className={`relative group cursor-pointer rounded-xl overflow-hidden aspect-video border transition-all ${
                    selected ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)] ring-2 ring-emerald-500/50' : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  <div className="absolute inset-0 bg-black">
                    {asset.type === 'video' ? (
                      <video src={asset.url} className="w-full h-full object-cover opacity-80" muted loop playsInline onMouseEnter={(e) => e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()} />
                    ) : (
                      <img src={asset.url} alt={asset.label} className="w-full h-full object-cover" />
                    )}
                  </div>
                  
                  {/* Hover Overlay */}
                  <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity ${selected && 'opacity-100'} flex flex-col justify-between p-2`}>
                    <div className="flex justify-end">
                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selected ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-white/50 bg-black/40'}`}>
                        {selected && <span className="text-xs">✓</span>}
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-indigo-300 font-mono mb-1 inline-block border border-white/10">
                        {getCategoryLabel(asset.category)}
                      </span>
                      <p className="text-xs text-white truncate text-shadow">{asset.label}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
