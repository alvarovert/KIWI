const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs'); // Necesario para mover el archivo final
const { spawn } = require('child_process');
const readline = require('readline');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 600, height: 300, 
        icon: path.join(__dirname, 'src/icon.ico'),
        useContentSize: true, // CRÍTICO: Fuerza a que el interior mida 600x300, revelando el footer.
        resizable: false, maximizable: false, autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js')
        }
    });
    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('dialog:openFiles', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'], filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    });
    return result.filePaths;
});

ipcMain.handle('dialog:saveFile', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Guardar consolidado', defaultPath: 'Consolidado.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    return result.filePath;
});

// NUEVO: Rutas temporales para el flujo de guardado retrasado
ipcMain.handle('file:getTempPath', () => {
    return path.join(app.getPath('temp'), `kiwi_temp_${Date.now()}.csv`);
});

ipcMain.handle('file:moveFinal', (event, tempPath, finalPath) => {
    try {
        fs.copyFileSync(tempPath, finalPath);
        fs.unlinkSync(tempPath);
        return true;
    } catch (e) {
        console.error("Error al mover archivo:", e);
        return false;
    }
});

// EL MOTOR CON SOPORTE PARA MODO DESARROLLO SIN COMPILAR
ipcMain.handle('engine:run', (event, payload) => {
    return new Promise((resolve, reject) => {
        
        let pythonProcess;
        
        if (app.isPackaged) {
            // Cuando la app ya esté exportada para el cliente final
            const enginePath = path.join(process.resourcesPath, 'engine', process.platform === 'win32' ? 'consol_engine.exe' : 'consol_engine');
            pythonProcess = spawn(enginePath);
        } else {
            // MODO DESARROLLO: Ejecuta directamente el script .py (¡Ya no requiere compilar a cada rato!)
            const scriptPath = path.join(__dirname, 'backend', 'consol_engine.py');
            pythonProcess = spawn('python', [scriptPath]);
        }

        let outputData = null;

        pythonProcess.stdin.write(JSON.stringify(payload) + '\n');
        pythonProcess.stdin.end();

        const rl = readline.createInterface({ input: pythonProcess.stdout, terminal: false });

        rl.on('line', (line) => {
            if (!line.trim()) return;
            try {
                const parsed = JSON.parse(line);
                if (parsed.status === 'log') mainWindow.webContents.send('engine:log', parsed.message);
                else if (parsed.status === 'success') outputData = parsed.data;
                else if (parsed.status === 'error') reject(parsed.message);
            } catch (e) { console.error("Ignorado:", line); }
        });

        pythonProcess.stderr.on('data', (data) => console.error(`Error Backend: ${data}`));
        pythonProcess.on('close', (code) => {
            if (code === 0 && outputData) resolve(outputData);
            else reject(`Fallo en Python (Cód: ${code}). Asegúrate de tener pandas instalado.`);
        });
    });
});