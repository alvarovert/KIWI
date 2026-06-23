const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    seleccionarArchivos: () => ipcRenderer.invoke('dialog:openFiles'),
    solicitarRutaGuardado: () => ipcRenderer.invoke('dialog:saveFile'),
    obtenerRutaTemporal: () => ipcRenderer.invoke('file:getTempPath'),
    guardarArchivoFinal: (temp, final) => ipcRenderer.invoke('file:moveFinal', temp, final),
    ejecutarMotor: (payload) => ipcRenderer.invoke('engine:run', payload),
    onLog: (callback) => ipcRenderer.on('engine:log', (event, msg) => callback(msg))
});