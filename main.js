import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';
import unzipper from 'unzipper';
import { spawn } from 'child_process';

let mainWindow;

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('index.html');
});

ipcMain.on('download-game', async (event, { gameName, zipLink }) => {
  const gamesDir = path.join(app.getPath('userData'), 'games');
  const gameDir = path.join(gamesDir, gameName);

  // Ensure the game directory exists
  if (!fs.existsSync(gamesDir)) {
    fs.mkdirSync(gamesDir, { recursive: true });
  }

  // Creating the specific game directory
  if (!fs.existsSync(gameDir)) {
    fs.mkdirSync(gameDir, { recursive: true });
  }

  try {
    // Fetch the game zip
    const response = await fetch(zipLink);
    if (!response.ok) throw new Error(`Failed to fetch ${zipLink}`);

    const totalBytes = parseInt(response.headers.get('content-length'), 10) || 0;
    let downloadedBytes = 0;

    // Correct file path handling for spaces
    const zipPath = path.join(gameDir, `${gameName}.zip`);
    const fileStream = fs.createWriteStream(zipPath);

    // Listening for the data stream and reporting download progress
    response.body.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      const progress = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
      event.sender.send('download-progress', { gameName, progress });
    });

    response.body.pipe(fileStream);

    fileStream.on('finish', async () => {
      // Extract the zip file
      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: gameDir }))
        .on('close', () => {
          fs.unlinkSync(zipPath); // Remove the zip file after extraction
          event.sender.send('download-complete', { gameName });

          // Check if the game has a gameinfo.json file to launch it
          const gameInfoPath = path.join(gameDir, 'gameinfo.json');
          if (fs.existsSync(gameInfoPath)) {
            const gameInfo = JSON.parse(fs.readFileSync(gameInfoPath, 'utf-8'));
            launchGame(gameInfo, gameDir);
          } else {
            event.sender.send('download-complete', { gameName, error: 'gameinfo.json not found' });
          }
        })
        .on('error', (err) => {
          event.sender.send('download-complete', { gameName, error: err.message });
        });
    });

    fileStream.on('error', (err) => {
      event.sender.send('download-complete', { gameName, error: err.message });
    });
  } catch (err) {
    event.sender.send('download-complete', { gameName, error: err.message });
  }
});

// Function to launch the game
function launchGame(gameInfo, gameDir) {
  const pythonCommand = process.platform === 'darwin' ? 'python3' : 'python'; // Use python3 on macOS

  if (gameInfo.type === 'python') {
    const pythonPath = path.join(gameDir, gameInfo.mainFile);
    try {
      const pythonProcess = spawn(pythonCommand, [pythonPath], { cwd: gameDir });
      pythonProcess.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
      });

      pythonProcess.on('close', (code) => {
        console.log(`Python process exited with code ${code}`);
      });
    } catch (error) {
      console.error('Error launching Python game:', error);
    }
  } else if (gameInfo.type === 'javascript') {
    const jsPath = path.join(gameDir, gameInfo.mainFile);
    try {
      const jsProcess = spawn('node', [jsPath], { cwd: gameDir });
      jsProcess.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
      });

      jsProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
      });

      jsProcess.on('close', (code) => {
        console.log(`Node.js process exited with code ${code}`);
      });
    } catch (error) {
      console.error('Error launching JavaScript game:', error);
    }
  } else {
    console.error('Unknown game type:', gameInfo.type);
  }
}
