/**
 * storage.js — IndexedDB Wrapper
 * Promise 기반 CRUD + 진행도 부분 업데이트
 */
const Storage = (() => {
    const DB_NAME = 'cstitch-db';
    const DB_VERSION = 1;
    const STORE_NAME = 'projects';
    let db = null;

    /**
     * DB 초기화 — 앱 시작 시 한 번 호출
     */
    function init() {
        return new Promise((resolve, reject) => {
            if (db) { resolve(db); return; }
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const database = e.target.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('updatedAt', 'updatedAt', { unique: false });
                }
            };
            req.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
            };
            req.onerror = (e) => {
                console.error('[Storage] DB open error:', e.target.error);
                reject(e.target.error);
            };
        });
    }

    /** 트랜잭션 헬퍼 */
    function getStore(mode) {
        const tx = db.transaction(STORE_NAME, mode);
        return tx.objectStore(STORE_NAME);
    }

    /** IDB 요청을 Promise로 래핑 */
    function promisify(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * UUID 생성 (crypto API 기반)
     */
    function generateId() {
        if (crypto.randomUUID) return crypto.randomUUID();
        return 'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    /**
     * 프로젝트 저장 (insert or update)
     * @param {Object} project — id가 없으면 자동 생성
     * @returns {Promise<string>} 저장된 프로젝트 id
     */
    function save(project) {
        if (!project.id) {
            project.id = generateId();
            project.createdAt = Date.now();
        }
        project.updatedAt = Date.now();
        const store = getStore('readwrite');
        return promisify(store.put(project)).then(() => project.id);
    }

    /**
     * 단일 프로젝트 로드
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    async function load(id) {
        const store = getStore('readonly');
        const project = await promisify(store.get(id));
        if (project && project.dmcPalette) {
            const symbols = '■□▲△●○◆◇★☆♠♣♥♦▼▽◀▷♤♧♡♢⊕⊗⊞⊟⊠⊡';
            project.dmcPalette.forEach((c, i) => {
                if (!c.symbol) c.symbol = symbols[i % symbols.length];
            });
        }
        return project;
    }

    /**
     * 전체 프로젝트 목록 (최신순 정렬)
     * 대용량 필드(pixelMap, progress)는 포함됨 — 목록용으로 필요시 별도 처리
     * @returns {Promise<Array>}
     */
    function list() {
        return new Promise((resolve, reject) => {
            const store = getStore('readonly');
            const req = store.index('updatedAt').openCursor(null, 'prev');
            const results = [];
            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    const p = cursor.value;
                    if (p.dmcPalette) {
                        const symbols = '■□▲△●○◆◇★☆♠♣♥♦▼▽◀▷♤♧♡♢⊕⊗⊞⊟⊠⊡';
                        p.dmcPalette.forEach((c, i) => {
                            if (!c.symbol) c.symbol = symbols[i % symbols.length];
                        });
                    }
                    results.push(p);
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * 프로젝트 삭제
     * @param {string} id
     * @returns {Promise<void>}
     */
    function remove(id) {
        const store = getStore('readwrite');
        return promisify(store.delete(id));
    }

    /**
     * 진행도만 부분 업데이트 (스티치 마킹 시 사용)
     * 전체 프로젝트를 로드→수정→저장하지 않고, 필요한 필드만 업데이트
     * @param {string} id
     * @param {Uint8Array} progressData — 비트 배열
     * @param {number} completedCount — 완료된 스티치 수
     * @returns {Promise<void>}
     */
    function updateProgress(id, progressData, completedCount) {
        return new Promise((resolve, reject) => {
            const store = getStore('readwrite');
            const req = store.get(id);
            req.onsuccess = () => {
                const project = req.result;
                if (!project) { reject(new Error('Project not found')); return; }
                project.progress = progressData;
                project.completedCount = completedCount;
                project.updatedAt = Date.now();
                const putReq = store.put(project);
                putReq.onsuccess = () => resolve();
                putReq.onerror = () => reject(putReq.error);
            };
            req.onerror = () => reject(req.error);
        });
    }

    return { init, save, load, list, remove, updateProgress, generateId };
})();
