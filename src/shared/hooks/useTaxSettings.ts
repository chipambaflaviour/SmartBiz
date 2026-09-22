import { useQuery } from '@tanstack/react-query'
import { isDemoMode, supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'

export type TaxSettings = {
  vatEnabled: boolean
  vatRate: number
  pricesIncludeVat: boolean
  taxNumber: string
}

const DEFAULTS: TaxSettings = { vatEnabled: false, vatRate: 16, pricesIncludeVat: true, taxNumber: '' }

function parseSettings(value: unknown): TaxSettings {
  const settings = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const rate = Number(settings.vat_rate ?? DEFAULTS.vatRate)
  return {
    vatEnabled: settings.vat_enabled === true,
    vatRate: Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : DEFAULTS.vatRate,
    pricesIncludeVat: settings.vat_prices_include_tax !== false,
    taxNumber: typeof settings.tax_number === 'string' ? settings.tax_number : '',
  }
}

export function useTaxSettings() {
  const organizationId = useAppStore((state) => state.activeOrganizationId)
  return useQuery({
    queryKey: ['tax-settings', organizationId],
    queryFn: async () => {
      if (isDemoMode) return { ...DEFAULTS, vatEnabled: true }
      if (!organizationId) return DEFAULTS
      const { data, error } = await supabase.from('organization').select('settings').eq('id', organizationId).single()
      if (error) throw error
      return parseSettings(data?.settings)
    },
    enabled: Boolean(organizationId),
    staleTime: 60_000,
  })
}

export function calculateVat(grossAmount: number, settings: TaxSettings) {
  if (!settings.vatEnabled || settings.vatRate <= 0) return { vat: 0, net: grossAmount, gross: grossAmount }
  const rate = settings.vatRate / 100
  if (settings.pricesIncludeVat) {
    const vat = grossAmount * rate / (1 + rate)
    return { vat, net: grossAmount - vat, gross: grossAmount }
  }
  const vat = grossAmount * rate
  return { vat, net: grossAmount, gross: grossAmount + vat }
}
