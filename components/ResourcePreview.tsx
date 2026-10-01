"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

type Draft = { title: string; desc: string; tag: string };
type SavedResource = Draft & {
  id: number;
  important: boolean;
  createdAt: string;
  updatedAt: string;
};
type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; resource: SavedResource; message: string }
  | { kind: "uncertain"; message: string }
  | { kind: "error"; message: string };
type ListState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "empty" }
  | { kind: "error"; message: string };
type EditDraft = Draft & { id: number; important: boolean };
type ActionState = { kind: "idle" | "busy" | "success" | "error" | "uncertain"; message: string };
type PublicUser = { id: number; username: string; createdAt: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSavedResource(value: unknown): value is SavedResource {
  return isObject(value) && Number.isInteger(value.id) &&
    typeof value.title === "string" && typeof value.desc === "string" &&
    typeof value.tag === "string" && typeof value.important === "boolean" &&
    typeof value.createdAt === "string" && typeof value.updatedAt === "string";
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("无法读取服务端的 JSON 回复，请检查接口响应。");
  }
  if (!isObject(body)) throw new Error("服务端回复格式不正确。");
  return body;
}

function responseError(response: Response, body: Record<string, unknown>) {
  return typeof body.error === "string" ? body.error : `请求失败（HTTP ${response.status}）。`;
}

function connectionError(error: unknown) {
  return error instanceof TypeError ? "无法连接服务端，请确认开发服务器仍在运行。" :
    error instanceof Error ? error.message : "请求失败，请稍后重试。";
}

const uncertainWrite = "尚未确认本次操作结果。请先重新读取资料列表，核对是否已经生效；不要直接重复提交。";

function inputError(draft: Draft, allowedTags: string[]) {
  if (!draft.title.trim()) return "请填写资料标题。";
  if (draft.title.trim().length > 100) return "资料标题不能超过 100 个字。";
  if (!draft.desc.trim()) return "请填写资料简介。";
  if (draft.desc.trim().length > 500) return "资料简介不能超过 500 个字。";
  if (!allowedTags.includes(draft.tag)) return "请选择已有的资料分类，不能选择“全部”。";
  return null;
}

export default function ResourcePreview({ tags }: { tags: string[] }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"register" | "login">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const categories = tags.filter((tag) => tag !== "全部");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [tag, setTag] = useState(categories[0] ?? "");
  const [preview, setPreview] = useState<Draft | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [listState, setListState] = useState<ListState>({ kind: "idle" });
  const [resources, setResources] = useState<SavedResource[]>([]);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [actionState, setActionState] = useState<ActionState>({ kind: "idle", message: "" });
  const saveBusy = useRef<number | null>(null);
  const actionBusy = useRef<number | null>(null);
  const accountEpoch = useRef(0);
  const listRequest = useRef<AbortController | null>(null);

  const clearAccountState = useCallback(() => {
    accountEpoch.current += 1;
    saveBusy.current = null;
    actionBusy.current = null;
    listRequest.current?.abort();
    listRequest.current = null;
    setResources([]);
    setListState({ kind: "idle" });
    setEditDraft(null);
    setPreview(null);
    setSaveState({ kind: "idle" });
    setActionState({ kind: "idle", message: "" });
    setTitle("");
    setDesc("");
    setTag(tags.find((value) => value !== "全部") ?? "");
    setUsername("");
    setPassword("");
    setAuthError("");
  }, [tags]);

  const expireSession = useCallback(() => {
    clearAccountState();
    setUser(null);
    setAuthMode("login");
    setAuthError("登录状态已经失效，请重新登录。");
  }, [clearAccountState]);

  const loadResources = useCallback(async () => {
    const epoch = accountEpoch.current;
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setListState({ kind: "loading" });
    try {
      const response = await fetch("/api/resources", { cache: "no-store", signal: controller.signal });
      const body = await readJson(response);
      if (epoch !== accountEpoch.current || controller.signal.aborted) return;
      if (response.status === 401) { expireSession(); return; }
      if (!response.ok || body.ok !== true) throw new Error(responseError(response, body));
      if (!Array.isArray(body.resources) || !body.resources.every(isSavedResource)) {
        throw new Error("服务端资料列表格式不正确。");
      }
      setResources(body.resources);
      setListState({ kind: body.resources.length === 0 ? "empty" : "ready" });
      setSaveState((current) => current.kind === "uncertain" ? { kind: "idle" } : current);
      setActionState((current) => current.kind === "uncertain" ? { kind: "idle", message: "" } : current);
    } catch (error) {
      if (epoch !== accountEpoch.current || controller.signal.aborted) return;
      setListState({ kind: "error", message: connectionError(error) });
    } finally {
      if (listRequest.current === controller) listRequest.current = null;
    }
  }, [expireSession]);

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const body = await readJson(response);
        if (active && response.ok && body.ok === true && isObject(body.user) && typeof body.user.username === "string") {
          setUser(body.user as PublicUser);
        }
      } catch {
        if (active) setAuthError("无法确认登录状态，请检查服务端连接。");
      } finally {
        if (active) setAuthLoading(false);
      }
    }
    void restore();
    return () => { active = false; };
  }, []);

  useEffect(() => { if (user) void loadResources(); }, [user, loadResources]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authBusy) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await readJson(response);
      if (!response.ok || body.ok !== true) throw new Error(responseError(response, body));
      if (!isObject(body.user) || typeof body.user.username !== "string") throw new Error("用户资料格式不正确。");
      clearAccountState();
      setUser(body.user as PublicUser);
    } catch (error) {
      setAuthError(connectionError(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    setAuthBusy(true);
    setAuthError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const body = await readJson(response);
      if (!response.ok || body.ok !== true) throw new Error(responseError(response, body));
      clearAccountState();
      setUser(null);
    } catch (error) {
      setAuthError(connectionError(error));
    } finally {
      setAuthBusy(false);
    }
  }

  function showPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveState.kind === "uncertain") return;
    const error = inputError({ title, desc, tag }, categories);
    if (error) { setSaveState({ kind: "error", message: error }); return; }
    setPreview({ title: title.trim(), desc: desc.trim(), tag });
  }

  async function saveToDatabase() {
    if (saveState.kind === "uncertain") return;
    const error = inputError({ title, desc, tag }, categories);
    if (error) { setSaveState({ kind: "error", message: error }); return; }
    const epoch = accountEpoch.current;
    if (saveBusy.current === epoch) return;
    saveBusy.current = epoch;
    setSaveState({ kind: "saving" });
    try {
      const response = await fetch("/api/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, desc, tag }),
      });
      const body = await readJson(response);
      if (epoch !== accountEpoch.current) return;
      if (response.status === 401) { expireSession(); return; }
      if (!response.ok || body.ok !== true) {
        setSaveState({ kind: "error", message: responseError(response, body) });
        return;
      }
      if (response.status !== 201 || body.status !== "saved" || body.saved !== true ||
        !isSavedResource(body.resource) || typeof body.message !== "string") {
        setSaveState({ kind: "uncertain", message: uncertainWrite });
        return;
      }
      setSaveState({ kind: "saved", resource: body.resource, message: body.message });
      // POST 已成功便不再重发；若这次 GET 失败，学生可单独点击“重新读取”。
      await loadResources();
    } catch (error) {
      if (epoch !== accountEpoch.current) return;
      setSaveState({ kind: "uncertain", message: uncertainWrite });
    } finally {
      if (saveBusy.current === epoch) saveBusy.current = null;
    }
  }

  async function updateResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editDraft || actionState.kind === "uncertain") return;
    const validation = inputError(editDraft, categories);
    if (validation) { setActionState({ kind: "error", message: validation }); return; }
    const epoch = accountEpoch.current;
    if (actionBusy.current === epoch) return;
    actionBusy.current = epoch;
    setActionState({ kind: "busy", message: "正在修改数据库资料…" });
    try {
      const response = await fetch(`/api/resources/${editDraft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editDraft.title, desc: editDraft.desc, tag: editDraft.tag, important: editDraft.important }),
      });
      const body = await readJson(response);
      if (epoch !== accountEpoch.current) return;
      if (response.status === 401) { expireSession(); return; }
      if (!response.ok || body.ok !== true) {
        setActionState({ kind: "error", message: `修改未完成：${responseError(response, body)}` });
        return;
      }
      if (!isSavedResource(body.resource) || body.resource.id !== editDraft.id) {
        setActionState({ kind: "uncertain", message: uncertainWrite });
        return;
      }
      setEditDraft(null);
      setActionState({ kind: "success", message: `数据库记录 #${editDraft.id} 已修改。请以重新读取的列表确认。` });
      await loadResources();
    } catch (error) {
      if (epoch !== accountEpoch.current) return;
      setActionState({ kind: "uncertain", message: uncertainWrite });
    } finally {
      if (actionBusy.current === epoch) actionBusy.current = null;
    }
  }

  async function deleteResource(resource: SavedResource) {
    if (actionState.kind === "uncertain") return;
    const epoch = accountEpoch.current;
    if (actionBusy.current === epoch || !window.confirm(`确定删除数据库资料 #${resource.id}「${resource.title}」吗？此操作会真正删除记录。`)) return;
    actionBusy.current = epoch;
    setActionState({ kind: "busy", message: `正在删除数据库记录 #${resource.id}…` });
    try {
      const response = await fetch(`/api/resources/${resource.id}`, { method: "DELETE" });
      const body = await readJson(response);
      if (epoch !== accountEpoch.current) return;
      if (response.status === 401) { expireSession(); return; }
      if (!response.ok || body.ok !== true) {
        setActionState({ kind: "error", message: `删除未完成：${responseError(response, body)}` });
        return;
      }
      if (body.deletedId !== resource.id) { setActionState({ kind: "uncertain", message: uncertainWrite }); return; }
      if (editDraft?.id === resource.id) setEditDraft(null);
      setActionState({ kind: "success", message: `数据库记录 #${resource.id} 已删除。请以重新读取的列表确认。` });
      // DELETE 已成功便不再重发；GET 失败时只用“重新读取”确认状态。
      await loadResources();
    } catch (error) {
      if (epoch !== accountEpoch.current) return;
      setActionState({ kind: "uncertain", message: uncertainWrite });
    } finally {
      if (actionBusy.current === epoch) actionBusy.current = null;
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-emerald-200 bg-white p-5" aria-label="账号与数据库资料管理">
      <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4" aria-labelledby="auth-heading">
        <h2 id="auth-heading" className="text-lg font-semibold text-stone-900">账号与登录</h2>
        {authLoading ? <p className="mt-2 text-sm text-stone-700">正在确认登录状态…</p> : user ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <p>当前登录：<strong>{user.username}</strong></p>
            <button type="button" disabled={authBusy} onClick={() => void logout()} className="rounded-lg border border-emerald-700 px-3 py-2 text-emerald-900 disabled:opacity-50">退出登录</button>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-stone-700">登录后只读取和管理自己的数据库资料。</p>
            <div className="mt-3 flex gap-2 text-sm">
              <button type="button" onClick={() => { setAuthMode("login"); setAuthError(""); }} aria-pressed={authMode === "login"} className="rounded-lg border border-emerald-700 px-3 py-1.5">登录</button>
              <button type="button" onClick={() => { setAuthMode("register"); setAuthError(""); }} aria-pressed={authMode === "register"} className="rounded-lg border border-emerald-700 px-3 py-1.5">注册</button>
            </div>
            <form onSubmit={submitAuth} className="mt-3 grid max-w-sm gap-3 text-sm">
              <label className="grid gap-1">用户名<input required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className="rounded-lg border border-stone-300 px-3 py-2" /></label>
              <label className="grid gap-1">密码<input required type="password" minLength={8} maxLength={128} autoComplete={authMode === "register" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="rounded-lg border border-stone-300 px-3 py-2" /></label>
              <button type="submit" disabled={authBusy} className="rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-50">{authBusy ? "请稍候…" : authMode === "register" ? "注册并登录" : "登录"}</button>
            </form>
          </>
        )}
        {authError && <p role="alert" className="mt-3 text-sm text-red-700">{authError}</p>}
      </div>
      {!user ? <p className="text-sm text-stone-600">登录后显示资料预览与数据库管理区。</p> : <>
      <h2 id="preview-heading" className="text-lg font-semibold text-stone-900">新增资料</h2>
      <p className="mt-1 text-sm text-stone-600">预览仍只在本页显示；保存成功后，资料会从数据库重新读取。</p>
      <form onSubmit={showPreview} className="mt-4 grid gap-3">
        <label className="grid gap-1 text-sm text-stone-700">
          资料标题
          <input required maxLength={100} disabled={saveState.kind === "saving"} value={title} onChange={(event) => { setTitle(event.target.value); setSaveState((current) => current.kind === "uncertain" ? current : { kind: "idle" }); }} className="rounded-lg border border-stone-300 px-3 py-2 disabled:opacity-50" />
        </label>
        <label className="grid gap-1 text-sm text-stone-700">
          简介
          <textarea required maxLength={500} disabled={saveState.kind === "saving"} value={desc} onChange={(event) => { setDesc(event.target.value); setSaveState((current) => current.kind === "uncertain" ? current : { kind: "idle" }); }} className="min-h-20 rounded-lg border border-stone-300 px-3 py-2 disabled:opacity-50" />
        </label>
        <label className="grid gap-1 text-sm text-stone-700">
          分类标签
          <select required disabled={saveState.kind === "saving"} value={tag} onChange={(event) => { setTag(event.target.value); setSaveState((current) => current.kind === "uncertain" ? current : { kind: "idle" }); }} className="rounded-lg border border-stone-300 px-3 py-2 disabled:opacity-50">
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saveState.kind === "saving" || saveState.kind === "uncertain"} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">预览资料</button>
          <button type="button" onClick={saveToDatabase} disabled={saveState.kind === "saving" || saveState.kind === "uncertain"} className="rounded-lg border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-800 disabled:opacity-50">保存到数据库</button>
        </div>
      </form>
      {preview && (
        <div className="mt-5 rounded-lg border border-dashed border-emerald-300 bg-emerald-50 p-4" role="status">
          <p className="text-xs font-medium text-emerald-800">尚未保存的本页预览</p>
          <h3 className="mt-2 font-semibold text-stone-900">{preview.title}</h3>
          <p className="mt-1 text-sm text-stone-700">{preview.desc}</p>
          <p className="mt-2 text-xs text-emerald-800">{preview.tag}</p>
        </div>
      )}
      <div className="mt-5 rounded-lg border border-stone-200 p-4 text-sm" role="status" aria-live="polite">
        {saveState.kind === "idle" && <p>当前还没有保存新资料。</p>}
        {saveState.kind === "saving" && <p>正在等待数据库保存结果…</p>}
        {saveState.kind === "error" && <p className="text-red-700">保存失败：{saveState.message}</p>}
        {saveState.kind === "uncertain" && <p className="text-amber-800">保存结果未确认：{saveState.message}</p>}
        {saveState.kind === "saved" && (
          <div>
            <p className="font-medium text-emerald-800">{saveState.message} saved: true</p>
            <p className="mt-1 text-stone-600">数据库记录 #{saveState.resource.id}：{saveState.resource.title}</p>
          </div>
        )}
      </div>
      <div className="mt-8 border-t border-stone-200 pt-5" aria-labelledby="database-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="database-heading" className="text-lg font-semibold text-stone-900">我的数据库资料</h2>
            <p className="text-sm text-stone-600">这里来自 GET /api/resources，只显示当前账号的记录；无归属的旧资料仍在数据库，但不进入个人列表。本地示例资料仍只读。</p>
          </div>
          <button type="button" onClick={() => void loadResources()} disabled={listState.kind === "loading"} className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 disabled:opacity-50">重新读取</button>
        </div>
        {listState.kind === "loading" && <p className="mt-4 text-sm text-stone-600" role="status">{resources.length ? "正在重新读取资料；下方是上一次结果，尚未验证为最新。" : "正在从数据库读取资料…"}</p>}
        {listState.kind === "error" && <p className="mt-4 text-sm text-red-700" role="alert">读取失败：{listState.message} 请点击“重新读取”再试。{resources.length ? "下方仅保留上一次结果，当前状态尚未确认。" : "目前没有拿到资料列表，不能判断数据库是否为空。"}</p>}
        {actionState.kind !== "idle" && <p className={`mt-4 text-sm ${actionState.kind === "error" ? "text-red-700" : actionState.kind === "uncertain" ? "text-amber-800" : "text-emerald-800"}`} role="status">{actionState.message}</p>}
        {listState.kind === "ready" && <p className="mt-3 text-xs text-stone-600">数据库资料：共 {resources.length} 条</p>}
        {listState.kind === "empty" && <p className="mt-4 text-sm text-stone-600">你还没有保存资料，可以从上面的表单新增第一条。</p>}
        {resources.map((resource) => (
          <article key={resource.id} className="mt-4 rounded-lg border border-stone-200 p-4">
            <h3 className="font-semibold text-stone-900">#{resource.id} {resource.title}</h3>
            <p className="mt-1 break-words text-sm text-stone-700">{resource.desc}</p>
            <p className="mt-2 text-xs text-stone-600">{resource.tag} · {resource.important ? "重要" : "普通"} · 创建于 {new Date(resource.createdAt).toLocaleString("zh-CN")}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={actionState.kind === "busy" || actionState.kind === "uncertain"} onClick={() => { setEditDraft({ id: resource.id, title: resource.title, desc: resource.desc, tag: resource.tag, important: resource.important }); setActionState({ kind: "idle", message: "" }); }} className="rounded-lg border border-emerald-600 px-3 py-1.5 text-sm text-emerald-800 disabled:opacity-50">编辑</button>
              <button type="button" disabled={actionState.kind === "busy" || actionState.kind === "uncertain"} onClick={() => void deleteResource(resource)} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50">删除</button>
            </div>
            {editDraft?.id === resource.id && (
              <form onSubmit={updateResource} className="mt-4 grid gap-3 rounded-lg bg-emerald-50 p-4">
                <p className="font-medium text-stone-800">编辑数据库记录 #{resource.id}</p>
                <label className="grid gap-1 text-sm">标题<input required maxLength={100} disabled={actionState.kind === "busy" || actionState.kind === "uncertain"} value={editDraft.title} onChange={(event) => { setEditDraft({ ...editDraft, title: event.target.value }); setActionState({ kind: "idle", message: "" }); }} className="rounded-lg border border-stone-300 px-3 py-2 disabled:opacity-50" /></label>
                <label className="grid gap-1 text-sm">简介<textarea required maxLength={500} disabled={actionState.kind === "busy" || actionState.kind === "uncertain"} value={editDraft.desc} onChange={(event) => { setEditDraft({ ...editDraft, desc: event.target.value }); setActionState({ kind: "idle", message: "" }); }} className="min-h-20 rounded-lg border border-stone-300 px-3 py-2 disabled:opacity-50" /></label>
                <label className="grid gap-1 text-sm">分类<select disabled={actionState.kind === "busy" || actionState.kind === "uncertain"} value={editDraft.tag} onChange={(event) => { setEditDraft({ ...editDraft, tag: event.target.value }); setActionState({ kind: "idle", message: "" }); }} className="rounded-lg border border-stone-300 px-3 py-2 disabled:opacity-50">{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={actionState.kind === "busy" || actionState.kind === "uncertain"} checked={editDraft.important} onChange={(event) => { setEditDraft({ ...editDraft, important: event.target.checked }); setActionState({ kind: "idle", message: "" }); }} />重要资料</label>
                <div className="flex gap-2">
                  <button type="submit" disabled={actionState.kind === "busy" || actionState.kind === "uncertain"} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50">保存修改</button>
                  <button type="button" disabled={actionState.kind === "busy" || actionState.kind === "uncertain"} onClick={() => { setEditDraft(null); setActionState({ kind: "idle", message: "" }); }} className="rounded-lg border border-stone-300 px-3 py-2 text-sm disabled:opacity-50">取消</button>
                </div>
              </form>
            )}
          </article>
        ))}
      </div>
      </>}
    </section>
  );
}
