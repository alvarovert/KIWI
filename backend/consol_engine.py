import pandas as pd
import polars as pl
import numpy as np
import fastexcel
import os
import sys
import json
import io
# Forzar I/O en UTF-8 para Windows (Electon IPC)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def enviar_respuesta(status, data=None, message=None):
    response = {"status": status}
    if data is not None: response["data"] = data
    if message is not None: response["message"] = message
    print(json.dumps(response))
    sys.stdout.flush()

def get_archivos_ordenados(archivos):
    return sorted(archivos, key=lambda x: os.path.getsize(x) if os.path.exists(x) else float('inf'))

def obtener_columnas(archivos):
    errores_tecnicos = []
    for ruta in get_archivos_ordenados(archivos):
        try:
            df = pl.read_excel(ruta, engine="calamine", has_header=False)
            for row in df.iter_rows():
                if any(c is not None and str(c).strip() != "" for c in row):
                    columnas = [str(c).strip() if c is not None else f"Col_{i}" for i, c in enumerate(row)]
                    enviar_respuesta("success", data={"columnas": columnas})
                    return
        except Exception as e:
            # Atrapamos el error real en lugar de ignorarlo
            errores_tecnicos.append(f"{os.path.basename(ruta)} -> {str(e)}")

    # Enviamos el motivo exacto a tu consola de VS Code / UI
    mensaje = "No se encontraron columnas válidas."
    if errores_tecnicos:
        mensaje += f" CAUSA INTERNA: {errores_tecnicos[0]}"
        
    enviar_respuesta("error", message=mensaje)

def obtener_registros_unicos(archivos, columna):
    valores_unicos = set()
    for ruta in get_archivos_ordenados(archivos):
        try:
            df = pl.read_excel(ruta, engine="calamine", has_header=False)
            col_idx = None
            
            for row in df.iter_rows():
                # Saltar filas completamente vacías
                if not any(c is not None and str(c).strip() != "" for c in row):
                    continue
                    
                if col_idx is None:
                    row_strs = [str(c).strip() if c is not None else "" for c in row]
                    if columna in row_strs:
                        col_idx = row_strs.index(columna)
                else:
                    if col_idx < len(row):
                        val = row[col_idx]
                        if val is not None and str(val).strip() != "":
                            valores_unicos.add(str(val).strip())
                            
            if valores_unicos:
                break 
        except Exception:
            continue
            
    if valores_unicos:
        enviar_respuesta("success", data={"registros": sorted(list(valores_unicos))})
    else:
        enviar_respuesta("error", message=f"No se encontraron datos para la columna '{columna}'.")

def fast_read_excel(ruta, columna_filtro=None, registros_validos=None):
    # 1. LECTURA CRUDA C/RUST (Ultra veloz, sin inferencia de cabeceras)
    df = pl.read_excel(ruta, engine="calamine", has_header=False)
    
    # 2. VECTORIZED GHOST SLICE
    # Crear máscara booleana de columnas (True si la celda es nula o string vacío)
    exprs = []
    for col in df.columns:
        if df.schema[col] == pl.Utf8:
            exprs.append(pl.col(col).is_null() | (pl.col(col).str.strip_chars() == ""))
        else:
            exprs.append(pl.col(col).is_null())
    
    # Evaluar qué filas son 100% fantasmas y pasarlo a un array numpy 1D
    is_empty_arr = df.select(pl.all_horizontal(exprs)).to_series().to_numpy()
    
    # Evaluar el corte del "97 Streak" en hiper-velocidad
    cutoff_idx = len(df)
    streak = 0
    header_idx = -1
    
    for i, is_empty in enumerate(is_empty_arr):
        if is_empty:
            streak += 1
            if streak > 97:
                cutoff_idx = i - 97
                break
        else:
            streak = 0
            if header_idx == -1:
                header_idx = i # Primera fila con datos reales
    
    if header_idx == -1 or header_idx >= cutoff_idx:
        return pd.DataFrame() # El archivo es puro formato fantasma sin datos
        
    # 3. SLICE QUIRÚRGICO (Liberamos la memoria del millón de filas instantáneamente)
    df = df.slice(header_idx, cutoff_idx - header_idx)
    
    # 4. EXTRAER CABECERAS
    header_row = df.row(0)
    columnas_crudas = [str(c).strip() if c is not None else f"Col_{i}" for i, c in enumerate(header_row)]
    
    # Desduplicar columnas (Polars exige columnas únicas)
    seen = set()
    columnas_unicas = []
    for col in columnas_crudas:
        new_col = col
        count = 1
        while new_col in seen:
            new_col = f"{col}_{count}"
            count += 1
        seen.add(new_col)
        columnas_unicas.append(new_col)
        
    # Descartar la fila cabecera y aplicar los nombres de forma segura
    df = df.slice(1)
    df = df.rename(dict(zip(df.columns, columnas_unicas)))
    
    # 5. FILTRADO TEMPRANO (Opcional, reduce aún más la memoria)
    if columna_filtro and registros_validos and columna_filtro in df.columns:
        df = df.filter(
            pl.col(columna_filtro).cast(pl.Utf8).str.strip_chars().is_in(registros_validos)
        )
    
    # 6. METADATA DE ORIGEN
    df = df.with_columns(pl.lit(os.path.basename(ruta)).alias("Archivo_Origen"))
    
    # Retornar como Pandas DataFrame para el pipeline de consolidación final
    return df.to_pandas()

def consolidar_archivos(archivos, ruta_salida, columna_filtro=None, registros_validos=None):
    dataframes = []
    
    if registros_validos:
        registros_validos = [str(r).strip() for r in registros_validos]
    
    for ruta in archivos:
        try:
            enviar_respuesta("log", message=f"Extrayendo datos con Calamine de: {os.path.basename(ruta)}...")
            df = fast_read_excel(ruta, columna_filtro, registros_validos)
            if not df.empty:
                dataframes.append(df)
        except Exception as e:
            enviar_respuesta("log", message=f"Fallo en {os.path.basename(ruta)}: {str(e)}")

    if not dataframes:
        enviar_respuesta("error", message="Ningún dato válido para consolidar.")
        return

    enviar_respuesta("log", message="Escribiendo archivo CSV unificado...")
    df_final = pd.concat(dataframes, ignore_index=True)
    
    df_final.to_csv(ruta_salida, encoding='utf-8-sig', index=False)
    
    peso_bytes = os.path.getsize(ruta_salida)
    peso_mb = round(peso_bytes / (1024 * 1024), 2)
    peso_formateado = f"{peso_mb} gb" if peso_mb >= 1024 else f"{peso_mb} mb" 
    
    enviar_respuesta("success", data={"peso": peso_formateado, "filas": len(df_final)})

def main():
    try:
        linea = sys.stdin.readline()
        if not linea: return
        payload = json.loads(linea)
        
        accion = payload.get("action")
        archivos = payload.get("archivos", [])
        
        if accion == "get_columns": obtener_columnas(archivos)
        elif accion == "get_unique": obtener_registros_unicos(archivos, payload.get("columna"))
        elif accion == "consolidate": consolidar_archivos(archivos, payload.get("ruta_salida"), payload.get("columna_filtro"), payload.get("registros_validos"))
    except Exception as e:
        enviar_respuesta("error", message=f"Fallo crítico en Python (Consol Engine): {str(e)}")

if __name__ == "__main__":
    main()