import pandas as pd
import os
import sys
import json

def enviar_respuesta(status, data=None, message=None):
    """Envía una salida estructurada en JSON por stdout para que Node.js la parsee."""
    response = {"status": status}
    if data is not None:
        response["data"] = data
    if message is not None:
        response["message"] = message
    print(json.dumps(response))
    sys.stdout.flush()

def obtener_columnas(archivos):
    """Extrae las columnas del primer archivo válido (asumiendo estructura homogénea)."""
    for ruta in archivos:
        try:
            df = pd.read_excel(ruta, nrows=0)
            columnas = df.columns.tolist()
            enviar_respuesta("success", data={"columnas": columnas})
            return
        except Exception as e:
            enviar_respuesta("log", message=f"LOG_WARN: No se pudo leer {os.path.basename(ruta)}")
    enviar_respuesta("error", message="No se encontraron columnas válidas en los archivos proporcionados.")

def obtener_registros_unicos(archivos, columna):
    """Extrae los valores únicos de una columna específica combinando todos los archivos."""
    valores_unicos = set()
    for ruta in archivos:
        try:
            df = pd.read_excel(ruta, usecols=[columna])
            valores_unicos.update(df[columna].dropna().unique().tolist())
        except ValueError:
            enviar_respuesta("log", message=f"LOG_WARN: La columna '{columna}' no existe en {os.path.basename(ruta)}.")
        except Exception as e:
            enviar_respuesta("log", message=f"LOG_WARN: Error al procesar {os.path.basename(ruta)} - {str(e)}")
            
    enviar_respuesta("success", data={"registros": sorted(list(valores_unicos))})

def consolidar_archivos(archivos, ruta_salida, columna_filtro=None, registros_validos=None):
    """Une los archivos, inyecta la trazabilidad, filtra y exporta a CSV utf-8-sig."""
    dataframes = []
    
    for ruta in archivos:
        try:
            enviar_respuesta("log", message=f"Procesando: {os.path.basename(ruta)}...")
            df = pd.read_excel(ruta)
            
            # Tolerancia a fallos: Si hay filtro pero el archivo no tiene la columna
            if columna_filtro and registros_validos:
                if columna_filtro in df.columns:
                    df = df[df[columna_filtro].isin(registros_validos)].copy()
                else:
                    enviar_respuesta("log", message=f"LOG_WARN: Columna '{columna_filtro}' ausente en {os.path.basename(ruta)}. Archivo omitido/procesado sin filtro.")
                    df = pd.DataFrame() # Omitimos los registros de este archivo si no tiene la columna a filtrar
            
            # Inyección de metadatos de trazabilidad
            if not df.empty:
                df['Archivo_Origen'] = os.path.basename(ruta)
                dataframes.append(df)
                
        except Exception as e:
            enviar_respuesta("log", message=f"LOG_WARN: Error fatal en {os.path.basename(ruta)}: {str(e)}")

    if not dataframes:
        enviar_respuesta("error", message="Ningún dato válido para consolidar.")
        return

    enviar_respuesta("log", message="Concatenando datos y generando archivo final...")
    df_final = pd.concat(dataframes, ignore_index=True)
    
    # Exportar (utf-8-sig requerido por PRD para MS Excel)
    df_final.to_csv(ruta_salida, encoding='utf-8-sig', index=False)
    
    # Calcular estadísticas finales
    peso_bytes = os.path.getsize(ruta_salida)
    peso_mb = round(peso_bytes / (1024 * 1024), 2)
    peso_formateado = f"{peso_mb} mb" if peso_mb >= 1 else f"{round(peso_bytes / 1024, 2)} kb"
    
    enviar_respuesta("success", data={
        "peso": peso_formateado,
        "filas": len(df_final)
    })

def main():
    # Leer input en formato JSON enviado por Electron a través de stdin
    linea = sys.stdin.read()
    if not linea:
        return
        
    try:
        payload = json.loads(linea)
        accion = payload.get("action")
        archivos = payload.get("archivos", [])
        
        if accion == "get_columns":
            obtener_columnas(archivos)
        elif accion == "get_unique":
            columna = payload.get("columna")
            obtener_registros_unicos(archivos, columna)
        elif accion == "consolidate":
            ruta_salida = payload.get("ruta_salida")
            columna_filtro = payload.get("columna_filtro")
            registros_validos = payload.get("registros_validos")
            consolidar_archivos(archivos, ruta_salida, columna_filtro, registros_validos)
        else:
            enviar_respuesta("error", message="Acción desconocida.")
    except Exception as e:
        enviar_respuesta("error", message=str(e))

if __name__ == "__main__":
    main()