# KIWI - Consolida archivos Excel y Exporta a CSV 

[![Electron](https://img.shields.io/badge/Electron-2B2E3A?style=for-the-badge&logo=electron&logoColor=9FEAF9)](https://www.electronjs.org/)
[![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/es/docs/Web/JavaScript)

## 📌 Descripción del Proyecto

**KIWI** es una herramienta de escritorio multiplataforma (Windows / macOS) diseñada para automatizar la consolidación y limpieza de grandes volúmenes de datos dispersos en múltiples archivos Excel (`.xlsx`, `.xls`).

### 💡 Problema que resuelve
El trabajo manual con múltiples hojas de cálculo suele ser propenso a errores, consume demasiado tiempo y requiere procesos repetitivos de formateo. **KIWI** simplifica este flujo permitiendo al usuario:
* Consolidar múltiples archivos Excel en un único archivo estandarizado.
* Aplicar filtros de datos y seleccionar o descartar columnas específicas de manera intuitiva.
* Exportar el resultado procesado directamente a formato `.csv` optimizado para análisis posterior o carga en bases de datos.

---

## 🛠️ Stack Tecnológico

El proyecto está construido bajo una arquitectura híbrida que separa la experiencia de usuario (Frontend) de los procesos pesados de manipulación de datos (Backend):

* **Frontend (Desktop UI):** [Electron](https://www.electronjs.org/) (Node.js, HTML5, CSS3, JavaScript ES6).
* **Backend (Data Processing Engine):** [Python](https://www.python.org/) ejecutable embebido (compilado mediante `PyInstaller`) para manipulación eficiente de estructuras de datos.
* **Comunicación:** Interproceso IPC (Inter-Process Communication) entre el proceso principal de Electron y el motor interno de Python.

---

## 🚀 Instalación y Ejecución en Desarrollo

### Requisitos previos
* Node.js(https://nodejs.org/) (Versión 16 u superior) 
* Python 3.x(https://www.python.org/) 

### Pasos para ejecutar en local

1. **Clonar el repositorio:**
   ```bash
   git clone [https://github.com/alvarovert/KIWI.git](https://github.com/alvarovert/KIWI.git)
   cd KIWI
   ```

2. **Instalar dependencias de Node.js:**
   ```bash
   npm install
   ```

3. **Iniciar la aplicación en entorno de desarrollo:**
   ```bash
   npm start
   ```

---

## 📦 Compilación y Generación de Ejecutables

Para generar los instaladores de producción (`.exe` o `.dmg`):

```bash
# Compilar script de Python
npm run build:python

# Generar el ejecutable de la aplicación de escritorio
npm run dist
```

---

## ✒️ Autor

* **Alvaro Menacho** - *Desarrollador de Software* - [@alvarovert](https://github.com/alvarovert)
