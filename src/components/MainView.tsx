import { useState, useCallback, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { analyzeEdits } from '../services/llmService'
import { submitRating } from '../services/proxyService'
import { DICTATION_MODES } from '../constants/modes'
import { findWordSwaps, countWordSwapInPatterns } from '../utils/textAnalysis'
import { useRecording } from '../hooks/useRecording'
import { useAudioVisualization } from '../hooks/useAudioVisualization'
import RecordingControls from './RecordingControls'
import TextOutputPanel from './TextOutputPanel'
import { v4 as uuidv4 } from 'uuid'

export default function MainView() {
  const {
    settings, dictionary, learnedPatterns,
    recordingState, rawText, processedText, editedText, lastCommittedText,
    statusMessage, recordingDuration,
    setEditedText, setStatusMessage, setRecordingDuration, clearText,
    saveLearnedPatternsToFile, saveDictionaryToFile,
  } = useAppStore()

  const [copied, setCopied] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [trainingMode, setTrainingMode] = useState(false)
  const [trainingSaved, setTrainingSaved] = useState(false)
  const [pendingRating, setPendingRating] = useState<number>(0)
  const [ratingSubmitted, setRatingSubmitted] = useState(false)

  const isRecording = recordingState === 'recording' || recordingState === 'rewrite_recording'
  const isProcessing = recordingState === 'processing'
  const isRewriteMode = recordingState === 'rewrite_recording'
  const currentMode = settings ? DICTATION_MODES[settings.currentModeIndex] : DICTATION_MODES[0]

  const { toggleRecording, startRewrite } = useRecording({
    trainingMode,
  })

  const audioData = useAudioVisualization(isRecording)

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      setRecordingDuration(0)
      const timer = setInterval(() => {
        const current = useAppStore.getState().recordingDuration
        setRecordingDuration(current + 1)
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [isRecording])

  // Reset rating state when recording starts (via useRecording clearing editedText)
  useEffect(() => {
    if (isRecording) {
      setPendingRating(0)
      setRatingSubmitted(false)
    }
  }, [isRecording])

  const handleCycleMode = useCallback(async () => {
    if (!settings) return
    const nextIndex = (settings.currentModeIndex + 1) % DICTATION_MODES.length
    const newSettings = { ...settings, currentModeIndex: nextIndex }
    await useAppStore.getState().saveSettingsToFile(newSettings)
  }, [settings])

  const handleCopy = useCallback(async () => {
    if (!editedText.trim()) return

    if (processedText && editedText !== processedText && settings && learnedPatterns) {
      try {
        const modeId = DICTATION_MODES[settings.currentModeIndex]?.id || 'clean'
        const pattern = await analyzeEdits(processedText, editedText, modeId, settings)

        if (pattern) {
          const newPattern = {
            id: uuidv4(),
            description: pattern.description,
            rule: pattern.rule,
            platform: modeId,
            createdAt: new Date().toISOString(),
            source: 'auto' as const,
            active: true,
          }

          const updated = {
            patterns: [...learnedPatterns.patterns, newPattern]
          }
          await saveLearnedPatternsToFile(updated)
          setStatusMessage('Copied! Learned a new pattern.')
        } else {
          setStatusMessage('Copied to clipboard!')
        }
      } catch {
        setStatusMessage('Copied to clipboard!')
      }
    } else {
      setStatusMessage('Copied to clipboard!')
    }

    await navigator.clipboard.writeText(editedText + ' ')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [editedText, processedText, settings, learnedPatterns])

  const handleAutoType = useCallback(async () => {
    if (!editedText.trim()) return
    setPasting(true)
    setStatusMessage('Typing to external window...')

    try {
      const success = await window.electronAPI.pasteToExternal(editedText + ' ')
      if (success) {
        setStatusMessage('Typed to external window!')
      } else {
        setStatusMessage('Auto-type failed - try copying manually')
      }
    } catch (error: any) {
      setStatusMessage(`Auto-type error: ${error.message}`)
    } finally {
      setPasting(false)
    }
  }, [editedText])

  const handleClear = useCallback(() => {
    clearText()
    setTrainingSaved(false)
    setStatusMessage('Ready')
  }, [])

  const handleTrainingSave = useCallback(async () => {
    if (!processedText || !editedText || !settings || !learnedPatterns || !dictionary) return

    if (processedText.trim() === editedText.trim()) {
      setStatusMessage('No changes detected. Edit the text first, then save.')
      return
    }

    setStatusMessage('Analyzing your corrections...')

    try {
      const modeId = DICTATION_MODES[settings.currentModeIndex]?.id || 'clean'
      const pattern = await analyzeEdits(processedText, editedText, modeId, settings)
      const messages: string[] = []

      if (pattern) {
        const newPattern = {
          id: uuidv4(),
          description: pattern.description,
          rule: pattern.rule,
          platform: modeId,
          createdAt: new Date().toISOString(),
          source: 'auto' as const,
          active: true,
          originalText: processedText.trim(),
          correctedText: editedText.trim(),
          action: 'prompt_rule' as const,
        }

        const updatedPatterns = [...learnedPatterns.patterns, newPattern]
        await saveLearnedPatternsToFile({ patterns: updatedPatterns })
        messages.push(`Learned: "${pattern.description}"`)

        // Auto-dictionary: find simple word swaps corrected 3+ times
        const wordSwaps = findWordSwaps(processedText.trim(), editedText.trim())
        for (const swap of wordSwaps) {
          const swapCount = countWordSwapInPatterns(updatedPatterns, swap.from, swap.to)
          if (swapCount >= 3 && !dictionary.replacements[swap.from.toLowerCase()]) {
            const updatedDict = {
              replacements: {
                ...dictionary.replacements,
                [swap.from.toLowerCase()]: swap.to,
              }
            }
            await saveDictionaryToFile(updatedDict)

            const dictPattern = {
              id: uuidv4(),
              description: `Auto-added to dictionary: "${swap.from}" -> "${swap.to}"`,
              rule: `Always replace "${swap.from}" with "${swap.to}"`,
              platform: 'all',
              createdAt: new Date().toISOString(),
              source: 'auto' as const,
              active: true,
              action: 'dictionary_add' as const,
            }
            updatedPatterns.push(dictPattern)
            await saveLearnedPatternsToFile({ patterns: updatedPatterns })
            messages.push(`Added "${swap.from}" -> "${swap.to}" to dictionary (corrected 3+ times)`)
          }
        }
      } else {
        messages.push('Changes were too minor to extract a pattern. Try a more specific correction.')
      }

      setTrainingSaved(messages.length > 0 && !messages[0].includes('too minor'))
      setStatusMessage(messages.join(' | '))
    } catch (error: any) {
      setStatusMessage(`Training error: ${error.message}`)
    }
  }, [processedText, editedText, settings, learnedPatterns, dictionary])

  const handleRatingSubmit = useCallback(async () => {
    if (pendingRating < 1 || !rawText || !processedText) return
    setRatingSubmitted(true)
    const modeId = settings ? DICTATION_MODES[settings.currentModeIndex]?.id : undefined
    await submitRating(rawText, processedText, pendingRating, modeId)
  }, [pendingRating, rawText, processedText, settings])

  return (
    <div className="flex h-full p-4 gap-4">
      <RecordingControls
        isRecording={isRecording}
        isProcessing={isProcessing}
        isRewriteMode={isRewriteMode}
        currentMode={currentMode}
        statusMessage={statusMessage}
        recordingDuration={recordingDuration}
        audioData={audioData}
        editedText={editedText}
        processedText={processedText}
        lastCommittedText={lastCommittedText}
        copied={copied}
        pasting={pasting}
        trainingMode={trainingMode}
        trainingSaved={trainingSaved}
        trainingEnabled={!!settings?.trainingEnabled}
        onToggleRecording={toggleRecording}
        onCycleMode={handleCycleMode}
        onCopy={handleCopy}
        onAutoType={handleAutoType}
        onClear={handleClear}
        onRewriteStart={startRewrite}
        onTrainingSave={handleTrainingSave}
        onToggleTraining={() => { setTrainingMode(!trainingMode); setTrainingSaved(false) }}
      />

      <TextOutputPanel
        editedText={editedText}
        processedText={processedText}
        rawText={rawText}
        isRecording={isRecording}
        isProcessing={isProcessing}
        trainingMode={trainingMode}
        trainingSaved={trainingSaved}
        fontSize={settings?.fontSize || 16}
        pendingRating={pendingRating}
        ratingSubmitted={ratingSubmitted}
        onRatingSelect={(star) => { if (!ratingSubmitted) setPendingRating(star) }}
        onRatingSubmit={handleRatingSubmit}
        onEditedTextChange={setEditedText}
        onTrainingSavedReset={() => setTrainingSaved(false)}
      />
    </div>
  )
}
