; electron-builder's default "is the app running?" check
; (_CHECK_APP_RUNNING in node_modules/app-builder-lib/templates/nsis/
; include/allowOnlyOneInstallerInstance.nsh) tries a non-forceful
; `taskkill /im StageForge.exe` first -- which only works against a
; process with a visible top-level window -- then a forceful one, but
; only by exact image name, with no /T to also reach child processes.
; It gives up after ~6 seconds of retries and blocks with "the
; application cannot be closed" (found live, 28 Aug 2026: uninstall
; refused with the app's own window already closed).
;
; main.js spawns the Next.js server AND the Postgres worker
; (pgWorker.js) as further copies of this same StageForge.exe binary,
; just running headless in Node mode (ELECTRON_RUN_AS_NODE=1) -- so
; more than one process shares this image name, none of them with a
; window, and the real postgres.exe engine underneath is a further
; untracked child of the worker. Any one of those can outlast the
; default check's short, gentle retry budget.
;
; customCheckAppRunning fully replaces electron-builder's default check
; (see CHECK_APP_RUNNING's own !ifmacrodef branch) for both install and
; uninstall -- one immediate, forceful, tree-aware kill by image name
; covers every process above in a single command, with no reliance on
; a visible window or a short retry window.
!macro customCheckAppRunning
  nsExec::Exec 'taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
  Sleep 500
!macroend

; Belt-and-braces: if anything respawned between the check above and
; the uninstaller actually deleting files, catch it here too, right
; before file removal.
!macro customUnInstall
  nsExec::Exec 'taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
!macroend
