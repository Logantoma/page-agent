import type { AgentStatus } from '@page-agent/core'
import {
	Check,
	Copy,
	CornerUpLeft,
	ExternalLink,
	Eye,
	EyeOff,
	Pencil,
	Plus,
	Trash2,
	X,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'

import { createUserProfile, deleteUserProfile, updateUserProfile } from '@/agent/LlmProfileCrud'
import {
	BUILTIN_DEMO_PROFILE_ID,
	LLM_PROFILE_STORE_KEY,
	type LlmProfileStoreV1,
	type LlmProviderKind,
	type PersistedLlmProfile,
	type SerializableLlmProfileConfig,
	createBuiltinDemoStore,
	createMigratedProfile,
	createProfileStore,
	isBareDemoConfig,
	parseLlmProfileStore,
	resolveActiveProfile,
	serializeLlmProfileConfig,
} from '@/agent/LlmProfileStore'
import {
	readPersistedProfileStore,
	writeProfileStoreVerified,
} from '@/agent/LlmProfilePersistence'
import { DEMO_BASE_URL, DEMO_MODEL } from '@/agent/constants'
import type { ExtConfig, LanguagePreference } from '@/agent/useAgent'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

interface ProfileConfigPanelProps {
	config: ExtConfig | null
	status: AgentStatus
	onSave: (config: ExtConfig) => Promise<void>
	onSwitchProfile: (profileId: string) => Promise<void>
	onClose: () => void
}

interface ProfileDraft {
	name: string
	provider: LlmProviderKind
	baseURL: string
	model: string
	apiKey: string
	temperature: string
	maxRetries: string
	disableNamedToolChoice: boolean
}

type EditorState = { mode: 'create' } | { mode: 'edit'; profileId: string } | null

const PROVIDER_PRESETS: Record<Exclude<LlmProviderKind, 'custom'>, string> = {
	deepseek: 'https://api.deepseek.com',
	siliconflow: 'https://api.siliconflow.cn/v1',
}

export function ProfileConfigPanel({
	config,
	status,
	onSave,
	onSwitchProfile,
	onClose,
}: ProfileConfigPanelProps) {
	const [profileStore, setProfileStore] = useState<LlmProfileStoreV1>(createBuiltinDemoStore())
	const [editor, setEditor] = useState<EditorState>(null)
	const [draft, setDraft] = useState<ProfileDraft>(() => createEmptyDraft())
	const [language, setLanguage] = useState<LanguagePreference>(config?.language)
	const [maxSteps, setMaxSteps] = useState(config?.maxSteps)
	const [systemInstruction, setSystemInstruction] = useState(config?.systemInstruction ?? '')
	const [experimentalLlmsTxt, setExperimentalLlmsTxt] = useState(
		config?.experimentalLlmsTxt ?? false
	)
	const [experimentalIncludeAllTabs, setExperimentalIncludeAllTabs] = useState(
		config?.experimentalIncludeAllTabs ?? false
	)
	const [advancedOpen, setAdvancedOpen] = useState(false)
	const [savingProfile, setSavingProfile] = useState(false)
	const [savingGlobal, setSavingGlobal] = useState(false)
	const [pageError, setPageError] = useState('')
	const [editorError, setEditorError] = useState('')
	const [userAuthToken, setUserAuthToken] = useState('')
	const [showToken, setShowToken] = useState(false)
	const [showApiKey, setShowApiKey] = useState(false)
	const [copied, setCopied] = useState(false)

	const isRunning = status === 'running'
	const editingProfile =
		editor?.mode === 'edit'
			? profileStore.profiles.find(({ id }) => id === editor.profileId) ?? null
			: null
	const editingIsActive = Boolean(
		editingProfile && profileStore.activeProfileId === editingProfile.id
	)
	const editorLocked = editingIsActive && isRunning

	useEffect(() => {
		setLanguage(config?.language)
		setMaxSteps(config?.maxSteps)
		setSystemInstruction(config?.systemInstruction ?? '')
		setExperimentalLlmsTxt(config?.experimentalLlmsTxt ?? false)
		setExperimentalIncludeAllTabs(config?.experimentalIncludeAllTabs ?? false)
	}, [config])

	useEffect(() => {
		let disposed = false
		const load = async () => {
			const store = await readProfileStore(config)
			if (!disposed) setProfileStore(store)
		}
		void load()

		const onChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
			if (disposed || areaName !== 'local' || !(LLM_PROFILE_STORE_KEY in changes)) return
			const parsed = parseLlmProfileStore(changes[LLM_PROFILE_STORE_KEY].newValue)
			if (parsed) setProfileStore(resolveActiveProfile(parsed).store)
		}
		chrome.storage.onChanged.addListener(onChanged)
		return () => {
			disposed = true
			chrome.storage.onChanged.removeListener(onChanged)
		}
	}, [config])

	useEffect(() => {
		let interval: ReturnType<typeof setInterval> | null = null
		const fetchToken = async () => {
			const result = await chrome.storage.local.get('PageAgentExtUserAuthToken')
			const token = result.PageAgentExtUserAuthToken
			if (typeof token === 'string' && token) {
				setUserAuthToken(token)
				if (interval) {
					clearInterval(interval)
					interval = null
				}
			}
		}
		void fetchToken()
		interval = setInterval(() => void fetchToken(), 1000)
		return () => {
			if (interval) clearInterval(interval)
		}
	}, [])

	const activeLabel = useMemo(() => {
		if (profileStore.activeProfileId === BUILTIN_DEMO_PROFILE_ID) return 'Page Agent 演示配置'
		return (
			profileStore.profiles.find(({ id }) => id === profileStore.activeProfileId)?.name ??
			'未知配置'
		)
	}, [profileStore])

	const openCreateEditor = () => {
		setPageError('')
		setEditorError('')
		setShowApiKey(false)
		setDraft(createEmptyDraft())
		setEditor({ mode: 'create' })
	}

	const openEditEditor = (profile: PersistedLlmProfile) => {
		setPageError('')
		setEditorError('')
		setShowApiKey(false)
		setDraft(createDraftFromProfile(profile))
		setEditor({ mode: 'edit', profileId: profile.id })
	}

	const closeEditor = () => {
		if (savingProfile) return
		setEditor(null)
		setEditorError('')
		setShowApiKey(false)
	}

	const handleProviderChange = (provider: LlmProviderKind) => {
		setDraft((current) => ({
			...current,
			provider,
			baseURL: provider === 'custom' ? current.baseURL : PROVIDER_PRESETS[provider],
		}))
	}

	const handleActivate = async (profileId: string) => {
		if (isRunning || profileStore.activeProfileId === profileId) return
		setPageError('')
		try {
			await onSwitchProfile(profileId)
			setProfileStore(await readProfileStore(config))
		} catch (reason) {
			setPageError(toErrorMessage(reason))
		}
	}

	const handleSaveProfile = async () => {
		if (!editor || editorLocked) return
		setSavingProfile(true)
		setEditorError('')
		try {
			const input = {
				name: draft.name,
				provider: draft.provider,
				config: draftToConfig(draft),
			}

			if (editor.mode === 'create') {
				const latest = await readProfileStore(config)
				const created = createUserProfile(latest, input)
				const persisted = await writeProfileStoreVerified(created.store)
				if (!persisted.profiles.some(({ id }) => id === created.profile.id)) {
					throw new Error('API 配置保存失败：创建后的配置未出现在本地存储中')
				}
				setProfileStore(persisted)
				setEditor(null)
				return
			}

			const profileId = editor.profileId
			if (editingIsActive) {
				if (!config) throw new Error('Agent 配置尚未加载完成')
				await onSave({
					...input.config,
					language: config.language,
					maxSteps: config.maxSteps,
					systemInstruction: config.systemInstruction,
					experimentalLlmsTxt: config.experimentalLlmsTxt,
					experimentalIncludeAllTabs: config.experimentalIncludeAllTabs,
				})
			}

			const latest = await readProfileStore(config)
			const updated = updateUserProfile(latest, profileId, input)
			const persisted = await writeProfileStoreVerified(updated)
			setProfileStore(persisted)
			setEditor(null)
		} catch (reason) {
			setEditorError(toErrorMessage(reason))
		} finally {
			setSavingProfile(false)
		}
	}

	const handleDeleteProfile = async () => {
		if (!editingProfile || editorLocked) return
		setSavingProfile(true)
		setEditorError('')
		try {
			if (editingIsActive) await onSwitchProfile(BUILTIN_DEMO_PROFILE_ID)
			const latest = await readProfileStore(config)
			const deleted = deleteUserProfile(latest, editingProfile.id)
			const persisted = await writeProfileStoreVerified(deleted)
			setProfileStore(persisted)
			setEditor(null)
		} catch (reason) {
			setEditorError(toErrorMessage(reason))
		} finally {
			setSavingProfile(false)
		}
	}

	const handleSaveGlobal = async () => {
		if (!config || isRunning) return
		setSavingGlobal(true)
		setPageError('')
		try {
			await onSave({
				...config,
				language,
				maxSteps: maxSteps || undefined,
				systemInstruction: systemInstruction.trim() || undefined,
				experimentalLlmsTxt,
				experimentalIncludeAllTabs,
			})
		} catch (reason) {
			setPageError(toErrorMessage(reason))
		} finally {
			setSavingGlobal(false)
		}
	}

	const handleCopyToken = async () => {
		if (!userAuthToken) return
		await navigator.clipboard.writeText(userAuthToken)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	return (
		<div className="relative flex h-screen flex-col bg-background">
			<header className="relative flex items-center justify-between border-b px-4 py-3">
				<div>
					<h2 className="text-base font-semibold">设置</h2>
					<p className="text-[10px] text-muted-foreground">当前 API：{activeLabel}</p>
				</div>
				<Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="返回" className="cursor-pointer">
					<CornerUpLeft className="size-3.5" />
				</Button>
			</header>

			<div className="flex-1 space-y-4 overflow-y-auto p-4">
				{isRunning && (
					<div className="rounded-md border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
						Agent 运行时，当前 API 与全局设置会锁定；未启用的 API 仍可新增或编辑。
					</div>
				)}

				{pageError && (
					<div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-[11px] text-destructive">
						{pageError}
					</div>
				)}

				<section className="space-y-2">
					<div className="flex items-center justify-between gap-3">
						<div>
							<h3 className="text-sm font-semibold">API 配置</h3>
							<p className="text-[10px] text-muted-foreground">点击配置进入二级卡片查看或编辑。</p>
						</div>
						<Button variant="outline" size="sm" onClick={openCreateEditor} className="h-7 gap-1 text-[11px] cursor-pointer">
							<Plus className="size-3" /> 添加 API
						</Button>
					</div>

					<div className="space-y-1.5">
						<ProfileListRow
							name="Page Agent Demo"
							detail={DEMO_MODEL}
							active={profileStore.activeProfileId === BUILTIN_DEMO_PROFILE_ID}
							onOpen={undefined}
							onActivate={
								profileStore.activeProfileId === BUILTIN_DEMO_PROFILE_ID
									? undefined
									: () => void handleActivate(BUILTIN_DEMO_PROFILE_ID)
							}
							activateDisabled={isRunning}
						/>
						{profileStore.profiles.map((profile) => (
							<ProfileListRow
								key={profile.id}
								name={profile.name}
								detail={`${providerLabel(profile.provider)} · ${profile.config.model}`}
								active={profileStore.activeProfileId === profile.id}
								onOpen={() => openEditEditor(profile)}
								onActivate={
									profileStore.activeProfileId === profile.id
										? undefined
										: () => void handleActivate(profile.id)
								}
								activateDisabled={isRunning}
							/>
						))}
					</div>
				</section>

				<section className="rounded-md border p-3 space-y-3">
					<div>
						<h3 className="text-sm font-semibold">全局 Agent 设置</h3>
						<p className="text-[10px] text-muted-foreground">所有 API 配置共用。</p>
					</div>

					<Field label="回复语言">
						<select
							value={language ?? ''}
							onChange={(e) => setLanguage((e.target.value || undefined) as LanguagePreference)}
							disabled={isRunning}
							className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
						>
							<option value="">跟随系统</option>
							<option value="en-US">英文</option>
							<option value="zh-CN">中文</option>
						</select>
					</Field>

					<button type="button" onClick={() => setAdvancedOpen((value) => !value)} className="text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer">
						{advancedOpen ? '收起高级设置' : '显示高级设置'}
					</button>

					{advancedOpen && (
						<div className="space-y-3">
							<Field label="最大步骤数">
								<Input type="number" min={1} max={200} value={maxSteps ?? ''} onChange={(e) => setMaxSteps(e.target.value ? Number(e.target.value) : undefined)} disabled={isRunning} className="h-8 text-xs" />
							</Field>
							<Field label="系统指令">
								<textarea value={systemInstruction} onChange={(e) => setSystemInstruction(e.target.value)} disabled={isRunning} rows={3} placeholder="给 Agent 的附加指令..." className="min-h-[60px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs" />
							</Field>
							<label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
								<span>实验性 llms.txt 支持</span>
								<Switch checked={experimentalLlmsTxt} onCheckedChange={setExperimentalLlmsTxt} disabled={isRunning} />
							</label>
							<label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
								<span>实验性包含所有标签页</span>
								<Switch checked={experimentalIncludeAllTabs} onCheckedChange={setExperimentalIncludeAllTabs} disabled={isRunning} />
							</label>
						</div>
					)}

					<Button onClick={handleSaveGlobal} disabled={savingGlobal || isRunning || !config} className="h-8 w-full text-xs cursor-pointer">
						{savingGlobal ? '保存中...' : '保存全局设置'}
					</Button>
				</section>

				<section className="space-y-2">
					<div className="rounded-md border bg-muted/50 p-3 space-y-2">
						<div>
							<div className="text-xs font-medium text-muted-foreground">用户授权令牌</div>
							<p className="text-[10px] text-muted-foreground">允许网站调用此扩展。</p>
						</div>
						<div className="flex gap-2">
							<Input readOnly value={maskedToken(userAuthToken, showToken)} className="h-8 bg-background font-mono text-xs" />
							<Button variant="outline" size="icon" className="h-8 w-8 shrink-0 cursor-pointer" disabled={!userAuthToken} onClick={() => setShowToken((value) => !value)} aria-label={showToken ? '隐藏令牌' : '显示令牌'}>
								{showToken ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
							</Button>
							<Button variant="outline" size="icon" className="h-8 w-8 shrink-0 cursor-pointer" disabled={!userAuthToken} onClick={handleCopyToken} aria-label="复制令牌">
								{copied ? <Check className="size-3" /> : <Copy className="size-3" />}
							</Button>
						</div>
					</div>

					<a href="/hub.html" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-md border bg-muted/50 p-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
						管理 Page Agent Hub
						<ExternalLink className="size-3" />
					</a>
				</section>
			</div>

			{editor && (
				<ProfileEditorCard
					draft={draft}
					setDraft={setDraft}
					mode={editor.mode}
					active={editingIsActive}
					locked={editorLocked}
					saving={savingProfile}
					error={editorError}
					showApiKey={showApiKey}
					onToggleApiKey={() => setShowApiKey((value) => !value)}
					onProviderChange={handleProviderChange}
					onSave={handleSaveProfile}
					onDelete={editor.mode === 'edit' ? handleDeleteProfile : undefined}
					onActivate={
						editor.mode === 'edit' && editingProfile && !editingIsActive
							? () => void handleActivate(editingProfile.id)
							: undefined
					}
					activateDisabled={isRunning}
					onClose={closeEditor}
				/>
			)}
		</div>
	)
}

function ProfileListRow({
	name,
	detail,
	active,
	onOpen,
	onActivate,
	activateDisabled,
}: {
	name: string
	detail: string
	active: boolean
	onOpen?: () => void
	onActivate?: () => void
	activateDisabled: boolean
}) {
	return (
		<div className="flex items-center gap-2 rounded-md border bg-background p-2">
		<button type="button" onClick={onOpen} disabled={!onOpen} className="min-w-0 flex-1 text-left disabled:cursor-default">
			<div className="flex items-center gap-2">
				<div className="min-w-0 flex-1">
					<div className="truncate text-xs font-medium">{name}</div>
					<div className="truncate text-[10px] text-muted-foreground">{detail}</div>
				</div>
				{onOpen && <Pencil className="size-3 shrink-0 text-muted-foreground" />}
			</div>
		</button>
		{active ? (
			<span className="shrink-0 rounded-full bg-foreground px-2 py-0.5 text-[9px] text-background">当前</span>
		) : onActivate ? (
			<Button variant="outline" size="sm" onClick={onActivate} disabled={activateDisabled} className="h-7 shrink-0 px-2 text-[10px] cursor-pointer">
				使用
			</Button>
		) : null}
		</div>
	)
}

function ProfileEditorCard({
	draft,
	setDraft,
	mode,
	active,
	locked,
	saving,
	error,
	showApiKey,
	onToggleApiKey,
	onProviderChange,
	onSave,
	onDelete,
	onActivate,
	activateDisabled,
	onClose,
}: {
	draft: ProfileDraft
	setDraft: React.Dispatch<React.SetStateAction<ProfileDraft>>
	mode: 'create' | 'edit'
	active: boolean
	locked: boolean
	saving: boolean
	error: string
	showApiKey: boolean
	onToggleApiKey: () => void
	onProviderChange: (provider: LlmProviderKind) => void
	onSave: () => void
	onDelete?: () => void
	onActivate?: () => void
	activateDisabled: boolean
	onClose: () => void
}) {
	return (
		<div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 p-3 backdrop-blur-[1px]">
			<div role="dialog" aria-modal="true" aria-label={mode === 'create' ? '新增 API 配置' : '编辑 API 配置'} className="flex max-h-[calc(100vh-1.5rem)] w-full flex-col overflow-hidden rounded-xl border bg-background shadow-xl">
				<div className="flex items-start justify-between border-b px-4 py-3">
					<div>
						<div className="text-sm font-semibold">{mode === 'create' ? '新增 API' : 'API 配置详情'}</div>
						<div className="text-[10px] text-muted-foreground">
							{active ? '当前正在使用' : mode === 'create' ? '保存后不会自动启用' : '未启用配置'}
						</div>
					</div>
					<Button variant="ghost" size="icon-sm" onClick={onClose} disabled={saving} aria-label="关闭" className="cursor-pointer">
						<X className="size-3.5" />
					</Button>
				</div>

				<div className="flex-1 space-y-4 overflow-y-auto p-4">
					{locked && (
						<div className="rounded-md border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
							Agent 正在运行，当前 API 暂时不可编辑。
						</div>
					)}
					{error && (
						<div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-[11px] text-destructive">
							{error}
						</div>
					)}

					<div className="space-y-2">
						<div className="text-xs font-medium">服务商</div>
						<div className="grid grid-cols-3 gap-2">
							<ProviderChoice label="DeepSeek" detail="官方" selected={draft.provider === 'deepseek'} disabled={locked} onClick={() => onProviderChange('deepseek')} />
							<ProviderChoice label="SiliconFlow" detail="硅基流动" selected={draft.provider === 'siliconflow'} disabled={locked} onClick={() => onProviderChange('siliconflow')} />
							<ProviderChoice label="自定义" detail="OpenAI 兼容" selected={draft.provider === 'custom'} disabled={locked} onClick={() => onProviderChange('custom')} />
						</div>
					</div>

					<Field label="配置名称">
						<Input value={draft.name} onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))} disabled={locked} className="h-8 text-xs" />
					</Field>

					<Field label="接口地址">
						<Input value={draft.baseURL} onChange={(e) => setDraft((current) => ({ ...current, baseURL: e.target.value }))} disabled={locked} placeholder="https://api.example.com/v1" className="h-8 text-xs" />
					</Field>

					<Field label="模型">
						<Input value={draft.model} onChange={(e) => setDraft((current) => ({ ...current, model: e.target.value }))} disabled={locked} placeholder={modelPlaceholder(draft.provider)} className="h-8 text-xs" />
					</Field>

					<Field label="API 密钥">
						<div className="flex gap-2">
							<Input type={showApiKey ? 'text' : 'password'} value={draft.apiKey} onChange={(e) => setDraft((current) => ({ ...current, apiKey: e.target.value }))} disabled={locked} className="h-8 text-xs" />
							<Button variant="outline" size="icon" className="h-8 w-8 shrink-0 cursor-pointer" onClick={onToggleApiKey} disabled={locked} aria-label={showApiKey ? '隐藏 API 密钥' : '显示 API 密钥'}>
								{showApiKey ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
							</Button>
						</div>
					</Field>

					<div className="grid grid-cols-2 gap-2">
						<Field label="温度">
							<Input type="number" step="0.1" value={draft.temperature} onChange={(e) => setDraft((current) => ({ ...current, temperature: e.target.value }))} disabled={locked} className="h-8 text-xs" />
						</Field>
						<Field label="最大重试次数">
							<Input type="number" min={0} value={draft.maxRetries} onChange={(e) => setDraft((current) => ({ ...current, maxRetries: e.target.value }))} disabled={locked} className="h-8 text-xs" />
						</Field>
					</div>

					<label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
						<span>禁用指定工具 tool_choice</span>
						<Switch checked={draft.disableNamedToolChoice} onCheckedChange={(checked) => setDraft((current) => ({ ...current, disableNamedToolChoice: checked }))} disabled={locked} />
					</label>
				</div>

				<div className="flex items-center gap-2 border-t p-3">
					{onDelete && (
						<Button variant="destructive" size="sm" onClick={onDelete} disabled={saving || locked} className="h-8 gap-1 text-xs cursor-pointer">
							<Trash2 className="size-3" /> 删除
						</Button>
					)}
					{onActivate && (
						<Button variant="outline" size="sm" onClick={onActivate} disabled={saving || activateDisabled} className="h-8 text-xs cursor-pointer">
							使用此配置
						</Button>
					)}
					<Button variant="outline" size="sm" onClick={onClose} disabled={saving} className="ml-auto h-8 text-xs cursor-pointer">
						取消
					</Button>
					<Button size="sm" onClick={onSave} disabled={saving || locked || !draft.name.trim() || !draft.baseURL.trim() || !draft.model.trim()} className="h-8 text-xs cursor-pointer">
						{saving ? '保存中...' : mode === 'create' ? '保存 API' : '保存修改'}
					</Button>
				</div>
			</div>
		</div>
	)
}

function ProviderChoice({
	label,
	detail,
	selected,
	disabled,
	onClick,
}: {
	label: string
	detail: string
	selected: boolean
	disabled: boolean
	onClick: () => void
}) {
	return (
		<button type="button" onClick={onClick} disabled={disabled} className={`rounded-md border p-2 text-left transition-colors disabled:opacity-50 ${selected ? 'border-foreground/40 bg-muted/70' : 'bg-background hover:bg-muted/40'}`}>
			<div className="truncate text-[11px] font-medium">{label}</div>
			<div className="truncate text-[9px] text-muted-foreground">{detail}</div>
		</button>
	)
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<label className="block space-y-1.5">
			<span className="text-xs text-muted-foreground">{label}</span>
			{children}
		</label>
	)
}

async function readProfileStore(fallbackConfig: ExtConfig | null): Promise<LlmProfileStoreV1> {
	const persisted = await readPersistedProfileStore()
	if (persisted) return persisted
	if (!fallbackConfig) return createBuiltinDemoStore()

	const serializable = serializeLlmProfileConfig(fallbackConfig)
	if (isBareDemoConfig(serializable)) return createBuiltinDemoStore()
	return createProfileStore({
		...createMigratedProfile(serializable),
		id: 'default',
		name: '当前 API',
	})
}

function createEmptyDraft(): ProfileDraft {
	return {
		name: '新 API',
		provider: 'deepseek',
		baseURL: PROVIDER_PRESETS.deepseek,
		model: '',
		apiKey: '',
		temperature: '0.7',
		maxRetries: '3',
		disableNamedToolChoice: false,
	}
}

function createDraftFromProfile(profile: PersistedLlmProfile): ProfileDraft {
	return {
		name: profile.name,
		provider: profile.provider,
		baseURL: profile.config.baseURL,
		model: profile.config.model,
		apiKey: profile.config.apiKey ?? '',
		temperature: profile.config.temperature?.toString() ?? '',
		maxRetries: profile.config.maxRetries?.toString() ?? '',
		disableNamedToolChoice: profile.config.disableNamedToolChoice ?? false,
	}
}

function draftToConfig(draft: ProfileDraft): SerializableLlmProfileConfig {
	const baseURL = draft.baseURL.trim()
	const model = draft.model.trim()
	if (!baseURL) throw new Error('请填写接口地址')
	if (!model) throw new Error('请填写模型 ID')

	const temperature = optionalNumber(draft.temperature, '温度')
	const maxRetries = optionalNumber(draft.maxRetries, '最大重试次数')
	return {
		baseURL,
		model,
		...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
		...(temperature !== undefined ? { temperature } : {}),
		...(maxRetries !== undefined ? { maxRetries } : {}),
		disableNamedToolChoice: draft.disableNamedToolChoice,
	}
}

function optionalNumber(value: string, label: string): number | undefined {
	if (!value.trim()) return undefined
	const parsed = Number(value)
	if (!Number.isFinite(parsed)) throw new Error(`${label}必须是有效数字`)
	return parsed
}

function providerLabel(provider: LlmProviderKind): string {
	if (provider === 'deepseek') return 'DeepSeek 官方'
	if (provider === 'siliconflow') return 'SiliconFlow'
	return '自定义'
}

function modelPlaceholder(provider: LlmProviderKind): string {
	if (provider === 'deepseek') return '例如 deepseek-chat'
	if (provider === 'siliconflow') return '输入 SiliconFlow 模型 ID'
	return '输入模型 ID'
}

function maskedToken(token: string, show: boolean): string {
	if (!token) return '正在加载...'
	if (show || token.length <= 8) return token
	return `${token.slice(0, 4)}${'•'.repeat(token.length - 8)}${token.slice(-4)}`
}

function toErrorMessage(reason: unknown): string {
	return reason instanceof Error ? reason.message : String(reason)
}
