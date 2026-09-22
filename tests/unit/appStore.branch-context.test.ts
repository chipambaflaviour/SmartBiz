import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/shared/stores/appStore'

const ORGANIZATION_A = '00000000-0000-4000-8000-000000000001'
const ORGANIZATION_B = '00000000-0000-4000-8000-000000000002'
const BRANCH_A = '10000000-0000-4000-8000-000000000001'

describe('organization workspace branch context', () => {
  beforeEach(() => {
    localStorage.clear()
    useAppStore.getState().reset()
  })

  it('keeps the selected branch beneath the active organization workspace', () => {
    const state = useAppStore.getState()

    state.setActiveOrganizationId(ORGANIZATION_A)
    state.setActiveBranchId(BRANCH_A)

    expect(useAppStore.getState()).toMatchObject({
      activeOrganizationId: ORGANIZATION_A,
      activeBranchId: BRANCH_A,
      isPlatformAdmin: false,
    })
  })

  it('clears organization and branch context when the authenticated session resets', () => {
    const state = useAppStore.getState()
    state.setActiveOrganizationId(ORGANIZATION_A)
    state.setActiveBranchId(BRANCH_A)
    state.setIsPlatformAdmin(true)

    useAppStore.getState().reset()

    expect(useAppStore.getState()).toMatchObject({
      activeOrganizationId: null,
      activeBranchId: null,
      currentUser: null,
      isPlatformAdmin: false,
    })
  })

  it('does not carry a branch into a different organization workspace', () => {
    const state = useAppStore.getState()
    state.setActiveOrganizationId(ORGANIZATION_A)
    state.setActiveBranchId(BRANCH_A)

    useAppStore.getState().setActiveOrganizationId(ORGANIZATION_B)

    expect(useAppStore.getState()).toMatchObject({
      activeOrganizationId: ORGANIZATION_B,
      activeBranchId: null,
    })
  })

  it('clears branch context when leaving an organization for platform backoffice', () => {
    const state = useAppStore.getState()
    state.setActiveOrganizationId(ORGANIZATION_A)
    state.setActiveBranchId(BRANCH_A)

    useAppStore.getState().setActiveOrganizationId(null)

    expect(useAppStore.getState()).toMatchObject({
      activeOrganizationId: null,
      activeBranchId: null,
    })
  })
})
