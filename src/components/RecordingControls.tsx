import {
  HiMicrophone, HiStop, HiClipboard, HiTrash,
  HiCheck, HiPaperAirplane, HiArrowPath,
} from 'react-icons/hi2'
import { DICTATION_MODES } from '../constants/modes'

type DictationMode = (typeof DICTATION_MODES)[number]

/** Color constants for audio visualizer bars */
const VISUALIZER_COLORS = {
  rewriteHigh: '#5856D6',
  rewriteLow: '#7B7AE0',
  recordHigh: '#E94560',
  recordMid: '#f59e0b',
  recordLow: '#4ade80',
} as const

interface RecordingControlsProps {
  // State
  isRecording: boolean
  isProcessing: boolean
  isRewriteMode: boolean
  currentMode: DictationMode
  statusMessage: string
  recordingDuration: number
  audioData: number[]
  editedText: string
  processedText: string
  lastCommittedText: string
  copied: boolean
  pasting: boolean
  trainingMode: boolean
  trainingSaved: boolean
  trainingEnabled: boolean

  // Handlers
  onToggleRecording: () => void
  onCycleMode: () => void
  onCopy: () => void
  onAutoType: () => void
  onClear: () => void
  onRewriteStart: () => void
  onTrainingSave: () => void
  onToggleTraining: () => void
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function getMicButtonClasses(isProcessing: boolean, isRewriteMode: boolean, isRecording: boolean) {
  if (isProcessing) return 'bg-cd-mic-proc text-white cursor-not-allowed'
  if (isRewriteMode) return 'bg-cd-rewrite text-white scale-110'
  if (isRecording) return 'bg-cd-mic-rec text-white scale-110'
  return 'bg-cd-mic-idle text-gray-400 hover:bg-gray-700 hover:text-white hover:scale-105'
}

export default function RecordingControls({
  isRecording, isProcessing, isRewriteMode,
  currentMode, statusMessage, recordingDuration, audioData,
  editedText, processedText, lastCommittedText,
  copied, pasting, trainingMode, trainingSaved, trainingEnabled,
  onToggleRecording, onCycleMode, onCopy, onAutoType, onClear,
  onRewriteStart, onTrainingSave, onToggleTraining,
}: RecordingControlsProps) {
  return (
    <div className="flex flex-col items-center gap-3 w-44 shrink-0">
      {/* Mode selector pill */}
      <button
        onClick={onCycleMode}
        className="px-4 py-1.5 rounded-full text-sm font-medium bg-cd-card text-cd-accent border border-cd-accent/30 hover:border-cd-accent/60 transition-all"
      >
        {currentMode.name}
      </button>

      {/* Status message */}
      <p className="text-center text-xs text-cd-subtle leading-tight min-h-[2rem]">
        {statusMessage}
      </p>

      {/* Mic button */}
      <button
        onClick={onToggleRecording}
        disabled={isProcessing}
        className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${getMicButtonClasses(isProcessing, isRewriteMode, isRecording)}`}
      >
        {isRecording && (
          <div className={`absolute inset-0 rounded-full ${isRewriteMode ? 'bg-cd-rewrite' : 'bg-cd-mic-rec'} recording-pulse`}></div>
        )}
        {isRecording ? (
          <HiStop className="w-8 h-8 relative z-10" />
        ) : isProcessing ? (
          <div className="w-7 h-7 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
        ) : (
          <HiMicrophone className="w-8 h-8 relative z-10" />
        )}
      </button>

      {/* Recording timer + volume meter */}
      {isRecording && (
        <div className="text-center">
          <span className={`font-medium text-base ${isRewriteMode ? 'text-cd-rewrite' : 'text-cd-mic-rec'}`}>
            {formatDuration(recordingDuration)}
          </span>
          {audioData.length > 0 && (
            <div className="flex items-end justify-center gap-[2px] h-6 mt-1">
              {audioData.map((level, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full"
                  style={{
                    height: `${Math.max(2, level * 24)}px`,
                    backgroundColor: isRewriteMode
                      ? (level > 0.5 ? VISUALIZER_COLORS.rewriteHigh : VISUALIZER_COLORS.rewriteLow)
                      : (level > 0.65 ? VISUALIZER_COLORS.recordHigh : level > 0.35 ? VISUALIZER_COLORS.recordMid : VISUALIZER_COLORS.recordLow),
                    transition: 'height 50ms ease-out',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Training mode toggle */}
      {trainingEnabled && !isRecording && !isProcessing && (
        <button
          onClick={onToggleTraining}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
            trainingMode
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              : 'bg-cd-card text-cd-subtle border border-white/10 hover:text-cd-text hover:border-white/20'
          }`}
        >
          <div className={`w-7 h-3.5 rounded-full relative transition-all ${trainingMode ? 'bg-amber-500' : 'bg-gray-600'}`}>
            <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${trainingMode ? 'left-3.5' : 'left-0.5'}`} />
          </div>
          Train
        </button>
      )}

      {/* Rewrite button */}
      {lastCommittedText && !isRecording && !isProcessing && (
        <button
          onClick={onRewriteStart}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-cd-rewrite/20 text-cd-rewrite border border-cd-rewrite/30 hover:bg-cd-rewrite/30 transition-all"
        >
          <HiArrowPath className="w-3.5 h-3.5" />
          Rewrite
        </button>
      )}

      {/* Action buttons - stacked vertically */}
      {editedText && (
        <div className="flex flex-col gap-2 w-full mt-1">
          {/* Training save button */}
          {trainingMode && processedText && (
            <button
              onClick={onTrainingSave}
              disabled={trainingSaved}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all shadow-sm w-full ${
                trainingSaved
                  ? 'bg-green-500 text-white'
                  : 'bg-amber-500 hover:bg-amber-400 text-black hover:shadow-md'
              }`}
              title="Save your corrections as a learning pattern"
            >
              {trainingSaved ? <HiCheck className="w-3.5 h-3.5" /> : '\u{1F9E0}'}
              {trainingSaved ? 'Learned!' : 'Save Training'}
            </button>
          )}

          <button
            onClick={onCopy}
            disabled={!editedText}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all shadow-sm w-full
              ${copied
                ? 'bg-green-500 text-white'
                : 'bg-cd-accent hover:bg-cd-accent/80 text-white hover:shadow-md'
              }`}
            title="Copy to clipboard"
          >
            {copied ? <HiCheck className="w-3.5 h-3.5" /> : <HiClipboard className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          <button
            onClick={onAutoType}
            disabled={pasting}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-cd-rewrite hover:bg-cd-rewrite/80 text-white transition-all shadow-sm hover:shadow-md disabled:opacity-50 w-full"
            title="Auto-type to active window"
          >
            <HiPaperAirplane className={`w-3.5 h-3.5 ${pasting ? 'animate-pulse' : ''}`} />
            Auto-Type
          </button>

          <button
            onClick={onClear}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-cd-card hover:bg-white/10 text-cd-subtle transition-all border border-white/10 w-full"
            title="Clear text"
          >
            <HiTrash className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
