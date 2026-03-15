#include <windows.h>

// Pre-compiled helper for simulating Ctrl+V via SendInput with hardware scan codes.
// This is the v1.9.2 approach that works in Notepad, Claude Code, and some Chrome fields.
//
// Chrome web forms (input/textarea/contentEditable) do not reliably receive
// synthetic input due to Chromium's multi-process renderer sandboxing.
// This is a known limitation -- the app shows a one-time notice to users.
//
// Uses VK_LCONTROL (left Ctrl) -- Chrome distinguishes left/right.
// Checks SendInput return value for silent failures.
// Split sends with 10ms gap between Ctrl-down and V-down for Chromium reliability.

int SendCtrlV() {
    INPUT inputs[4] = {};

    WORD ctrlScan = (WORD)MapVirtualKey(VK_LCONTROL, MAPVK_VK_TO_VSC);
    WORD vScan = (WORD)MapVirtualKey('V', MAPVK_VK_TO_VSC);

    // Ctrl down
    inputs[0].type = INPUT_KEYBOARD;
    inputs[0].ki.wVk = 0;
    inputs[0].ki.wScan = ctrlScan;
    inputs[0].ki.dwFlags = KEYEVENTF_SCANCODE;
    inputs[0].ki.time = 0;
    inputs[0].ki.dwExtraInfo = 0;

    // V down
    inputs[1].type = INPUT_KEYBOARD;
    inputs[1].ki.wVk = 0;
    inputs[1].ki.wScan = vScan;
    inputs[1].ki.dwFlags = KEYEVENTF_SCANCODE;
    inputs[1].ki.time = 0;
    inputs[1].ki.dwExtraInfo = 0;

    // V up
    inputs[2].type = INPUT_KEYBOARD;
    inputs[2].ki.wVk = 0;
    inputs[2].ki.wScan = vScan;
    inputs[2].ki.dwFlags = KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP;
    inputs[2].ki.time = 0;
    inputs[2].ki.dwExtraInfo = 0;

    // Ctrl up
    inputs[3].type = INPUT_KEYBOARD;
    inputs[3].ki.wVk = 0;
    inputs[3].ki.wScan = ctrlScan;
    inputs[3].ki.dwFlags = KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP;
    inputs[3].ki.time = 0;
    inputs[3].ki.dwExtraInfo = 0;

    // Send Ctrl-down first, brief pause, then V-down + V-up + Ctrl-up
    UINT sent1 = SendInput(1, &inputs[0], sizeof(INPUT));
    if (sent1 != 1) return 1;

    Sleep(10);

    UINT sent2 = SendInput(3, &inputs[1], sizeof(INPUT));
    if (sent2 != 3) return 2;

    return 0;
}

int main() {
    Sleep(50);
    return SendCtrlV();
}
