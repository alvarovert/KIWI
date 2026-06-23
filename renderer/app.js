// GESTOR DE VISTAS Y ESTADO GLOBAL
let rutasArchivos = [];
let columnaSeleccionada = null;
let registrosSeleccionados = [];
let rutaSalidaFinal = '';

const views = ['view-inicio', 'view-seleccionados', 'view-aplicar-filtros', 'view-filtros-aplicados', 'view-exito'];

function navigateTo(targetViewId) {
    const currentView = document.querySelector('.view.active');
    const targetView = document.getElementById(targetViewId);

    if (currentView && currentView.id !== targetViewId) {
        currentView.classList.remove('active');
        currentView.classList.add('exit');
        setTimeout(() => currentView.classList.remove('exit'), 350);
    }
    setTimeout(() => targetView.classList.add('active'), 50);
}

function updateLog(selector, message) {
    const el = document.getElementById(selector);
    if(el) el.innerText = message;
}

// Receptor de logs en tiempo real desde Python
window.api.onLog((msg) => {
    console.log(msg);
    updateLog('log-filtros-activos', msg); // Mostramos progreso en la pantalla de carga
    updateLog('log-archivos-seleccionados', msg);
});

// VISTA 1: INICIO (Arrastrar o Clic)
const dropzone = document.getElementById('dropzone');
const btnProcesarInicio = document.getElementById('btn-procesar-inicio');

dropzone.addEventListener('click', async () => {
    const archivos = await window.api.seleccionarArchivos();
    if (archivos && archivos.length > 0) procesarCargaArchivos(archivos);
});

dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const archivos = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.xlsx')).map(f => f.path);
    if (archivos.length > 0) procesarCargaArchivos(archivos);
});

function procesarCargaArchivos(archivos) {
    rutasArchivos = archivos;
    document.getElementById('txt-cantidad-archivos').innerText = `[${rutasArchivos.length}] archivos seleccionados`;
    btnProcesarInicio.removeAttribute('disabled');
    document.querySelector('.drop-text').innerText = `${rutasArchivos.length} archivos cargados`;
}

btnProcesarInicio.addEventListener('click', () => navigateTo('view-seleccionados'));

// VISTA 2: SELECCIONADOS
document.getElementById('btn-aplicar-filtros').addEventListener('click', async () => {
    updateLog('log-archivos-seleccionados', 'Leyendo columnas...');
    try {
        const respuesta = await window.api.ejecutarMotor({ action: 'get_columns', archivos: rutasArchivos });
        renderizarColumnas(respuesta.columnas);
        updateLog('log-archivos-seleccionados', '');
        navigateTo('view-aplicar-filtros');
    } catch (e) {
        updateLog('log-archivos-seleccionados', 'Error al leer columnas');
    }
});

document.getElementById('btn-consolidar-directo').addEventListener('click', () => ejecutarConsolidacion(false));

// VISTA 3: FILTROS
function renderizarColumnas(columnas) {
    const listaCol = document.getElementById('lista-columnas');
    listaCol.innerHTML = '';
    document.getElementById('lista-registros').innerHTML = ''; // Limpiar
    
    columnas.forEach(col => {
        const li = document.createElement('li');
        li.className = 'lista-item';
        li.innerText = col;
        li.onclick = async () => {
            document.querySelectorAll('#lista-columnas .lista-item').forEach(el => el.classList.remove('activo'));
            li.classList.add('activo');
            columnaSeleccionada = col;
            await cargarRegistros(col);
        };
        listaCol.appendChild(li);
    });
}

async function cargarRegistros(columna) {
    const listaReg = document.getElementById('lista-registros');
    listaReg.innerHTML = '<li class="lista-item">Cargando...</li>';
    try {
        const respuesta = await window.api.ejecutarMotor({ action: 'get_unique', archivos: rutasArchivos, columna: columna });
        listaReg.innerHTML = '';
        registrosSeleccionados = []; // Reset
        
        respuesta.registros.forEach(reg => {
            const li = document.createElement('li');
            li.className = 'lista-item';
            li.innerHTML = `<input type="checkbox" style="margin-right:8px; pointer-events:none;"> ${reg}`;
            li.onclick = () => {
                const cb = li.querySelector('input');
                cb.checked = !cb.checked;
                li.classList.toggle('activo', cb.checked);
                
                if (cb.checked) registrosSeleccionados.push(reg);
                else registrosSeleccionados = registrosSeleccionados.filter(item => item !== reg);
            };
            listaReg.appendChild(li);
        });
    } catch (e) {
        listaReg.innerHTML = '<li class="lista-item">Error al cargar registros</li>';
    }
}

document.getElementById('btn-aceptar-filtros').addEventListener('click', () => {
    if (registrosSeleccionados.length > 0) {
        const text = `${columnaSeleccionada}: ${registrosSeleccionados.join(', ')}`;
        document.getElementById('txt-filtro-resumen').innerText = text.length > 40 ? text.substring(0, 40) + '...' : text;
    } else {
        document.getElementById('txt-filtro-resumen').innerText = "Ningún filtro aplicable seleccionado";
        columnaSeleccionada = null;
    }
    navigateTo('view-filtros-aplicados');
});

// VISTA 4: FILTROS APLICADOS
document.getElementById('btn-consolidar-filtrado').addEventListener('click', () => ejecutarConsolidacion(true));

// LÓGICA CORE: EJECUCIÓN DEL MOTOR
async function ejecutarConsolidacion(conFiltro) {
    const pathGuardado = await window.api.solicitarRutaGuardado();
    if (!pathGuardado) return; // El usuario canceló el diálogo

    rutaSalidaFinal = pathGuardado;
    const payload = {
        action: 'consolidate',
        archivos: rutasArchivos,
        ruta_salida: rutaSalidaFinal
    };

    if (conFiltro && columnaSeleccionada && registrosSeleccionados.length > 0) {
        payload.columna_filtro = columnaSeleccionada;
        payload.registros_validos = registrosSeleccionados;
    }

    try {
        const stats = await window.api.ejecutarMotor(payload);
        // Exito
        document.getElementById('stats-exito').innerHTML = `Peso del archivo: ${stats.peso}<br>Cantidad de filas: ${stats.filas}`;
        navigateTo('view-exito');
    } catch (e) {
        alert("Ocurrió un error al consolidar. Verifique los logs.");
    }
}

// VISTA 5: ÉXITO
document.getElementById('btn-descargar').addEventListener('click', () => {
    // Al ser una app local y ya haber pedido la ruta antes, "Descargar" puede simplemente abrir la carpeta contenedora.
    alert(`El archivo ya ha sido guardado exitosamente en:\n${rutaSalidaFinal}`);
    // Opcional: Reiniciar la app
    setTimeout(() => location.reload(), 1500);
});