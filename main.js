const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 600,
        height: 300,
        resizable: false,
        maximizable: false,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// DIÁLOGOS NATIVOS
ipcMain.handle('dialog:openFiles', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    });
    return result.filePaths;
});

ipcMain.handle('dialog:saveFile', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Guardar archivo consolidado',
        defaultPath: 'Consolidado.csv',
        filters: [{ name: 'CSV (Delimitado por comas)', extensions: ['csv'] }]
    });
    return result.filePath;
});

// PUENTE AL MOTOR DE PYTHON (BACKEND)
ipcMain.handle('engine:run', (event, payload) => {
    return new Promise((resolve, reject) => {
        // Resuelve la ruta del binario tanto en modo de desarrollo como empacado en producción
        let enginePath;
        if (app.isPackaged) {
            enginePath = path.join(process.resourcesPath, 'engine', process.platform === 'win32' ? 'consol_engine.exe' : 'consol_engine');
        } else {
            enginePath = path.join(__dirname, 'backend', 'dist', 'consol_engine', process.platform === 'win32' ? 'consol_engine.exe' : 'consol_engine');
        }

        const pythonProcess = spawn(enginePath);
        let outputData = '';

        // Pasar el payload como string JSON al stdin del proceso de Python
        pythonProcess.stdin.write(JSON.stringify(payload));
        pythonProcess.stdin.end();

        // Escuchar el stdout estructurado
        pythonProcess.stdout.on('data', (data) => {
            const lines = data.toString().trim().split('\n');
            lines.forEach(line => {
                if(!line) return;
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.status === 'log') {
                        mainWindow.webContents.send('engine:log', parsed.message);
                    } else if (parsed.status === 'success') {
                        outputData = parsed.data; // Almacenamos el payload exitoso
                    } else if (parsed.status === 'error') {
                        mainWindow.webContents.send('engine:log', `ERROR: ${parsed.message}`);
                        reject(parsed.message);
                    }
                } catch (e) {
                    console.log("No-JSON Output:", line);
                }
            });
        });

        pythonProcess.on('close', (code) => {
            if (code === 0 && outputData) {
                resolve(outputData);
            } else {
                reject(`Proceso terminado con código ${code}`);
            }
        });
    });
});