import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  fetchGames: async () => {
    try {
      const response = await fetch('https://raw.githubusercontent.com/I-FOX-Development/gameshub_backend/refs/heads/main/games.json');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching games:', error);
      return [];
    }
  },
  ipcRenderer: ipcRenderer  // Exposing the ipcRenderer to the renderer
});
