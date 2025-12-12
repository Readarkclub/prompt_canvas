
import { User, PromptItem } from '../types';
import { generateId } from './idService';

const DB_NAME = 'PromptCanvasDB';
const DB_VERSION = 1;
const STORE_USERS = 'users';
const STORE_PROMPTS = 'prompts';

// Helper to open DB
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_USERS)) {
        const userStore = db.createObjectStore(STORE_USERS, { keyPath: 'id' });
        userStore.createIndex('username', 'username', { unique: true });
      }
      if (!db.objectStoreNames.contains(STORE_PROMPTS)) {
        const promptStore = db.createObjectStore(STORE_PROMPTS, { keyPath: 'id' });
        promptStore.createIndex('userId', 'userId', { unique: false });
      }
    };

    request.onsuccess = async () => {
        const db = request.result;
        // Attempt migration if needed
        try {
            if (localStorage.getItem('promptcanvas_data') || localStorage.getItem('promptcanvas_users')) {
                await migrateData(db);
            }
        } catch (e) {
            console.error("Migration failed", e);
        }
        resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
};

const migrateData = async (db: IDBDatabase) => {
    return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_USERS, STORE_PROMPTS], 'readwrite');
        
        transaction.oncomplete = () => {
            localStorage.removeItem('promptcanvas_data');
            localStorage.removeItem('promptcanvas_users');
            resolve();
        };
        transaction.onerror = () => reject(transaction.error);

        const usersStr = localStorage.getItem('promptcanvas_users');
        if (usersStr) {
            try {
                const users = JSON.parse(usersStr);
                const userStore = transaction.objectStore(STORE_USERS);
                if (Array.isArray(users)) {
                    users.forEach((u: any) => userStore.put(u));
                }
            } catch (e) { console.error('Failed to migrate users', e) }
        }

        const dataStr = localStorage.getItem('promptcanvas_data');
        if (dataStr) {
            try {
                const prompts = JSON.parse(dataStr);
                const promptStore = transaction.objectStore(STORE_PROMPTS);
                if (Array.isArray(prompts)) {
                    prompts.forEach((p: any) => promptStore.put(p));
                }
            } catch (e) { console.error('Failed to migrate prompts', e) }
        }
    });
};

// Extended User type for internal storage
interface StoredUser extends User {
  password?: string;
}

export const getSessionUser = (): User | null => {
  const stored = localStorage.getItem('promptcanvas_session');
  return stored ? JSON.parse(stored) : null;
};

export const registerUser = async (username: string, password?: string): Promise<User> => {
  const db = await openDB();
  
  // Check existing
  const existing = await new Promise<StoredUser | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_USERS, 'readonly');
      const store = tx.objectStore(STORE_USERS);
      const index = store.index('username');
      const req = index.get(username);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
  });

  if (existing) {
      throw new Error("用户名已存在");
  }

  const newUser: StoredUser = {
    id: generateId(),
    username,
    createdAt: Date.now(),
    password
  };

  await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_USERS, 'readwrite');
      const store = tx.objectStore(STORE_USERS);
      store.put(newUser);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
  });

  const { password: _, ...userSession } = newUser;
  localStorage.setItem('promptcanvas_session', JSON.stringify(userSession));
  return userSession;
};

export const loginUser = async (username: string, password?: string): Promise<User> => {
  const db = await openDB();
  
  const user = await new Promise<StoredUser | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_USERS, 'readonly');
      const store = tx.objectStore(STORE_USERS);
      const index = store.index('username');
      const req = index.get(username);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
  });
  
  if (!user) {
    throw new Error("用户不存在");
  }

  if (password && user.password && user.password !== password) {
    throw new Error("密码错误");
  }
  
  const { password: _, ...userSession } = user;
  localStorage.setItem('promptcanvas_session', JSON.stringify(userSession));
  return userSession;
};

export const logoutUser = () => {
  localStorage.removeItem('promptcanvas_session');
};

export const getPrompts = async (userId: string): Promise<PromptItem[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PROMPTS, 'readonly');
        const store = tx.objectStore(STORE_PROMPTS);
        const index = store.index('userId');
        const req = index.getAll(userId);
        
        req.onsuccess = () => {
            const res = req.result as PromptItem[];
            resolve(res ? res.sort((a, b) => b.updatedAt - a.updatedAt) : []);
        };
        req.onerror = () => reject(req.error);
    });
};

export const savePrompt = async (prompt: PromptItem): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PROMPTS, 'readwrite');
        const store = tx.objectStore(STORE_PROMPTS);
        store.put(prompt);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const deletePrompt = async (promptId: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PROMPTS, 'readwrite');
        const store = tx.objectStore(STORE_PROMPTS);
        store.delete(promptId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const exportDatabase = async (userId: string): Promise<string> => {
  const prompts = await getPrompts(userId);
  const data = {
    meta: {
      version: 1,
      exportedAt: Date.now(),
      userId
    },
    prompts
  };
  return JSON.stringify(data, null, 2);
};

export const importDatabase = async (targetUserId: string, jsonContent: string): Promise<void> => {
  const db = await openDB();
  let parsed;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (e) {
    throw new Error("Invalid JSON format");
  }
  
  // Support both wrapped format and raw array
  const prompts: PromptItem[] = Array.isArray(parsed) ? parsed : (parsed.prompts || []);
  
  if (!Array.isArray(prompts)) {
    throw new Error("No valid prompts data found in file");
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROMPTS, 'readwrite');
    const store = tx.objectStore(STORE_PROMPTS);
    
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);

    prompts.forEach(p => {
      // Validate essential fields
      if (!p.id || !p.title) return;
      
      // Ensure the imported prompt belongs to the current user
      const importedPrompt = { ...p, userId: targetUserId };
      store.put(importedPrompt);
    });
  });
};
