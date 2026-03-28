import { exec } from 'child_process'

// ---- Foreground window tracking ----
// Detect the active window title so the user knows where text will be pasted.
// Uses a persistent PowerShell process with pre-compiled C# type to avoid the
// massive overhead of spawning a new PowerShell + compiling Add-Type on every poll.
let foregroundPsProcess: ReturnType<typeof exec> | null = null
let foregroundPsReady = false
let foregroundTrackingInterval: ReturnType<typeof setInterval> | null = null
let lastForegroundWindow = ''

type SendFn = (channel: string, ...args: unknown[]) => void

// Returns the window title of the foreground app, or empty string on failure.
// When the persistent PS process is available, sends a command to it;
// otherwise falls back to a lightweight one-shot command.
export function getForegroundWindowTitle(): Promise<string> {
  return new Promise((resolve) => {
    // Use the persistent PowerShell process if it's ready
    if (foregroundPsProcess && foregroundPsReady) {
      // Write a command that outputs the title followed by a sentinel line
      foregroundPsProcess.stdin?.write('Write-Output ([FgHelper]::GetTitle()); Write-Output "---END---"\n')

      let output = ''
      const onData = (chunk: Buffer | string) => {
        output += chunk.toString()
        if (output.includes('---END---')) {
          foregroundPsProcess?.stdout?.removeListener('data', onData)
          const lines = output.split('\n').map(l => l.trim()).filter(l => l && l !== '---END---')
          resolve(lines[0] || '')
        }
      }
      foregroundPsProcess.stdout?.on('data', onData)

      // Safety timeout -- don't hang forever
      setTimeout(() => {
        foregroundPsProcess?.stdout?.removeListener('data', onData)
        if (!output.includes('---END---')) resolve('')
      }, 1000)
      return
    }

    // Fallback: lightweight one-shot (faster than the old Add-Type approach)
    exec(
      'powershell -NoProfile -Command "[Console]::OutputEncoding = [Text.Encoding]::UTF8; Add-Type -TypeDefinition \'using System; using System.Runtime.InteropServices; using System.Text; public class FgW { [DllImport(\"user32.dll\")] static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int count); public static string Get() { var sb = new StringBuilder(256); GetWindowText(GetForegroundWindow(), sb, 256); return sb.ToString(); } }\'; [FgW]::Get()"',
      { timeout: 3000 },
      (error, stdout) => {
        resolve(error ? '' : stdout.trim())
      }
    )
  })
}

// Start a persistent PowerShell process with the C# type pre-compiled.
// This makes subsequent GetTitle() calls near-instant instead of ~500ms each.
function startPersistentPowerShell(): void {
  if (foregroundPsProcess) return

  foregroundPsProcess = exec(
    'powershell -NoProfile -NoExit -Command "-"',
    { timeout: 0 } // No timeout for persistent process
  )

  // Pre-compile the C# helper type and define a convenience function
  const initScript = `
Add-Type -TypeDefinition '
using System;
using System.Runtime.InteropServices;
using System.Text;
public class FgHelper {
  [DllImport("user32.dll")]
  static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int count);
  public static string GetTitle() {
    var sb = new StringBuilder(256);
    GetWindowText(GetForegroundWindow(), sb, 256);
    return sb.ToString();
  }
}
'
Write-Output "---READY---"
`
  foregroundPsProcess.stdin?.write(initScript + '\n')

  // Wait for the READY signal
  let initOutput = ''
  const onInit = (chunk: Buffer | string) => {
    initOutput += chunk.toString()
    if (initOutput.includes('---READY---')) {
      foregroundPsProcess?.stdout?.removeListener('data', onInit)
      foregroundPsReady = true
      console.log('[Prattle] Persistent PowerShell ready for foreground tracking')
    }
  }
  foregroundPsProcess.stdout?.on('data', onInit)

  foregroundPsProcess.on('exit', () => {
    foregroundPsProcess = null
    foregroundPsReady = false
  })

  foregroundPsProcess.on('error', (err) => {
    console.error('[Prattle] Persistent PowerShell error:', err)
    foregroundPsProcess = null
    foregroundPsReady = false
  })
}

export function stopPersistentPowerShell(): void {
  if (foregroundPsProcess) {
    try {
      foregroundPsProcess.stdin?.write('exit\n')
      foregroundPsProcess.kill()
    } catch (e) {
      console.error('[Prattle] Failed to stop PowerShell:', e)
    }
    foregroundPsProcess = null
    foregroundPsReady = false
  }
}

export function startForegroundTracking(sendToIndicator: SendFn, sendToRenderer: SendFn): void {
  if (foregroundTrackingInterval) return

  // Start the persistent PS process for fast polling
  startPersistentPowerShell()

  // Immediately capture the current foreground window
  getForegroundWindowTitle().then(title => {
    if (title && !title.includes('Prattle')) {
      lastForegroundWindow = title
      sendToIndicator('target-window', title)
      sendToRenderer('target-window', title)
    }
  })
  foregroundTrackingInterval = setInterval(async () => {
    const title = await getForegroundWindowTitle()
    if (title && !title.includes('Prattle') && title !== lastForegroundWindow) {
      lastForegroundWindow = title
      sendToIndicator('target-window', title)
      sendToRenderer('target-window', title)
    }
  }, 1000)
}

export function stopForegroundTracking(): void {
  if (foregroundTrackingInterval) {
    clearInterval(foregroundTrackingInterval)
    foregroundTrackingInterval = null
  }
  stopPersistentPowerShell()
}
