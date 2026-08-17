/**
 * React hook for using AgentController
 */
import type { AgentActivity, AgentStatus, ExecutionResult, HistoricalEvent } from '@page-agent/core'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
	LLM_PROFILE_STORE_KEY,
	createMigratedProfile,
	createProfileStore,
	parseLlmProfileStore,
	serializeLlmProfileConfig,
	setActiveProfile,
	updateActiveProfileConfig,
} from './LlmProfileStore'
import { MultiPageAgent } from './MultiPageAgent'
import {
	type AdvancedConfig,
	type ExtConfig,
	type LanguagePreference,
	loadAgentConfig,
} from './loadAgentConfig'

export type { AdvancedConfig, ExtConfig, LanguagePreference } from './loadAgentConfig'

export interface UseAgentResult {
	status: AgentStatus
	history: HistoricalEvent[]
	activity: AgentActivity | null
	currentTask: string
	config: ExtConfig | null
	execute: (task: string) => Promise<ExecutionResult>
	stop: () => void
	configure: (config: ExtConfig) => Promise<void>
	switchProfile: (profileId: string) => Promise<void>
}

export function useAgent(): UseAgentResult {
	const agentRef = useRef<MultiPageAgent | null>(null)
	const [status, setStatus] = useState<AgentStatus>('idle')
	const [history, setHistory] = useState<HistoricalEvent[]>([])
	const [activity, setActivity] = useState<AgentActivity | null>(null)
	const [currentTask, setCurrentTask] = useState('')
	const [config, setConfig] = useState<ExtConfig | null>(null)
	const configRef = useRef<ExtConfig | null>(null)
	const pendingConfigRecycleRef = useRef(false)
	const scheduleTransitionRef = useRef<() => Promise<void>>(async () => {})
	const transitionInFlightRef = useRef<Promise<void> | null>(null)
	const transitionDirtyRef = useRef(false)
	const replacementReadyRef = useRef<(() => void) | null>(null)

	const ensureIdle = () => {
		if (agentRef.current?.status === 'running')
			throw new Error('Cannot change configuration while Agent is running')
	}

	const scheduleConfigTransition = useCallback((): Promise<void> => {
		transitionDirtyRef.current = true
		if (transitionInFlightRef.current) return transitionInFlightRef.current

		const transition = (async () => {
			try {
				while (transitionDirtyRef.current) {
					transitionDirtyRef.current = false
					const nextConfig = await loadAgentConfig()
					if (sameEffectiveConfig(configRef.current, nextConfig)) continue
					await new Promise<void>((resolve) => {
						replacementReadyRef.current = resolve
						configRef.current = nextConfig
						setConfig(nextConfig)
					})
				}
			} finally {
				transitionInFlightRef.current = null
			}
		})()
		transitionInFlightRef.current = transition
		return transition
	}, [])
	scheduleTransitionRef.current = scheduleConfigTransition

	useEffect(() => {
		void scheduleConfigTransition()
	}, [scheduleConfigTransition])

	useEffect(() => {
		const onStorageChanged = (
			changes: Record<string, chrome.storage.StorageChange>,
			areaName: string
		) => {
			if (areaName !== 'local' || !hasRelevantConfigChange(changes)) return
			if (agentRef.current?.status === 'running') {
				pendingConfigRecycleRef.current = true
				return
			}
			void scheduleTransitionRef.current()
		}
		chrome.storage.onChanged.addListener(onStorageChanged)
		return () => chrome.storage.onChanged.removeListener(onStorageChanged)
	}, [])

	useEffect(() => {
		if (!config) return

		const { systemInstruction, ...agentConfig } = config
		const agent = new MultiPageAgent({
			...agentConfig,
			instructions: systemInstruction ? { system: systemInstruction } : undefined,
		})
		agentRef.current = agent
		replacementReadyRef.current?.()
		replacementReadyRef.current = null

		const handleStatusChange = (e: Event) => {
			const newStatus = agent.status as AgentStatus
			setStatus(newStatus)
			if (newStatus !== 'running') {
				setActivity(null)
				if (pendingConfigRecycleRef.current) {
					pendingConfigRecycleRef.current = false
					void scheduleTransitionRef.current()
				}
			}
		}

		const handleHistoryChange = (e: Event) => {
			setHistory([...agent.history])
		}

		const handleActivity = (e: Event) => {
			const newActivity = (e as CustomEvent).detail as AgentActivity
			setActivity(newActivity)
		}

		agent.addEventListener('statuschange', handleStatusChange)
		agent.addEventListener('historychange', handleHistoryChange)
		agent.addEventListener('activity', handleActivity)

		return () => {
			replacementReadyRef.current?.()
			replacementReadyRef.current = null
			agent.removeEventListener('statuschange', handleStatusChange)
			agent.removeEventListener('historychange', handleHistoryChange)
			agent.removeEventListener('activity', handleActivity)
			agent.dispose()
		}
	}, [config])

	const execute = useCallback(async (task: string) => {
		const transition = transitionInFlightRef.current
		if (transition) await transition
		const agent = agentRef.current
		if (!agent) throw new Error('Agent not initialized')

		setCurrentTask(task)
		setHistory([])
		return agent.execute(task)
	}, [])

	const stop = useCallback(() => {
		agentRef.current?.stop()
	}, [])

	const configure = useCallback(
		async ({
			language,
			maxSteps,
			systemInstruction,
			experimentalLlmsTxt,
			experimentalIncludeAllTabs,
			...llmConfig
		}: ExtConfig) => {
			ensureIdle()
			const result = await chrome.storage.local.get(LLM_PROFILE_STORE_KEY)
			ensureIdle()
			const storedProfileStore = parseLlmProfileStore(result[LLM_PROFILE_STORE_KEY])
			const profileConfig = serializeLlmProfileConfig(llmConfig)
			const profileStore = storedProfileStore
				? updateActiveProfileConfig(storedProfileStore, profileConfig)
				: createProfileStore({
						...createMigratedProfile(profileConfig),
						id: 'default',
						name: 'Default API',
					})
			const advancedConfig: AdvancedConfig = {
				maxSteps,
				systemInstruction,
				experimentalLlmsTxt,
				experimentalIncludeAllTabs,
			}
			ensureIdle()
			await chrome.storage.local.set({
				[LLM_PROFILE_STORE_KEY]: profileStore,
				language: language ?? null,
				advancedConfig,
			})
			await scheduleConfigTransition()
		},
		[]
	)

	const switchProfile = useCallback(
		async (profileId: string) => {
			ensureIdle()
			const result = await chrome.storage.local.get(LLM_PROFILE_STORE_KEY)
			ensureIdle()
			const store = parseLlmProfileStore(result[LLM_PROFILE_STORE_KEY])
			if (!store) throw new Error('LLM profile store is unavailable')
			const nextStore = setActiveProfile(store, profileId)
			await chrome.storage.local.set({ [LLM_PROFILE_STORE_KEY]: nextStore })
			await scheduleConfigTransition()
		},
		[scheduleConfigTransition]
	)

	return {
		status,
		history,
		activity,
		currentTask,
		config,
		execute,
		stop,
		configure,
		switchProfile,
	}
}

function hasRelevantConfigChange(changes: Record<string, chrome.storage.StorageChange>): boolean {
	return ['llmProfileStoreV1', 'language', 'advancedConfig'].some((key) => key in changes)
}

function sameEffectiveConfig(a: ExtConfig | null, b: ExtConfig): boolean {
	if (!a) return false
	const keys: (keyof ExtConfig)[] = [
		'baseURL',
		'model',
		'apiKey',
		'temperature',
		'maxRetries',
		'disableNamedToolChoice',
		'language',
		'maxSteps',
		'systemInstruction',
		'experimentalLlmsTxt',
		'experimentalIncludeAllTabs',
	]
	return keys.every((key) => a[key] === b[key])
}
