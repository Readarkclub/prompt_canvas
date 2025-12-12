import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PromptItem, PromptVersion, VideoSettings, Attachment } from '../types';
import { Icons } from './Icons';
import { DiffViewer } from './DiffViewer';
import { VideoModal } from './VideoModal';
import { generateImage, convertToVideoPrompt } from '../services/geminiService';
import { savePrompt } from '../services/storageService';
import { generateId } from '../services/idService';

interface ImageCanvasProps {
  promptItem: PromptItem;
  onUpdate: (updatedItem: PromptItem) => void;
}

interface ViewState {
  x: number;
  y: number;
  scale: number;
}

interface DragState {
  isDragging: boolean;
  type: 'canvas' | 'card';
  cardId?: string;
  startX: number;
  startY: number;
  initialViewX: number;
  initialViewY: number;
  initialCardX: number;
  initialCardY: number;
}

// Guide lines for snapping
interface SnapGuides {
  x: number | null; // X coordinate to draw vertical line
  y: number | null; // Y coordinate to draw horizontal line
}

const CARD_WIDTH = 400;
const CARD_GAP = 50;
const SNAP_THRESHOLD = 15; // Pixels distance to trigger snap

export const ImageCanvas: React.FC<ImageCanvasProps> = ({ promptItem, onUpdate }) => {
  const [currentItem, setCurrentItem] = useState<PromptItem>(promptItem);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isEditorExpanded, setIsEditorExpanded] = useState(false);
  const [isInputCollapsed, setIsInputCollapsed] = useState(false);
  const [editableText, setEditableText] = useState("");
  const [activeAttachment, setActiveAttachment] = useState<Attachment | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Canvas State
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, scale: 1 });
  const [guides, setGuides] = useState<SnapGuides>({ x: null, y: null });
  const [drag, setDrag] = useState<DragState>({
    isDragging: false,
    type: 'canvas',
    startX: 0,
    startY: 0,
    initialViewX: 0,
    initialViewY: 0,
    initialCardX: 0,
    initialCardY: 0
  });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const processedDraftIdRef = useRef<string | null>(null);

  // Helper for regeneration that can be called from effect
  const handleRegenerate = async (textOverride?: string) => {
    const textToUse = textOverride !== undefined ? textOverride : editableText;
    if (!textToUse.trim()) return;
    
    setIsGenerating(true);
    if (isEditorExpanded) setIsEditorExpanded(false);

    try {
      // Pass active attachment as reference image if available
      const imageUrl = await generateImage(textToUse, activeAttachment?.data);
      
      // Calculate position for new card:
      const lastVersion = currentItem.versions[currentItem.versions.length - 1];
      const startX = lastVersion?.x !== undefined ? lastVersion.x + 50 : (-view.x / view.scale) + 100;
      const startY = lastVersion?.y !== undefined ? lastVersion.y + 50 : (-view.y / view.scale) + 400;

	      const newVersion: PromptVersion = {
	        id: generateId(),
	        text: textToUse,
	        timestamp: Date.now(),
	        imageUrl: imageUrl,
        x: startX,
        y: startY
      };

      const updatedItem: PromptItem = {
        ...currentItem,
        updatedAt: Date.now(),
        activeVersionId: newVersion.id,
        versions: [...currentItem.versions, newVersion],
        draftText: undefined 
      };

      await savePrompt(updatedItem);
      setCurrentItem(updatedItem);
      onUpdate(updatedItem);

    } catch (error: any) {
      console.error(error);
      
      let errorMessage = error.message || '未知错误';
      
      // Enhanced Error Parsing
      if (typeof errorMessage === 'string') {
          if (errorMessage.startsWith('{') || errorMessage.includes('"error":')) {
              try {
                  const jsonObj = JSON.parse(errorMessage);
                  errorMessage = jsonObj.error?.message || jsonObj.message || errorMessage;
              } catch (e) {
              }
          }
          
          if (errorMessage.includes('API key not valid')) {
              errorMessage = "API Key 无效。请检查环境变量配置。";
          } else if (errorMessage.includes('Quota')) {
              errorMessage = "API 配额已耗尽。";
          }
      }

      alert(`生成图片失败: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Initialize text, attachments and default card positions
  useEffect(() => {
    const isDifferentPrompt = promptItem.id !== currentItem.id;
    
    const versionsWithPos = promptItem.versions.map((v, idx) => {
        if (v.x === undefined || v.y === undefined) {
            return { ...v, x: idx * 50, y: idx * 50 + 300 };
        }
        return v;
    });

    const hasChanged = JSON.stringify(versionsWithPos) !== JSON.stringify(promptItem.versions);
    
    if (hasChanged) {
        const updated = { ...promptItem, versions: versionsWithPos };
        setCurrentItem(updated);
    } else {
        setCurrentItem(promptItem);
    }

    if (isDifferentPrompt || !editableText) {
      // Load attachment from prompt item if exists (usually from Quick Add)
      if (promptItem.attachments && promptItem.attachments.length > 0) {
          setActiveAttachment(promptItem.attachments[0]);
      } else {
          setActiveAttachment(null);
      }

      if (promptItem.versions.length > 0) {
          const active = promptItem.versions.find(v => v.id === promptItem.activeVersionId);
          const fallback = promptItem.versions[promptItem.versions.length - 1];
          const textToLoad = active ? active.text : (fallback ? fallback.text : "");
          setEditableText(textToLoad);
      } else if (promptItem.draftText) {
          const draft = promptItem.draftText;
          setEditableText(draft);
          if (promptItem.versions.length === 0 && processedDraftIdRef.current !== promptItem.id) {
              processedDraftIdRef.current = promptItem.id;
              setTimeout(() => {
                  handleRegenerate(draft);
              }, 100);
          }
      } else {
          setEditableText("");
      }
      if(isDifferentPrompt) setView({ x: 0, y: 0, scale: 1 });
    }
  }, [promptItem]);

  const handleVideoConversion = async (settings: VideoSettings) => {
    setIsGenerating(true);
    if (isEditorExpanded) setIsEditorExpanded(false);

    try {
      const videoPromptText = await convertToVideoPrompt(editableText, settings);
      
      const lastVersion = currentItem.versions[currentItem.versions.length - 1];
      const startX = lastVersion?.x !== undefined ? lastVersion.x + 50 : (-view.x / view.scale) + 100;
      const startY = lastVersion?.y !== undefined ? lastVersion.y + 50 : (-view.y / view.scale) + 400;

	      const newVersion: PromptVersion = {
	        id: generateId(),
	        text: videoPromptText,
	        timestamp: Date.now(),
	        videoSettings: settings,
        x: startX,
        y: startY
      };

      const updatedItem: PromptItem = {
        ...currentItem,
        updatedAt: Date.now(),
        type: 'VIDEO_PLAN' as any, 
        activeVersionId: newVersion.id,
        versions: [...currentItem.versions, newVersion],
        draftText: undefined
      };

      setEditableText(videoPromptText);
      
      await savePrompt(updatedItem);
      setCurrentItem(updatedItem);
      onUpdate(updatedItem);
      setIsVideoModalOpen(false);

    } catch (error) {
      console.error(error);
      alert('转换视频提示词失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    if(!window.confirm('确定删除此卡片吗？')) return;
    
    const updatedVersions = currentItem.versions.filter(v => v.id !== versionId);
    
    let newActiveId = currentItem.activeVersionId;
    if (currentItem.activeVersionId === versionId || !updatedVersions.find(v => v.id === newActiveId)) {
        const lastVer = updatedVersions[updatedVersions.length - 1];
        newActiveId = lastVer ? lastVer.id : '';
    }

    const updatedItem = {
        ...currentItem,
        versions: updatedVersions,
        activeVersionId: newActiveId,
        updatedAt: Date.now()
    };
    
    setCurrentItem(updatedItem);
    onUpdate(updatedItem);
    
    try {
        await savePrompt(updatedItem);
    } catch (e) {
        console.error("Save failed", e);
        alert("删除操作失败");
    }
  };

  // --- Canvas Interaction Logic ---

  // Zoom relative to mouse pointer
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault(); // Browser zoom
    }
    
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomSensitivity = 0.001;
    // Typically wheel down is positive deltaY, which implies zooming out
    const delta = -e.deltaY * zoomSensitivity;
    const newScale = Math.max(0.1, Math.min(3, view.scale + delta));

    // Calculate new coordinates to keep the point under cursor fixed
    // The logic is:
    // worldX = (mouseX - view.x) / view.scale
    // newViewX = mouseX - worldX * newScale
    // Simplified: newViewX = mouseX - ((mouseX - view.x) / view.scale) * newScale
    
    const newX = mouseX - ((mouseX - view.x) / view.scale) * newScale;
    const newY = mouseY - ((mouseY - view.y) / view.scale) * newScale;

    setView({ x: newX, y: newY, scale: newScale });
  };

  // Zoom relative to center of viewport (for buttons)
  const handleZoomButton = (direction: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const step = 0.1;
    const newScale = Math.max(0.1, Math.min(3, view.scale + direction * step));

    const newX = centerX - ((centerX - view.x) / view.scale) * newScale;
    const newY = centerY - ((centerY - view.y) / view.scale) * newScale;

    setView({ x: newX, y: newY, scale: newScale });
  };

  const handleMouseDown = (e: React.MouseEvent, versionId?: string) => {
    if (versionId) {
       e.stopPropagation();
       const card = currentItem.versions.find(v => v.id === versionId);
       setDrag({
         isDragging: true,
         type: 'card',
         cardId: versionId,
         startX: e.clientX,
         startY: e.clientY,
         initialViewX: 0,
         initialViewY: 0,
         initialCardX: card?.x || 0,
         initialCardY: card?.y || 0
       });
    } else {
       setDrag({
         isDragging: true,
         type: 'canvas',
         startX: e.clientX,
         startY: e.clientY,
         initialViewX: view.x,
         initialViewY: view.y,
         initialCardX: 0,
         initialCardY: 0
       });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drag.isDragging) return;
    e.preventDefault();

    const deltaX = e.clientX - drag.startX;
    const deltaY = e.clientY - drag.startY;

    if (drag.type === 'canvas') {
        setView(prev => ({
            ...prev,
            x: drag.initialViewX + deltaX,
            y: drag.initialViewY + deltaY
        }));
    } else if (drag.type === 'card' && drag.cardId) {
        const scaleDeltaX = deltaX / view.scale;
        const scaleDeltaY = deltaY / view.scale;
        
        // Proposed new position
        let newX = drag.initialCardX + scaleDeltaX;
        let newY = drag.initialCardY + scaleDeltaY;
        
        // Snapping Logic
        let snapX: number | null = null;
        let snapY: number | null = null;

        // Check against all other cards
        currentItem.versions.forEach(other => {
            if (other.id === drag.cardId) return;

            // Snap X (Left alignment)
            if (Math.abs(newX - (other.x || 0)) < SNAP_THRESHOLD) {
                newX = other.x || 0;
                snapX = newX;
            } 
            // Snap Y (Top alignment)
            if (Math.abs(newY - (other.y || 0)) < SNAP_THRESHOLD) {
                newY = other.y || 0;
                snapY = newY;
            }
        });

        // Update Guides
        setGuides({ x: snapX, y: snapY });

        setCurrentItem(prev => ({
            ...prev,
            versions: prev.versions.map(v => 
                v.id === drag.cardId 
                ? { ...v, x: newX, y: newY }
                : v
            )
        }));
    }
  };

  const handleMouseUp = async () => {
    if (drag.isDragging && drag.type === 'card') {
        await savePrompt(currentItem);
        onUpdate(currentItem);
        // Clear guides when drop finishes
        setGuides({ x: null, y: null });
    }
    setDrag(prev => ({ ...prev, isDragging: false }));
  };

  // --- Auto Align Logic ---
  
  const handleResetView = useCallback(() => {
    if (currentItem.versions.length === 0) {
        setView({ x: 0, y: 0, scale: 1 });
        return;
    }

    const container = containerRef.current;
    if (!container) return;

    const padding = 100;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const estimatedCardH = 600;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    currentItem.versions.forEach(v => {
        const vx = v.x || 0;
        const vy = v.y || 300;
        if (vx < minX) minX = vx;
        if (vx + CARD_WIDTH > maxX) maxX = vx + CARD_WIDTH;
        if (vy < minY) minY = vy;
        if (vy + estimatedCardH > maxY) maxY = vy + estimatedCardH;
    });

    if (minX === Infinity) {
        setView({ x: 0, y: 0, scale: 1 });
        return;
    }

    const contentW = maxX - minX;
    const contentH = maxY - minY;

    const scaleX = (containerW - padding * 2) / contentW;
    const scaleY = (containerH - padding * 2) / contentH;
    let newScale = Math.min(scaleX, scaleY);
    newScale = Math.max(0.1, Math.min(1, newScale));

    const contentCenterX = minX + contentW / 2;
    const contentCenterY = minY + contentH / 2;

    const newX = (containerW / 2) - (contentCenterX * newScale);
    const newY = (containerH / 2) - (contentCenterY * newScale);

    setView({ x: newX, y: newY, scale: newScale });
  }, [currentItem.versions]);


  const alignVersions = async (direction: 'horizontal' | 'vertical') => {
    const sorted = [...currentItem.versions].sort((a, b) => a.timestamp - b.timestamp);
    
    let startX = sorted[0]?.x || 0;
    let startY = sorted[0]?.y || 350; 
    
    const updatedVersions = sorted.map((v, idx) => {
        return {
            ...v,
            x: direction === 'horizontal' ? startX + (idx * (CARD_WIDTH + CARD_GAP)) : startX,
            y: direction === 'horizontal' ? startY : startY + (idx * 600)
        };
    });

    const newItem = { ...currentItem, versions: updatedVersions };
    setCurrentItem(newItem);
    await savePrompt(newItem);
    onUpdate(newItem);
    setTimeout(handleResetView, 50);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const downloadImage = (dataUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        const newAttachment: Attachment = {
          name: file.name,
          mimeType: file.type,
          data: ev.target.result as string
        };
        setActiveAttachment(newAttachment);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-canvas">
      {/* --- Fixed Input Area (Collapsible) --- */}
      <div 
        className={`absolute top-0 left-0 right-0 z-50 flex flex-col items-center transition-transform duration-500 ease-in-out pointer-events-none ${
          isInputCollapsed ? '-translate-y-[calc(100%-40px)]' : 'translate-y-0'
        }`}
      >
        {/* Spacer */}
        <div className="h-6 w-full shrink-0"></div>

        {/* The Box */}
        <div className="w-full max-w-4xl bg-panel/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl p-1 flex flex-col pointer-events-auto relative">
          
          {/* Attachment Preview in Editor */}
          {activeAttachment && (
             <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-2 rounded-t-xl border-b border-slate-700/50 animate-in fade-in slide-in-from-top-1">
                <Icons.Paperclip className="w-3.5 h-3.5 text-accent" />
                <span className="text-xs text-slate-300 truncate max-w-[300px]">参考图: {activeAttachment.name}</span>
                <button 
                  onClick={() => setActiveAttachment(null)}
                  className="ml-auto text-slate-500 hover:text-red-400 p-1"
                  title="移除参考图"
                >
                  <Icons.X className="w-3.5 h-3.5" />
                </button>
             </div>
          )}

          <textarea 
            className={`w-full bg-slate-900/50 p-4 text-slate-200 text-lg leading-relaxed focus:bg-slate-900 outline-none resize-none min-h-[120px] transition-all ${activeAttachment ? 'rounded-b-xl' : 'rounded-xl'}`}
            style={{ scrollbarWidth: 'none' }}
            value={editableText}
            onChange={(e) => setEditableText(e.target.value)}
            placeholder="在此描述您的画面..."
          />
          <div className="flex justify-between items-center px-2 py-2">
             <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 font-mono">
                    {editableText.length} 字符
                </span>
                <button 
                   onClick={() => setIsEditorExpanded(true)}
                   className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-accent transition-colors flex items-center gap-1 text-xs font-medium"
                   title="全屏编辑"
                >
                   <Icons.Maximize className="w-3.5 h-3.5" />
                   全屏编辑
                </button>
                {/* Upload Trigger in Canvas */}
                <label className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-accent transition-colors flex items-center gap-1 text-xs font-medium cursor-pointer">
                   <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                   <Icons.Paperclip className="w-3.5 h-3.5" />
                   {activeAttachment ? '更换参考图' : '添加参考图'}
                </label>
             </div>
             <div className="flex gap-2">
                <button 
                  onClick={() => setIsVideoModalOpen(true)}
                  disabled={isGenerating}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  <Icons.Video className="w-4 h-4" />
                  转视频
                </button>
                <button 
                  onClick={() => handleRegenerate()}
                  disabled={isGenerating}
                  className="px-6 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium flex items-center gap-2 shadow-lg shadow-accent/20 transition-colors"
                >
                  {isGenerating ? <Icons.Refresh className="w-4 h-4 animate-spin" /> : <Icons.Image className="w-4 h-4" />}
                  {isGenerating ? '绘制中...' : (activeAttachment ? '参考生成' : '生成画面')}
                </button>
             </div>
          </div>
        </div>

        {/* The Toggle Handle */}
        <button 
          onClick={() => setIsInputCollapsed(!isInputCollapsed)}
          className="h-10 px-6 bg-panel/95 backdrop-blur border border-t-0 border-slate-700/80 rounded-b-xl shadow-lg flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white cursor-pointer pointer-events-auto transition-colors"
        >
           {isInputCollapsed ? (
             <>
               <Icons.Edit className="w-4 h-4" />
               <span className="tracking-wide">编辑提示词</span>
             </>
           ) : (
             <Icons.ChevronUp className="w-5 h-5" />
           )}
        </button>
      </div>

      {/* --- Full Screen Editor Modal --- */}
      {isEditorExpanded && (
        <div className="absolute inset-0 z-[60] bg-canvas/95 backdrop-blur-md flex flex-col p-6 animate-in fade-in duration-200">
           <div className="w-full max-w-5xl mx-auto h-full flex flex-col bg-panel border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-800/50">
                 <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Icons.Maximize className="w-5 h-5 text-accent" />
                    全屏编辑模式
                 </h3>
                 <button 
                    onClick={() => setIsEditorExpanded(false)}
                    className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium flex items-center gap-2"
                 >
                    <Icons.Minimize className="w-4 h-4" />
                    收起
                 </button>
              </div>
              <textarea 
                 className="flex-1 w-full bg-slate-900 p-6 text-slate-200 text-xl leading-relaxed outline-none resize-none"
                 value={editableText}
                 onChange={(e) => setEditableText(e.target.value)}
                 placeholder="在此尽情挥洒您的创意..."
                 autoFocus
              />
              <div className="px-6 py-3 border-t border-slate-700 bg-slate-800/50 text-right">
                 <span className="text-sm text-slate-500 font-mono mr-4">
                    {editableText.length} 字符
                 </span>
              </div>
           </div>
        </div>
      )}

      {/* --- Canvas Controls --- */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-panel/90 backdrop-blur border border-slate-700 p-2 rounded-full shadow-xl">
         <button onClick={() => handleZoomButton(-1)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white" title="缩小">
            <Icons.ZoomOut className="w-5 h-5" />
         </button>
         <span className="text-xs font-mono w-12 text-center text-slate-500">{Math.round(view.scale * 100)}%</span>
         <button onClick={() => handleZoomButton(1)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white" title="放大">
            <Icons.ZoomIn className="w-5 h-5" />
         </button>
         <div className="w-px h-6 bg-slate-700 mx-1"></div>
         <button onClick={handleResetView} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white" title="重置视图 (居中全部)">
            <Icons.Move className="w-5 h-5" />
         </button>
         <div className="w-px h-6 bg-slate-700 mx-1"></div>
         <button onClick={() => alignVersions('horizontal')} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white" title="横向整理">
            <Icons.AlignHorizontal className="w-5 h-5" />
         </button>
         <button onClick={() => alignVersions('vertical')} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white" title="纵向整理">
            <Icons.AlignVertical className="w-5 h-5" />
         </button>
      </div>

      {/* --- Infinite Canvas Layer --- */}
      <div 
        ref={containerRef}
        className="absolute inset-0 overflow-hidden cursor-grab active:cursor-grabbing bg-[#0f172a]"
        onWheel={handleWheel}
        onMouseDown={(e) => handleMouseDown(e)}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
         {/* Dot Grid Background */}
         <div 
           className="absolute inset-0 pointer-events-none opacity-20"
           style={{
             backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 1px)',
             backgroundSize: `${30 * view.scale}px ${30 * view.scale}px`,
             backgroundPosition: `${view.x}px ${view.y}px`
           }}
         />
         
         {/* Transform Container */}
         <div 
           className="absolute origin-top-left transition-transform duration-75 ease-out"
           style={{ 
             transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
             width: '100%',
             height: '100%'
           }}
         >
            {/* Guide Lines Layer */}
            {(guides.x !== null || guides.y !== null) && (
               <div className="absolute inset-0 pointer-events-none z-20">
                  {guides.x !== null && (
                     <div 
                       className="absolute top-0 bottom-0 border-l border-dashed border-accent shadow-[0_0_8px_rgba(99,102,241,0.8)]"
                       style={{ left: guides.x, height: '20000px', top: '-10000px' }}
                     />
                  )}
                  {guides.y !== null && (
                     <div 
                       className="absolute left-0 right-0 border-t border-dashed border-accent shadow-[0_0_8px_rgba(99,102,241,0.8)]"
                       style={{ top: guides.y, width: '20000px', left: '-10000px' }}
                     />
                  )}
               </div>
            )}

            {currentItem.versions.map((version, index) => {
                const isVideo = !!version.videoSettings;
                const prevVersion = currentItem.versions[index - 1];
                
                const x = version.x || 0;
                const y = version.y || 300;

                return (
                   <div 
                      key={version.id}
                      className="absolute flex flex-col transition-shadow duration-200"
                      style={{ 
                        left: x, 
                        top: y,
                        width: CARD_WIDTH,
                        zIndex: drag.cardId === version.id ? 100 : 10,
                        boxShadow: (drag.cardId === version.id && (guides.x !== null || guides.y !== null)) 
                           ? '0 0 20px rgba(99, 102, 241, 0.3)' 
                           : 'none'
                      }}
                   >
                      <div 
                        className="bg-panel border border-slate-700 rounded-xl shadow-2xl overflow-hidden group hover:border-accent/50 transition-colors"
                      >
                         {/* Card Header (Drag Handle) */}
                         <div 
                           className="bg-slate-800/50 border-b border-slate-700 p-3 flex justify-between items-center cursor-grab active:cursor-grabbing"
                           onMouseDown={(e) => handleMouseDown(e, version.id)}
                         >
                            <div className="flex items-center gap-2">
                               <span className="bg-slate-700 text-xs px-1.5 py-0.5 rounded text-slate-300 font-mono">V{index + 1}</span>
                               <span className="text-[10px] text-slate-500">{new Date(version.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <button 
                                  onClick={(e) => { 
                                    e.preventDefault();
                                    e.stopPropagation(); 
                                    handleCopy(version.text, version.id); 
                                  }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onMouseUp={(e) => e.stopPropagation()}
                                  className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
                                  title="复制"
                                >
                                   {copiedId === version.id ? <Icons.Check className="w-3 h-3 text-emerald-400" /> : <Icons.Copy className="w-3 h-3" />}
                                </button>
                                {!isVideo && version.imageUrl && (
                                  <button 
                                    onClick={(e) => { 
                                      e.preventDefault();
                                      e.stopPropagation(); 
                                      downloadImage(version.imageUrl!, `v${index+1}.png`); 
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onMouseUp={(e) => e.stopPropagation()}
                                    className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
                                    title="下载"
                                  >
                                     <Icons.Download className="w-3 h-3" />
                                  </button>
                                )}
                                <div className="w-px h-3 bg-slate-700 mx-1"></div>
                                <button 
                                  onClick={(e) => { 
                                    e.preventDefault();
                                    e.stopPropagation(); 
                                    handleDeleteVersion(version.id); 
                                  }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onMouseUp={(e) => e.stopPropagation()}
                                  className="p-1.5 hover:bg-red-500 hover:text-white rounded text-slate-500 transition-colors"
                                  title="删除此卡片"
                                >
                                   <Icons.Trash className="w-3.5 h-3.5" />
                                </button>
                            </div>
                         </div>

                         {/* Card Content */}
                         <div className="p-0">
                            {isVideo ? (
                                <div className="bg-black/40 p-4">
                                   <div className="flex items-center gap-2 mb-3 text-purple-400 font-bold text-sm">
                                      <Icons.Video className="w-4 h-4" />
                                      视频提示词
                                   </div>
                                   <div className="flex flex-wrap gap-1 mb-3">
                                      <Tag>{version.videoSettings?.style}</Tag>
                                      <Tag>{version.videoSettings?.cameraMovement}</Tag>
                                      <Tag>{version.videoSettings?.action}</Tag>
                                      <Tag>{version.videoSettings?.width}x{version.videoSettings?.height}</Tag>
                                      <Tag>{version.videoSettings?.duration}</Tag>
                                   </div>
                                   <div className="bg-slate-900/50 p-3 rounded border border-slate-800 text-xs text-slate-300 max-h-[150px] overflow-y-auto">
                                      {version.text}
                                   </div>
                                </div>
                            ) : (
                                <div>
                                   <img 
                                     src={version.imageUrl} 
                                     alt={`V${index+1}`}
                                     className="w-full h-auto block bg-slate-950"
                                     draggable={false}
                                   />
                                   <div className="p-3 bg-slate-900/30 border-t border-slate-800">
                                      {prevVersion && !prevVersion.videoSettings ? (
                                         <div className="text-xs max-h-[100px] overflow-y-auto">
                                            <DiffViewer oldText={prevVersion.text} newText={version.text} />
                                         </div>
                                      ) : (
                                         <p className="text-xs text-slate-400 max-h-[100px] overflow-y-auto">{version.text}</p>
                                      )}
                                   </div>
                                </div>
                            )}
                         </div>
                      </div>
                   </div>
                );
            })}
         </div>
      </div>
      
      <VideoModal 
        isOpen={isVideoModalOpen} 
        onClose={() => setIsVideoModalOpen(false)} 
        onGenerate={handleVideoConversion}
        isGenerating={isGenerating}
      />
    </div>
  );
};

const Tag = ({ children }: { children?: React.ReactNode }) => {
  if (!children) return null;
  return (
    <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px] text-slate-400">
      {children}
    </span>
  );
};
