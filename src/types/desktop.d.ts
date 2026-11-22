interface Window {
  cornoteDesktop?: {
    saveBackup(filename: string, contents: string): Promise<void>
  }
}
