import { createContext, useContext } from 'react'
import { useBpmnStore } from '../stores/bpmnStore'

export type BpmnStoreHook = typeof useBpmnStore

const BpmnStoreContext = createContext<BpmnStoreHook>(useBpmnStore)

export const BpmnStoreProvider = BpmnStoreContext.Provider

export function usePageBpmnStoreHook(): BpmnStoreHook {
  return useContext(BpmnStoreContext)
}

export function usePageBpmnStore() {
  return usePageBpmnStoreHook()()
}
