import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icons } from './components/Icons';
import { User, PromptItem, PromptType } from './types';
import { loginUser, registerUser, logoutUser, getSessionUser, getPrompts, savePrompt, deletePrompt, exportDatabase, importDatabase } from './services/storageService';
import { classifyPrompt, getApiKeyInfo } from './services/geminiService';
import { ImageCanvas } from './components/ImageCanvas';
import { ChatInterface } from './components/ChatInterface';

// ... (Sidebar, SettingsPage, LoginPage, Dashboard components remain unchanged)
const Sidebar = ({ user, onLogout, onCloseMobile }: { user: User, onLogout: () => void, onCloseMobile?: () => void }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const version = "v1.2"; // Version indicator for caching checks
  
  const NavItem = ({ path, icon: Icon, label }: any) => (
    <button 
      onClick={() => {
        navigate(path);
        onCloseMobile && onCloseMobile();
      }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors mb-1 ${
        location.pathname === path && !location.search ? 'bg-accent/10 text-accent' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="font-medium text-sm">{label}</span>
    </button>
  );

  return (
    <div className="w-full h-full flex flex-col bg-panel">
      <div className="p-6 border-b border-slate-700 shrink-0 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-accent to-purple-400 flex items-center gap-2">
          <Icons.Layers className="w-8 h-8 text-accent" />
          观想阁
        </h1>
        {/* Mobile Close Button */}
        {onCloseMobile && (
          <button onClick={onCloseMobile} className="md:hidden text-slate-400 hover:text-white">
            <Icons.X className="w-6 h-6" />
          </button>
        )}
      </div>
      
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="mb-6">
           <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">菜单</p>
           <NavItem path="/dashboard" icon={Icons.LayoutGrid} label="仪表盘" />
           <NavItem path="/library" icon={Icons.History} label="灵感库" />
           <NavItem path="/settings" icon={Icons.Settings} label="设置 & 数据" />
        </div>
      </div>

      <div className="p-4 border-t border-slate-700 bg-slate-800/30 shrink-0">
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center font-bold text-xs text-white">
            {user.username.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user.username}</p>
            <p className="text-xs text-slate-500">免费版 ({version})</p>
          </div>
        </div>
        <button onClick={onLogout} className="w-full flex items-center gap-2 text-slate-400 hover:text-red-400 px-2 py-1 text-xs transition-colors">
          <Icons.LogOut className="w-3 h-3" /> 退出登录
        </button>
      </div>
    </div>
  );
};

const SettingsPage = ({ user }: { user: User }) => {
  const [jsonOutput, setJsonOutput] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [apiKeyInfo, setApiKeyInfo] = useState<any>({ status: 'loading', length: 0, preview: '...' });

  useEffect(() => {
    getApiKeyInfo().then(setApiKeyInfo);
  }, []);

  const handleExport = async () => {
    try {
      const json = await exportDatabase(user.id);
      setJsonOutput(json);
      
      // Auto download
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `promptcanvas_backup_${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('导出失败');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
       const content = ev.target?.result as string;
       if (!content) return;
       try {
          setImportStatus('导入中...');
          await importDatabase(user.id, content);
          setImportStatus('导入成功！请刷新页面。');
          setTimeout(() => window.location.reload(), 1500);
       } catch (err: any) {
          setImportStatus(`错误: ${err.message}`);
       }
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-8 h-full overflow-y-auto">
      <h2 className="text-2xl font-bold text-white mb-8">设置 & 数据管理</h2>

      {/* API Key Diagnostic Section */}
      <div className="mb-8 bg-slate-900/50 border border-slate-700 rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Icons.Activity className="w-5 h-5 text-accent" />
              API 连接诊断
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="bg-slate-800 p-3 rounded-lg">
                  <span className="text-slate-400 block text-xs mb-1">状态</span>
                  <span className={`font-mono font-bold ${apiKeyInfo.status === 'valid_format' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {apiKeyInfo.status === 'valid_format' ? '格式正常' : apiKeyInfo.status === 'missing' ? '未配置' : '格式异常'}
                  </span>
              </div>
              <div className="bg-slate-800 p-3 rounded-lg">
                  <span className="text-slate-400 block text-xs mb-1">Key 预览</span>
                  <span className="font-mono text-white">{apiKeyInfo.preview}</span>
              </div>
              <div className="bg-slate-800 p-3 rounded-lg">
                  <span className="text-slate-400 block text-xs mb-1">长度检查</span>
                  <span className="font-mono text-white">{apiKeyInfo.length} 字符</span>
              </div>
          </div>
          <div className="mt-3 text-xs text-slate-500">
             提示：如果状态显示异常，请检查 EdgeOne 环境变量配置。Key 应以 "AIza" 开头，且不包含引号。
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl">
        <div className="bg-panel border border-slate-700 rounded-xl p-6">
           <div className="w-12 h-12 bg-indigo-500/20 rounded-lg flex items-center justify-center text-indigo-400 mb-4">
             <Icons.Download className="w-6 h-6" />
           </div>
           <h3 className="text-lg font-bold text-white mb-2">导出数据 (备份)</h3>
           <p className="text-slate-400 text-sm mb-6">
             将您的所有提示词、生成的图片和对话记录打包下载为 JSON 文件。您可以在其他设备上导入此文件以实现数据同步。
           </p>
           <button 
             onClick={handleExport}
             className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
           >
             <Icons.Download className="w-4 h-4" />
             导出并下载
           </button>
        </div>

        <div className="bg-panel border border-slate-700 rounded-xl p-6">
           <div className="w-12 h-12 bg-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-400 mb-4">
             <Icons.Upload className="w-6 h-6" />
           </div>
           <h3 className="text-lg font-bold text-white mb-2">导入数据 (恢复)</h3>
           <p className="text-slate-400 text-sm mb-6">
             上传之前备份的 JSON 文件。注意：这将合并数据到当前设备，如果 ID 冲突会覆盖旧数据。
           </p>
           <div className="relative">
              <input 
                type="file" 
                accept=".json"
                onChange={handleImport}
                className="hidden" 
                id="file-upload"
              />
              <label 
                htmlFor="file-upload"
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer w-fit"
              >
                <Icons.Upload className="w-4 h-4" />
                选择文件上传
              </label>
           </div>
           {importStatus && (
             <p className={`mt-4 text-sm ${importStatus.includes('错误') ? 'text-red-400' : 'text-emerald-400'}`}>
               {importStatus}
             </p>
           )}
        </div>
      </div>

      <div className="mt-12 p-6 bg-slate-900/50 rounded-xl border border-slate-800">
         <h4 className="text-white font-bold mb-2 flex items-center gap-2">
            <Icons.Activity className="w-4 h-4 text-slate-500" />
            关于跨平台同步
         </h4>
         <p className="text-slate-400 text-sm leading-relaxed">
            当前为“离线优先”模式，数据存储在您设备的浏览器数据库中 (IndexedDB)，因此不同设备间数据默认不互通。
            使用上方的<b>导出</b>和<b>导入</b>功能，您可以手动将数据从电脑迁移到手机，或在不同浏览器间同步。
         </p>
      </div>
    </div>
  );
};

const LoginPage = ({ onLogin }: { onLogin: (u: User) => void }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username.trim() || !password.trim()) {
      setError("请输入用户名和密码");
      return;
    }

    if (isRegister && password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setLoading(true);
    try {
      let user;
      if (isRegister) {
        user = await registerUser(username, password);
      } else {
        user = await loginUser(username, password);
      }
      onLogin(user);
    } catch (err: any) {
      setError(err.message || "操作失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-canvas relative overflow-hidden">
       <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none"></div>
       <div className="w-full max-w-md bg-panel border border-slate-700 p-8 rounded-2xl shadow-2xl relative z-10 mx-4">
         <div className="text-center mb-8">
            <div className="w-16 h-16 bg-accent/20 rounded-2xl mx-auto flex items-center justify-center mb-4 text-accent">
              <Icons.Layers className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              {isRegister ? '创建账号' : '欢迎回来'}
            </h1>
            <p className="text-slate-400">
              {isRegister ? '加入观想阁，开启您的创意之旅。' : '登录以访问您的专属提示词库。'}
            </p>
         </div>
         
         <form onSubmit={handleSubmit} className="space-y-4">
           <div>
             <label className="block text-sm font-medium text-slate-300 mb-1">用户名</label>
             <input 
               type="text" 
               value={username}
               onChange={e => setUsername(e.target.value)}
               className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-accent outline-none transition-all"
               placeholder="请输入您的用户名"
             />
           </div>
           <div>
             <label className="block text-sm font-medium text-slate-300 mb-1">密码</label>
             <input 
               type="password" 
               value={password}
               onChange={e => setPassword(e.target.value)}
               className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-accent outline-none transition-all"
               placeholder="请输入密码"
             />
           </div>
           
           {isRegister && (
             <div className="animate-in slide-in-from-top-2 duration-300">
               <label className="block text-sm font-medium text-slate-300 mb-1">确认密码</label>
               <input 
                 type="password" 
                 value={confirmPassword}
                 onChange={e => setConfirmPassword(e.target.value)}
                 className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-accent outline-none transition-all"
                 placeholder="再次输入密码"
               />
             </div>
           )}

           {error && (
             <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-center gap-2 text-red-300 text-sm">
               <Icons.X className="w-4 h-4" />
               {error}
             </div>
           )}

           <button 
             type="submit" 
             disabled={loading}
             className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-lg transition-all disabled:opacity-70 flex items-center justify-center gap-2 mt-2"
           >
             {loading && <Icons.Refresh className="w-4 h-4 animate-spin" />}
             {loading ? '处理中...' : (isRegister ? '立即注册' : '登录')}
           </button>
         </form>

         <div className="mt-6 text-center">
           <p className="text-slate-400 text-sm">
             {isRegister ? '已有账号？' : '还没有账号？'}
             <button 
               onClick={() => {
                 setIsRegister(!isRegister);
                 setError('');
                 setUsername('');
                 setPassword('');
                 setConfirmPassword('');
               }}
               className="text-accent hover:underline ml-1 font-medium"
             >
               {isRegister ? '去登录' : '免费注册'}
             </button>
           </p>
         </div>
       </div>
    </div>
  );
};

const Dashboard = ({ user }: { user: User }) => {
  const [input, setInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const navigate = useNavigate();
  
  const handleQuickAdd = async () => {
    if (!input.trim()) return;
    setIsAnalyzing(true);
    try {
      const classification = await classifyPrompt(input);
      
      const newPrompt: PromptItem = {
        id: crypto.randomUUID(),
        userId: user.id,
        title: classification.title,
        type: classification.type,
        tags: classification.tags,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        activeVersionId: '',
        versions: [],
        chatHistory: []
      };

      if (classification.type === PromptType.IMAGE) {
        // Initialize with no versions, just draft text
        newPrompt.versions = [];
        newPrompt.activeVersionId = '';
        newPrompt.draftText = input;
      } else {
        newPrompt.chatHistory = [{ role: 'user', text: input, timestamp: Date.now() }];
      }

      await savePrompt(newPrompt);
      navigate(`/prompt/${newPrompt.id}`);
    } catch (e: any) {
      console.error(e);
      alert(`创建提示词出错: ${e.message || e}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center max-w-3xl mx-auto">
      <h2 className="text-4xl font-bold text-white mb-6">今天想创作什么？</h2>
      <div className="w-full relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-accent to-purple-600 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
        <div className="relative flex items-center bg-slate-900 rounded-xl p-2 border border-slate-700">
           <input 
             type="text" 
             value={input}
             onChange={e => setInput(e.target.value)}
             onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
             placeholder="描述一个画面或提出一个问题..."
             className="w-full bg-transparent border-none outline-none text-lg px-4 py-3 text-white placeholder-slate-500"
           />
           <button 
             onClick={handleQuickAdd}
             disabled={isAnalyzing}
             className="bg-slate-800 hover:bg-slate-700 text-white p-3 rounded-lg transition-colors"
           >
             {isAnalyzing ? <Icons.Refresh className="w-6 h-6 animate-spin text-accent" /> : <Icons.Plus className="w-6 h-6" />}
           </button>
        </div>
      </div>
      
      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
         <div 
           className="bg-panel border border-slate-700 p-6 rounded-xl text-left hover:border-accent transition-colors cursor-pointer group" 
           onClick={() => navigate('/library?category=visual')}
         >
            <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 group-hover:scale-110 transition-transform">
               <Icons.Image className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">视觉画廊</h3>
            <p className="text-slate-400 text-sm">管理绘画提示词，可视化生成，转换为视频脚本。</p>
         </div>
         <div 
           className="bg-panel border border-slate-700 p-6 rounded-xl text-left hover:border-accent transition-colors cursor-pointer group" 
           onClick={() => navigate('/library?category=text')}
         >
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 group-hover:scale-110 transition-transform">
               <Icons.MessageSquare className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">思维实验室</h3>
            <p className="text-slate-400 text-sm">逻辑推理、代码编写及复杂问题的对话式提示词。</p>
         </div>
      </div>
    </div>
  );
};

const Library = ({ user }: { user: User }) => {
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const category = searchParams.get('category');

  useEffect(() => {
    getPrompts(user.id).then(data => {
      setPrompts(data);
      setLoading(false);
    });
  }, [user.id]);

  const filtered = prompts.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase()) || p.tags.some(t => t.toLowerCase().includes(search.toLowerCase()));
    
    if (!matchesSearch) return false;

    if (category === 'visual') {
       return p.type === PromptType.IMAGE || p.type === PromptType.VIDEO_PLAN;
    }
    if (category === 'text') {
       return p.type === PromptType.TEXT;
    }
    
    return true;
  });

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if(window.confirm('确定要删除此提示词吗？操作不可恢复。')) {
      // Optimistic update
      setPrompts(prev => prev.filter(p => p.id !== id));
      await deletePrompt(id);
    }
  }

  const getTitle = () => {
      if (category === 'visual') return '视觉画廊';
      if (category === 'text') return '思维实验室';
      return '您的灵感库';
  };

  return (
    <div className="p-8 h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-2">
           {category && (
             <button onClick={() => navigate('/library')} className="text-slate-400 hover:text-white mr-2" title="查看全部">
               <Icons.ChevronLeft className="w-6 h-6" />
             </button>
           )}
           <h2 className="text-2xl font-bold text-white">{getTitle()}</h2>
        </div>
        <div className="relative">
           <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
           <input 
             type="text" 
             placeholder="搜索提示词..." 
             value={search}
             onChange={e => setSearch(e.target.value)}
             className="bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:border-accent outline-none w-full md:w-64"
           />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-500 flex flex-col items-center">
           <Icons.Refresh className="w-8 h-8 animate-spin mb-4 opacity-50" />
           正在加载灵感库...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-slate-900/50 rounded-xl border border-slate-800 border-dashed">
           <Icons.Search className="w-12 h-12 text-slate-600 mx-auto mb-4" />
           <p className="text-slate-400">
               {category ? '此分类下暂无提示词。' : '暂无提示词。'}
               开始创作吧！
           </p>
           {search && <button onClick={() => setSearch('')} className="mt-4 text-accent text-sm hover:underline">清除搜索</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(prompt => {
            // Find background image from the first version that has one
            const bgImage = prompt.versions?.find(v => v.imageUrl)?.imageUrl;

            return (
            <div 
              key={prompt.id} 
              onClick={() => navigate(`/prompt/${prompt.id}`)}
              className="bg-panel border border-slate-700 rounded-xl p-4 hover:border-slate-500 transition-all cursor-pointer group relative flex flex-col h-48 overflow-hidden shadow-lg hover:shadow-xl"
            >
              {/* Background Image with Overlay */}
              {bgImage && (
                  <>
                    <div 
                        className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110 opacity-60 group-hover:opacity-80"
                        style={{ backgroundImage: `url(${bgImage})` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-slate-900/40" />
                  </>
              )}

              {/* Content relative z-10 */}
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex justify-between items-start mb-3">
                  <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-sm ${
                    prompt.type === PromptType.IMAGE || prompt.type === PromptType.VIDEO_PLAN 
                      ? 'bg-indigo-900/80 text-indigo-300 border border-indigo-500/30' 
                      : 'bg-emerald-900/80 text-emerald-300 border border-emerald-500/30'
                  }`}>
                    {prompt.type === PromptType.VIDEO_PLAN ? '视频' : prompt.type === PromptType.IMAGE ? '绘画' : '文本'}
                  </div>
                  <button 
                    type="button"
                    onClick={(e) => handleDelete(e, prompt.id)}
                    onMouseDown={(e) => e.stopPropagation()} 
                    className="text-slate-400 hover:text-red-400 hover:bg-red-500/20 p-1.5 rounded transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm bg-slate-900/50"
                    title="删除提示词"
                  >
                    <Icons.Trash className="w-4 h-4" />
                  </button>
                </div>
                
                <h3 className="font-bold text-white mb-2 line-clamp-2 drop-shadow-md text-lg">{prompt.title}</h3>
                
                <div className="flex flex-wrap gap-1 mb-auto">
                  {prompt.tags.slice(0, 3).map(t => (
                    <span key={t} className="text-[10px] bg-slate-800/80 backdrop-blur-sm border border-slate-700 text-slate-300 px-1.5 py-0.5 rounded">{t}</span>
                  ))}
                </div>
                
                <div className="pt-3 border-t border-white/10 text-[10px] text-slate-400 flex justify-between items-center mt-2">
                   <span>{new Date(prompt.updatedAt).toLocaleDateString()}</span>
                   <div className="flex items-center gap-1 group-hover:translate-x-1 transition-transform text-accent">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-medium">打开</span>
                      <Icons.ChevronRight className="w-3 h-3" />
                   </div>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const PromptDetail = ({ user }: { user: User }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState<PromptItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      setLoading(true);
      getPrompts(user.id).then(prompts => {
        const found = prompts.find(p => p.id === id);
        setPrompt(found || null);
        setLoading(false);
      });
    }
  }, [id, user.id]);

  const handleUpdate = (updated: PromptItem) => {
    setPrompt(updated);
  };

  if (loading) return <div className="flex items-center justify-center h-full text-slate-500">加载提示词中...</div>;
  if (!prompt) return (
    <div className="flex flex-col items-center justify-center h-full text-slate-500">
      <p className="mb-4">未找到提示词。</p>
      <button onClick={() => navigate('/library')} className="text-accent hover:underline">返回灵感库</button>
    </div>
  );

  const isReasoning = prompt.type === PromptType.TEXT;

  return (
    <div className="h-full flex flex-col">
       <div className="flex items-center gap-2 px-4 md:px-6 py-3 border-b border-slate-700 bg-panel shrink-0">
         <button onClick={() => navigate('/library')} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 transition-colors">
           <Icons.ChevronLeft className="w-5 h-5" />
         </button>
         <h1 className="font-semibold text-white truncate max-w-xs md:max-w-xl">{prompt.title}</h1>
       </div>
       
       <div className={`flex-1 ${isReasoning ? 'overflow-hidden' : 'overflow-y-auto'} p-4 md:p-6 relative`}>
         {isReasoning ? (
            <ChatInterface promptItem={prompt} onUpdate={handleUpdate} />
         ) : (
            <ImageCanvas promptItem={prompt} onUpdate={handleUpdate} />
         )}
       </div>
    </div>
  )
};

// ... (AuthenticatedLayout and App components remain unchanged)
const AuthenticatedLayout = ({ user, onLogout }: { user: User, onLogout: () => void }) => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const isWorkspace = location.pathname.startsWith('/prompt/');

  return (
    <div className="flex h-screen bg-canvas text-slate-200 overflow-hidden relative">
      
      {/* Mobile Header */}
      <div className="md:hidden absolute top-0 left-0 right-0 h-16 z-30 flex items-center px-4 justify-between pointer-events-none">
          {!isMobileMenuOpen && !isWorkspace && (
             <button 
               onClick={() => setIsMobileMenuOpen(true)} 
               className="p-2 bg-panel/80 backdrop-blur border border-slate-700 rounded-lg text-white pointer-events-auto shadow-lg"
             >
                <Icons.Menu className="w-6 h-6" />
             </button>
          )}
      </div>

      {/* Sidebar */}
      <div 
        className={`
          fixed inset-y-0 left-0 z-40 bg-panel border-r border-slate-700 w-64 transform transition-transform duration-300 ease-in-out
          md:relative md:transform-none
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          ${isWorkspace ? 'md:w-0 md:border-r-0 md:opacity-0 md:overflow-hidden' : 'md:w-64 md:opacity-100'}
        `}
      >
         <div className="w-64 h-full">
            <Sidebar user={user} onLogout={onLogout} onCloseMobile={() => setIsMobileMenuOpen(false)} />
         </div>
      </div>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative h-full transition-all duration-500 w-full">
         <Routes>
            <Route path="/dashboard" element={<Dashboard user={user} />} />
            <Route path="/library" element={<Library user={user} />} />
            <Route path="/settings" element={<SettingsPage user={user} />} />
            <Route path="/prompt/:id" element={<PromptDetail user={user} />} />
            <Route path="*" element={<Navigate to="/dashboard" />} />
         </Routes>
      </main>
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [init, setInit] = useState(false);

  useEffect(() => {
    const session = getSessionUser();
    if (session) setUser(session);
    setInit(true);
  }, []);

  const handleLogout = () => {
    logoutUser();
    setUser(null);
  };

  if (!init) return null;

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={!user ? <LoginPage onLogin={setUser} /> : <Navigate to="/dashboard" />} />
        <Route 
          path="/*" 
          element={user ? (
             <AuthenticatedLayout user={user} onLogout={handleLogout} />
          ) : (
             <Navigate to="/login" />
          )} 
        />
      </Routes>
    </HashRouter>
  );
};

export default App;