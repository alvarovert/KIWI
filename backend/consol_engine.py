import pandas as pd
import os
import sys
import json
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def enviar_respuesta(status, data=None, message=None):
    response = {"status": status}
    if data is not None: response["data"] = data
    if message is not None: response["message"] = message
    print(json.dumps(response))
    sys.stdout.flush()

def obtener_columnas(archivos):
    # IDEA DEL USUARIO: Ordenar los archivos por tamaño (el más liviano primero)
    archivos_ordenados = sorted(archivos, key=lambda x: os.path.getsize(x) if os.path.exists(x) else float('inf'))
    
    for ruta in archivos_ordenados:
        try:
            df = pd.read_excel(ruta, nrows=0, engine='openpyxl')
            columnas = df.columns.tolist()
            if columnas:
                enviar_respuesta("success", data={"columnas": columnas})
                return
        except Exception as e:
            enviar_respuesta("log", message=f"Omitiendo {os.path.basename(ruta)}: {str(e)}")
    
    enviar_respuesta("error", message="No se encontraron columnas válidas.")

def obtener_registros_unicos(archivos, columna):
    valores_unicos = set()
    # IDEA DEL USUARIO: Ordenar los archivos por tamaño para leer los registros más rápido
    archivos_ordenados = sorted(archivos, key=lambda x: os.path.getsize(x) if os.path.exists(x) else float('inf'))
    
    for ruta in archivos_ordenados:
        try:
            df = pd.read_excel(ruta, usecols=[columna], engine='openpyxl')
            valores_unicos.update(df[columna].dropna().unique().tolist())
            break # MAGIA: Lee el más pequeño, saca los únicos y se detiene.
        except Exception as e:
            enviar_respuesta("log", message=f"Omitiendo archivo {os.path.basename(ruta)}: {str(e)}")
            continue
            
    if valores_unicos:
        enviar_respuesta("success", data={"registros": sorted(list(valores_unicos))})
    else:
        enviar_respuesta("error", message=f"No se encontraron datos para la columna '{columna}'.")

def consolidar_archivos(archivos, ruta_salida, columna_filtro=None, registros_validos=None):
    dataframes = []
    for ruta in archivos:
        try:
            df = pd.read_excel(ruta, engine='openpyxl')
            if columna_filtro and registros_validos:
                if columna_filtro in df.columns:
                    df = df[df[columna_filtro].isin(registros_validos)].copy()
                else:
                    df = pd.DataFrame()
            if not df.empty:
                df['Archivo_Origen'] = os.path.basename(ruta)
                dataframes.append(df)
        except Exception as e:
            enviar_respuesta("log", message=f"Fallo en {os.path.basename(ruta)}: {str(e)}")

    if not dataframes:
        enviar_respuesta("error", message="Ningún dato válido para consolidar.")
        return

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
        enviar_respuesta("error", message=f"Fallo crítico en Python: {str(e)}")

if __name__ == "__main__":
    main()