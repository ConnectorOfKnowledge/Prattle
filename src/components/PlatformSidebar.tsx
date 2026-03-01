import { useAppStore } from '../stores/appStore'
import { HiChevronDoubleLeft, HiChevronDoubleRight } from 'react-icons/hi2'

interface PlatformSidebarProps {
  onPlatformSelect: (platformId: string) => void
}

export default function PlatformSidebar({ onPlatformSelect }: PlatformSidebarProps) {
  const {
    settings,
    platformPrompts,
    processedTextByPlatform,
    editedTextByPlatform,
    processingPlatforms,
    sidebarCollapsed,
    setSidebarCollapsed,
  } = useAppStore()

  if (!platformPrompts || !settings) return null

  const activePlatforms = Object.entries(platformPrompts).filter(([_, p]) => p.enabled)
  const activePlatformId = settings.activePlatform

  if (sidebarCollapsed) {
    return (
      <div className="w-10 border-r border-surface-200 bg-white flex flex-col items-center py-3 shrink-0">
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="p-1.5 rounded-lg hover:bg-surface-100 text-gray-400 hover:text-gray-600 transition-colors"
          title="Expand sidebar"
        >
          <HiChevronDoubleRight className="w-4 h-4" />
        </button>

        {/* Mini platform indicators */}
        <div className="mt-4 space-y-1.5">
          {activePlatforms.map(([id, platform]) => (
            <button
              key={id}
              onClick={() => onPlatformSelect(id)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all ${
                id === activePlatformId
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'bg-surface-100 text-gray-500 hover:bg-surface-200'
              }`}
              title={platform.name}
            >
              {platform.name.charAt(0)}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="w-56 border-r border-surface-200 bg-white flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-surface-100">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Platforms</span>
        <button
          onClick={() => setSidebarCollapsed(true)}
          className="p-1 rounded hover:bg-surface-100 text-gray-400 hover:text-gray-600 transition-colors"
          title="Collapse sidebar"
        >
          <HiChevronDoubleLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Platform list */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {activePlatforms.map(([id, platform]) => {
          const isActive = id === activePlatformId
          const isProcessing = processingPlatforms[id]
          const previewText = editedTextByPlatform[id] || processedTextByPlatform[id] || ''

          return (
            <button
              key={id}
              onClick={() => onPlatformSelect(id)}
              className={`w-full text-left px-3 py-2.5 transition-all border-l-3 ${
                isActive
                  ? 'bg-primary-50 border-primary-500 text-primary-800'
                  : 'border-transparent hover:bg-surface-50 text-gray-700 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${isActive ? 'text-primary-700' : ''}`}>
                  {platform.name}
                </span>
                {isProcessing && (
                  <div className="w-3 h-3 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                )}
              </div>

              {previewText ? (
                <p className={`text-[11px] mt-0.5 line-clamp-2 leading-tight ${
                  isActive ? 'text-primary-600/70' : 'text-gray-400'
                }`}>
                  {previewText}
                </p>
              ) : (
                <p className="text-[11px] mt-0.5 text-gray-300 italic">
                  {platform.prompt ? 'No text yet' : 'Raw mode'}
                </p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
