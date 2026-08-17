import type { AgentStatus } from '@page-agent/core'
import { Check, Copy, CornerUpLeft, ExternalLink, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { createUserProfile, deleteUserProfile, updateUserProfile } from '@/agent/LlmProfileCrud'
import {
	BUILTIN_DEMO_PROFILE_ID,
	LLM_PROFILE_STORE_KEY,
	type LlmProfileStoreV1,
	type LlmProviderKind,
	type SerializableLlmProfileConfig,
	createBuiltinDemoStore,
	createMigratedProfile,
	createProfileStore,
	isBareDemoConfig,
	parseLlmProfileStore,
	resolveActiveProfile,
	serializeLlmProfileConfig,
} from '@/agent/LlmProfileStore'
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

const NEW_PROFILE_ID = '__new__'
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
	const [selectedProfileId, setSelectedProfileId] = useState(BUILTIN_DEMO_PROFILE_ID)
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
	const [error, setError] = useState('')
	const [userAuthToken, setUserAuthToken] = useState('')
	const [showToken, setShowToken] = useState(false)
	const [showApiKey, setShowApiKey] = useState(false)
	const [copied, setCopied] = useState(false)

	const isRunning = status === 'running'
	const selectedProfile = profileStore.profiles.find(({ id }) => id === selectedProfileId)
	const selectedIsBuiltin = selectedProfileId === BUILTIN_DEMO_PROFILE_ID
	const selectedIsNew = selectedProfileId === NEW_PROFILE_ID
	const selectedIsActive = selectedProfileId === profileStore.activeProfileId
	const profileEditLocked = selectedIsBuiltin || (selectedIsActive && isRunning)

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
			if (disposed) return
			setProfileStore(store)
			setSelectedProfileId(store.activeProfileId)
		}
		void load()

		const onChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
			if (disposed || areaName !== 'local' || !(LLM_PROFILE_STORE_KEY in changes)) return
			const next = parseLlmProfileStore(changes[LLM_PROFILE_STORE_KEY].newValue)
			if (!next) return
			const resolved = resolveActiveProfile(next).store
			setProfileStore(resolved)
			setSelectedProfileId((current) => {
				if (current === NEW_PROFILE_ID || current === BUILTIN_DEMO_PROFILE_ID) return current
				return resolved.profiles.some(({ id }) => id === current)
					? current
					: resolved.activeProfileId
			})
		}
		chrome.storage.onChanged.addListener(onChanged)
		return () => {
			disposed = true
			chrome.storage.onChanged.removeListener(onChanged)
		}
	}, [config])

	useEffect(() => {
		if (selectedIsNew) return
		if (selectedIsBuiltin) {
			setDraft(createBuiltinDraft())
			return
		}
		if (selectedProfile) setDraft(createDraftFromProfile(selectedProfile))
	}, [selectedIsBuiltin, selectedIsNew, selectedProfile])

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

	const selectProfile = (profileId: string) => {
		setError('')
		setSelectedProfileId(profileId)
	}

	const handleAddProfile = () => {
		setError('')
		setSelectedProfileId(NEW_PROFILE_ID)
		setDraft(createEmptyDraft())
	}

	const handleProviderChange = (provider: LlmProviderKind) => {
		setDraft((current) => ({
			...current,
			provider,
			baseURL: provider === 'custom' ? current.baseURL : PROVIDER_PRESETS[provider],
		}))
	}

	const handleActivate = async () => {
		if (selectedIsNew || selectedIsActive || isRunning) return
		setError('')
		try {
			await onSwitchProfile(selectedProfileId)
			setProfileStore(await readProfileStore(config))
		} catch (reason) {
			setError(toErrorMessage(reason))
		}
	}

	const handleSaveProfile = async () => {
		if (selectedIsBuiltin || profileEditLocked) return
		setSavingProfile(true)
		setError('')
		try {
			const input = {
				name: draft.name,
				provider: draft.provider,
				config: draftToConfig(draft),
			}

			if (selectedIsNew) {
				const latest = await readProfileStore(config)
				const created = createUserProfile(latest, input)
				await chrome.storage.local.set({ [LLM_PROFILE_STORE_KEY]: created.store })
				setProfileStore(created.store)
				setSelectedProfileId(created.profile.id)
				return
			}

			if (selectedIsActive) {
				if (!config) throw new Error('Agent configuration is not ready')
				await onSave({
					...input.config,
					language: config.language,
					maxSteps: config.maxSteps,
					systemInstruction: config.systemInstruction,
					experimentalLlmsTxt: config.experimentalLlmsTxt,
					experimentalIncludeAllTabs: config.experimentalIncludeAllTabs,
				})
				const latest = await readProfileStore(config)
				const patched = updateUserProfile(latest, selectedProfileId, input)
				await chrome.storage.local.set({ [LLM_PROFILE_STORE_KEY]: patched })
				setProfileStore(patched)
				return
			}

			const latest = await readProfileStore(config)
			const updated = updateUserProfile(latest, selectedProfileId, input)
			await chrome.storage.local.set({ [LLM_PROFILE_STORE_KEY]: updated })
			setProfileStore(updated)
		} catch (reason) {
			setError(toErrorMessage(reason))
		} finally {
			setSavingProfile(false)
		}
	}

	const handleDeleteProfile = async () => {
		if (selectedIsBuiltin || selectedIsNew || !selectedProfile || (selectedIsActive && isRunning))
			return
		setSavingProfile(true)
		setError('')
		try {
			if (selectedIsActive) await onSwitchProfile(BUILTIN_DEMO_PROFILE_ID)
			const latest = await readProfileStore(config)
			const deleted = deleteUserProfile(latest, selectedProfile.id)
			await chrome.storage.local.set({ [LLM_PROFILE_STORE_KEY]: deleted })
			setProfileStore(deleted)
			setSelectedProfileId(deleted.activeProfileId)
		} catch (reason) {
			setError(toErrorMessage(reason))
		} finally {
			setSavingProfile(false)
		}
	}

	const handleSaveGlobal = async () => {
		if (!config || isRunning) return
		setSavingGlobal(true)
		setError('')
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
			setError(toErrorMessage(reason))
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
		<div className="flex h-screen flex-col bg-background">
			<header className="relative flex items-center justify-between border-b px-4 py-3">
				<div>
					<h2 className="text-base font-semibold">设置</h2>
					<p className="text-[10px] text-muted-foreground">当前 API：{activeLabel}</p>
				</div>
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={onClose}
					aria-label="返回"
					className="cursor-pointer"
				>
					<CornerUpLeft className="size-3.5" />
				</Button>
			</header>

			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				{isRunning && (
					<div className="rounded-md border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
						Agent 运行时，当前 API 配置与全局设置会被锁定；仍可创建或编辑未启用的配置。
					</div>
				)}

				{error && (
					<div
						role="alert"
						className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-[11px] text-destructive"
					>
						{error}
					</div>
				)}

				<section className="space-y-2">
					<div className="flex items-center justify-between">
						<div>
							<h3 className="text-sm font-semibold">API 配置</h3>
							<p className="text-[10px] text-muted-foreground">
								切换服务商时不会覆盖已保存的凭据。
							</p>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={handleAddProfile}
							className="h-7 gap-1 text-[11px] cursor-pointer"
						>
							<Plus className="size-3" /> 添加
						</Button>
					</div>

					<div className="space-y-1.5">
						<ProfileRow
							name="Page Agent Demo"
							detail={DEMO_MODEL}
							active={profileStore.activeProfileId === BUILTIN_DEMO_PROFILE_ID}
							selected={selectedIsBuiltin}
							onClick={() => selectProfile(BUILTIN_DEMO_PROFILE_ID)}
						/>
						{profileStore.profiles.map((profile) => (
							<ProfileRow
								key={profile.id}
								name={profile.name}
								detail={`${providerLabel(profile.provider)} · ${profile.config.model}`}
								active={profileStore.activeProfileId === profile.id}
								selected={selectedProfileId === profile.id}
								onClick={() => selectProfile(profile.id)}
							/>
						))}
					</div>

					<div className="rounded-md border p-3 space-y-3">
						<div className="flex items-center justify-between gap-2">
							<div>
								<div className="text-xs font-medium">
									{selectedIsNew
										? '新建 API 配置'
										: selectedIsBuiltin
											? 'Page Agent 演示配置'
											: draft.name || 'API 配置'}
								</div>
								<div className="text-[10px] text-muted-foreground">
									{selectedIsBuiltin
										? '内置，只读'
										: selectedIsActive
											? '当前使用'
											: selectedIsNew
												? '创建后不会自动启用'
												: '未启用'}
								</div>
							</div>
							{!selectedIsNew && !selectedIsActive && (
								<Button
									variant="outline"
									size="sm"
									disabled={isRunning}
									onClick={handleActivate}
									className="h-7 text-[11px] cursor-pointer"
								>
									使用此配置
								</Button>
							)}
						</div>

						{selectedIsBuiltin ? (
							<div className="grid gap-2">
								<ReadOnlyField label="接口地址" value={DEMO_BASE_URL} />
								<ReadOnlyField label="模型" value={DEMO_MODEL} />
							</div>
						) : (
							<>
								<Field label="配置名称">
									<Input
										value={draft.name}
										onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))}
										disabled={profileEditLocked}
										className="h-8 text-xs"
									/>
								</Field>

								<Field label="服务商">
									<select
										value={draft.provider}
										onChange={(e) => handleProviderChange(e.target.value as LlmProviderKind)}
										disabled={profileEditLocked}
										className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
									>
										<option value="deepseek">DeepSeek 官方</option>
										<option value="siliconflow">SiliconFlow</option>
										<option value="custom">自定义 OpenAI 兼容服务</option>
									</select>
								</Field>

								<Field label="接口地址">
									<Input
										value={draft.baseURL}
										onChange={(e) =>
											setDraft((current) => ({ ...current, baseURL: e.target.value }))
										}
										disabled={profileEditLocked}
										placeholder="https://api.example.com/v1"
										className="h-8 text-xs"
									/>
								</Field>

								<Field label="模型">
									<Input
										value={draft.model}
										onChange={(e) => setDraft((current) => ({ ...current, model: e.target.value }))}
										disabled={profileEditLocked}
										placeholder="输入模型 ID"
										className="h-8 text-xs"
									/>
								</Field>

								<Field label="API 密钥">
									<div className="flex gap-2">
										<Input
											type={showApiKey ? 'text' : 'password'}
											value={draft.apiKey}
											onChange={(e) =>
												setDraft((current) => ({ ...current, apiKey: e.target.value }))
											}
											disabled={profileEditLocked}
											className="h-8 text-xs"
										/>
										<Button
											variant="outline"
											size="icon"
											className="h-8 w-8 shrink-0 cursor-pointer"
											onClick={() => setShowApiKey((value) => !value)}
											aria-label={showApiKey ? '隐藏 API 密钥' : '显示 API 密钥'}
										>
											{showApiKey ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
										</Button>
									</div>
								</Field>

								<div className="grid grid-cols-2 gap-2">
									<Field label="温度">
										<Input
											type="number"
											step="0.1"
											value={draft.temperature}
											onChange={(e) =>
												setDraft((current) => ({ ...current, temperature: e.target.value }))
											}
											disabled={profileEditLocked}
											className="h-8 text-xs"
										/>
									</Field>
									<Field label="最大重试次数">
										<Input
											type="number"
											min={0}
											value={draft.maxRetries}
											onChange={(e) =>
												setDraft((current) => ({ ...current, maxRetries: e.target.value }))
											}
											disabled={profileEditLocked}
											className="h-8 text-xs"
										/>
									</Field>
								</div>

								<label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
									<span>禁用指定工具 tool_choice</span>
									<Switch
										checked={draft.disableNamedToolChoice}
										onCheckedChange={(checked) =>
											setDraft((current) => ({ ...current, disableNamedToolChoice: checked }))
										}
										disabled={profileEditLocked}
									/>
								</label>

								<div className="flex gap-2">
									{!selectedIsNew && (
										<Button
											variant="destructive"
											size="sm"
											onClick={handleDeleteProfile}
											disabled={savingProfile || (selectedIsActive && isRunning)}
											className="h-8 gap-1 text-xs cursor-pointer"
										>
											<Trash2 className="size-3" /> 删除
										</Button>
									)}
									<Button
										size="sm"
										onClick={handleSaveProfile}
										disabled={
											savingProfile ||
											profileEditLocked ||
											!draft.name.trim() ||
											!draft.baseURL.trim() ||
											!draft.model.trim()
										}
										className="ml-auto h-8 text-xs cursor-pointer"
									>
										{savingProfile ? '保存中...' : selectedIsNew ? '创建配置' : '保存配置'}
									</Button>
								</div>
							</>
						)}
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

					<button
						type="button"
						onClick={() => setAdvancedOpen((value) => !value)}
						className="text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
					>
						{advancedOpen ? '收起高级设置' : '显示高级设置'}
					</button>

					{advancedOpen && (
						<div className="space-y-3">
							<Field label="最大步骤数">
								<Input
									type="number"
									min={1}
									max={200}
									value={maxSteps ?? ''}
									onChange={(e) => setMaxSteps(e.target.value ? Number(e.target.value) : undefined)}
									disabled={isRunning}
									className="h-8 text-xs"
								/>
							</Field>
							<Field label="系统指令">
								<textarea
									value={systemInstruction}
									onChange={(e) => setSystemInstruction(e.target.value)}
									disabled={isRunning}
									rows={3}
									placeholder="给 Agent 的附加指令..."
									className="min-h-[60px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs"
								/>
							</Field>
							<label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
								<span>实验性 llms.txt 支持</span>
								<Switch
									checked={experimentalLlmsTxt}
									onCheckedChange={setExperimentalLlmsTxt}
									disabled={isRunning}
								/>
							</label>
							<label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
								<span>实验性包含所有标签页</span>
								<Switch
									checked={experimentalIncludeAllTabs}
									onCheckedChange={setExperimentalIncludeAllTabs}
									disabled={isRunning}
								/>
							</label>
						</div>
					)}

					<Button
						onClick={handleSaveGlobal}
						disabled={savingGlobal || isRunning || !config}
						className="h-8 w-full text-xs cursor-pointer"
					>
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
							<Input
								readOnly
								value={maskedToken(userAuthToken, showToken)}
								className="h-8 bg-background font-mono text-xs"
							/>
							<Button
								variant="outline"
								size="icon"
								className="h-8 w-8 shrink-0 cursor-pointer"
								disabled={!userAuthToken}
								onClick={() => setShowToken((value) => !value)}
								aria-label={showToken ? '隐藏令牌' : '显示令牌'}
							>
								{showToken ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
							</Button>
							<Button
								variant="outline"
								size="icon"
								className="h-8 w-8 shrink-0 cursor-pointer"
								disabled={!userAuthToken}
								onClick={handleCopyToken}
								aria-label="复制令牌"
							>
								{copied ? <Check className="size-3" /> : <Copy className="size-3" />}
							</Button>
						</div>
					</div>

					<a
						href="/hub.html"
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center justify-between rounded-md border bg-muted/50 p-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
					>
						管理 Page Agent Hub
						<ExternalLink className="size-3" />
					</a>
				</section>
			</div>
		</div>
	)
}

function ProfileRow({
	name,
	detail,
	active,
	selected,
	onClick,
}: {
	name: string
	detail: string
	active: boolean
	selected: boolean
	onClick: () => void
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition-colors cursor-pointer ${selected ? 'border-foreground/30 bg-muted/70' : 'bg-background hover:bg-muted/40'}`}
		>
			<div className="min-w-0">
				<div className="truncate text-xs font-medium">{name}</div>
				<div className="truncate text-[10px] text-muted-foreground">{detail}</div>
			</div>
			{active && (
				<span className="ml-2 shrink-0 rounded-full bg-foreground px-2 py-0.5 text-[9px] text-background">
					当前使用
				</span>
			)}
		</button>
	)
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label className="block space-y-1.5">
			<span className="text-xs text-muted-foreground">{label}</span>
			{children}
		</label>
	)
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
	return (
		<Field label={label}>
			<Input readOnly value={value} className="h-8 bg-muted/40 text-xs" />
		</Field>
	)
}

async function readProfileStore(fallbackConfig: ExtConfig | null): Promise<LlmProfileStoreV1> {
	const result = await chrome.storage.local.get(LLM_PROFILE_STORE_KEY)
	const parsed = parseLlmProfileStore(result[LLM_PROFILE_STORE_KEY])
	if (parsed) return resolveActiveProfile(parsed).store
	if (!fallbackConfig) return createBuiltinDemoStore()

	const serializable = serializeLlmProfileConfig(fallbackConfig)
	if (isBareDemoConfig(serializable)) return createBuiltinDemoStore()
	return createProfileStore({
		...createMigratedProfile(serializable),
		id: 'default',
		name: 'Current API',
	})
}

function createEmptyDraft(): ProfileDraft {
	return {
		name: 'New API',
		provider: 'custom',
		baseURL: '',
		model: '',
		apiKey: '',
		temperature: '0.7',
		maxRetries: '3',
		disableNamedToolChoice: false,
	}
}

function createBuiltinDraft(): ProfileDraft {
	return {
		name: 'Page Agent Demo',
		provider: 'custom',
		baseURL: DEMO_BASE_URL,
		model: DEMO_MODEL,
		apiKey: '',
		temperature: '',
		maxRetries: '',
		disableNamedToolChoice: false,
	}
}

function createDraftFromProfile(profile: LlmProfileStoreV1['profiles'][number]): ProfileDraft {
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
	return 'Custom'
}

function maskedToken(token: string, show: boolean): string {
	if (!token) return 'Loading...'
	if (show || token.length <= 8) return token
	return `${token.slice(0, 4)}${'•'.repeat(token.length - 8)}${token.slice(-4)}`
}

function toErrorMessage(reason: unknown): string {
	return reason instanceof Error ? reason.message : String(reason)
}
