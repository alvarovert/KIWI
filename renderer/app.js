let rutasArchivos = [];
let columnaSeleccionada = null;
let registrosSeleccionados = [];
let rutaSalidaFinal = '';
let rutaTemporalMemoria = ''; // Almacena el path temporal del proceso asíncrono

function navigateTo(targetViewId) {
    const currentView = document.querySelector('.view.active');
    const targetView = document.getElementById(targetViewId);
    if (currentView && currentView.id !== targetViewId) {
        currentView.classList.remove('active'); currentView.classList.add('exit');
        setTimeout(() => currentView.classList.remove('exit'), 350);
    }
    setTimeout(() => targetView.classList.add('active'), 50);
}

// FUNCIONES UX: REINICIAR Y AÑADIR MÁS ARCHIVOS
document.getElementById('banner-kiwi').addEventListener('click', () => location.reload()); // Volver al inicio limpiando todo

async function agregarMasArchivos() {
    const archivos = await window.api.seleccionarArchivos();
    if (archivos && archivos.length > 0) {
        const nuevos = archivos.filter(a => !rutasArchivos.includes(a));
        rutasArchivos = rutasArchivos.concat(nuevos);
        actualizarTextosArchivos();
    }
}
document.getElementById('txt-cantidad-archivos').addEventListener('click', agregarMasArchivos);
document.getElementById('txt-cantidad-filtros').addEventListener('click', agregarMasArchivos);

function actualizarTextosArchivos() {
    const txt = `${rutasArchivos.length} cantidad de archivos`;
    document.getElementById('txt-cantidad-archivos').innerText = txt;
    document.getElementById('txt-cantidad-filtros').innerText = txt;
    document.getElementById('dropzone').innerText = `${rutasArchivos.length} archivos cargados`;
    if(rutasArchivos.length > 0) document.getElementById('btn-procesar-inicio').removeAttribute('disabled');
}

// INICIO (Vista 1)
const dropzone = document.getElementById('dropzone');
dropzone.addEventListener('click', agregarMasArchivos);
dropzone.addEventListener('dragover', (e) => e.preventDefault());
dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    const archivos = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.xlsx')).map(f => f.path);
    if (archivos.length > 0) {
        const nuevos = archivos.filter(a => !rutasArchivos.includes(a));
        rutasArchivos = rutasArchivos.concat(nuevos);
        actualizarTextosArchivos();
    }
});

document.getElementById('btn-procesar-inicio').addEventListener('click', () => navigateTo('view-seleccionados'));

// SELECCIONADOS (Vista 2)
document.getElementById('btn-consolidar-directo').addEventListener('click', () => ejecutarConsolidacion(false));
document.getElementById('btn-aplicar-filtros').addEventListener('click', async () => {
    try {
        document.getElementById('btn-aplicar-filtros').innerText = "Cargando columnas...";
        const res = await window.api.ejecutarMotor({ action: 'get_columns', archivos: rutasArchivos });
        renderizarColumnas(res.columnas);
        document.getElementById('btn-aplicar-filtros').innerText = "Aplicar filtros";
        navigateTo('view-aplicar-filtros');
    } catch (e) { alert("Error al leer columnas: " + e); }
});

// FILTROS (Vista 3)
function renderizarColumnas(columnas) {
    const listaCol = document.getElementById('lista-columnas');
    listaCol.innerHTML = ''; document.getElementById('lista-registros').innerHTML = '';
    
    columnas.forEach(col => {
        const li = document.createElement('li');
        li.innerHTML = `<input type="checkbox" readonly> ${col}`;
        li.onclick = async () => {
            document.querySelectorAll('#lista-columnas input').forEach(el => el.checked = false);
            li.querySelector('input').checked = true;
            columnaSeleccionada = col;
            await cargarRegistros(col);
        };
        listaCol.appendChild(li);
    });
}

async function cargarRegistros(columna) {
    const listaReg = document.getElementById('lista-registros');
    listaReg.innerHTML = '<li>Cargando...</li>';
    try {
        const res = await window.api.ejecutarMotor({ action: 'get_unique', archivos: rutasArchivos, columna: columna });
        listaReg.innerHTML = '';
        registrosSeleccionados = [];
        res.registros.forEach(reg => {
            const li = document.createElement('li');
            li.innerHTML = `<input type="checkbox"> ${reg}`;
            li.onclick = (e) => {
                if (e.target.tagName !== 'INPUT') li.querySelector('input').checked = !li.querySelector('input').checked;
                const isChecked = li.querySelector('input').checked;
                if (isChecked && !registrosSeleccionados.includes(reg)) registrosSeleccionados.push(reg);
                if (!isChecked) registrosSeleccionados = registrosSeleccionados.filter(item => item !== reg);
            };
            listaReg.appendChild(li);
        });
    } catch (e) { listaReg.innerHTML = '<li>Error al cargar</li>'; }
}

document.getElementById('btn-aceptar-filtros').addEventListener('click', () => {
    if (registrosSeleccionados.length > 0) {
        document.getElementById('txt-filtro-resumen').innerText = `${columnaSeleccionada}: ${registrosSeleccionados.join(', ')}`;
    } else {
        document.getElementById('txt-filtro-resumen').innerText = "Ningún filtro";
        columnaSeleccionada = null;
    }
    navigateTo('view-filtros-aplicados');
});

// FILTROS APLICADOS (Vista 4)
// UX MEJORADA: Permitir retroceder a modificar el filtro tocando el recuadro
document.getElementById('txt-filtro-resumen').addEventListener('click', () => {
    // Solo permitir retroceder si no está en medio de un proceso de carga
    if(document.getElementById('txt-filtro-resumen').innerText !== "Consolidando...") {
        navigateTo('view-aplicar-filtros');
    }
});
document.getElementById('btn-consolidar-filtrado').addEventListener('click', () => ejecutarConsolidacion(true));

// EXITO / EJECUCIÓN (Lógica Temporal y Guardado Retrasado)
async function ejecutarConsolidacion(conFiltro) {
    // 1. Preguntamos DÓNDE quiere guardarlo
    const pathGuardado = await window.api.solicitarRutaGuardado();
    if (!pathGuardado) return; // Si cancela, no hacemos nada.
    rutaSalidaFinal = pathGuardado;

    // 2. Bloqueamos Interfaz Visual "Consolidando..."
    const btnActivo = conFiltro ? document.getElementById('btn-consolidar-filtrado') : document.getElementById('btn-consolidar-directo');
    const oldTextBtn = btnActivo.innerText;
    btnActivo.innerText = "Procesando...";
    btnActivo.disabled = true;
    
    if(conFiltro) document.getElementById('txt-filtro-resumen').innerText = "Consolidando...";
    else document.getElementById('txt-cantidad-archivos').innerText = "Consolidando...";

    // 3. Generamos ruta fantasma temporal
    rutaTemporalMemoria = await window.api.obtenerRutaTemporal();

    const payload = { action: 'consolidate', archivos: rutasArchivos, ruta_salida: rutaTemporalMemoria };
    if (conFiltro && columnaSeleccionada && registrosSeleccionados.length > 0) {
        payload.columna_filtro = columnaSeleccionada;
        payload.registros_validos = registrosSeleccionados;
    }

    try {
        const stats = await window.api.ejecutarMotor(payload); // Envía a procesar pero guarda en Temp
        document.getElementById('stats-exito').innerHTML = `Peso del archivo: ${stats.peso}<br>Cantidad de filas: ${stats.filas}`;
        const fileName = rutaSalidaFinal.split('\\').pop().split('/').pop();
        document.getElementById('nombre-archivo-exito').innerText = fileName;
        navigateTo('view-exito');
    } catch (e) { 
        alert("Error al consolidar: " + e); 
        // Restaurar botones en caso de error
        btnActivo.innerText = oldTextBtn;
        btnActivo.disabled = false;
        if(conFiltro) document.getElementById('txt-filtro-resumen').innerText = `${columnaSeleccionada}: ${registrosSeleccionados.join(', ')}`;
        else document.getElementById('txt-cantidad-archivos').innerText = `${rutasArchivos.length} cantidad de archivos`;
    }
}

// FINAL (Vista 5): Aquí ocurre el guardado físico real
document.getElementById('btn-descargar').addEventListener('click', async () => {
    document.getElementById('btn-descargar').innerText = "Guardando...";
    document.getElementById('btn-descargar').disabled = true;

    // Movemos el temporal oculto a la ruta final que eligió antes
    const exito = await window.api.guardarArchivoFinal(rutaTemporalMemoria, rutaSalidaFinal);
    
    if(exito) {
        alert(`Archivo guardado exitosamente en:\n${rutaSalidaFinal}`);
        setTimeout(() => location.reload(), 500); // Volvemos al inicio para otro lote
    } else {
        alert("Ocurrió un error al intentar transferir el archivo a la ruta final.");
        document.getElementById('btn-descargar').innerText = "Descargar";
        document.getElementById('btn-descargar').disabled = false;
    }
});