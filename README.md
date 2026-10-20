# Prototipo de decisiones crediticias con Laya

El proyecto tiene dos servicios en Docker Compose:

- **Model**: Python con FastAPI REST en el puerto `8000`, gRPC en el `50051` y el [Router de Laya](https://github.com/NandhaKishorM/laya). La pregunta `choice` produce la decisión y `score` produce el rango.
- **Webui**: Astro con SQLite en el puerto `4321`. Permite gestionar empresas y valores predeterminados, probar el modelo, consultar métricas y guardar historiales si se activa esa opción.

## Inicio

Este espacio de trabajo tiene un archivo `.env` generado con la contraseña inicial y secretos distintos para la sesión, la comunicación interna y la API del modelo. Mantenlo privado. Para otra instalación, copia `.env.example` a `.env` y reemplaza todos sus valores.

```bash
docker compose up --build -d
```

Abre `http://localhost:4321`. Ingresa como `admin` con `ADMIN_INITIAL_PASSWORD` del archivo `.env` y cambia la contraseña cuando se solicite. La base de datos siempre crea la empresa `default`. Puedes editar sus reglas, instrucciones de decisión y rango, opciones y niveles en la pestaña **Empresas**. Una empresa desconocida o no indicada usa los valores de `default`.

La primera inferencia descarga el checkpoint multilingüe de Laya desde Hugging Face al volumen `model_cache`; requiere acceso a internet y puede tardar. Webui conserva SQLite en el volumen `webui_data`.

## Idioma español

Todas las llamadas del servicio fijan `model="multilingual"` y `lang="es"`; Laya no selecciona automáticamente el checkpoint inglés. Las instrucciones predeterminadas por empresa, reglas iniciales, opciones (`aprobar`, `revision_manual`, `rechazar`) y niveles de rango están en español. Los datos de entrada y las reglas que envíe cada cliente deben estar redactados en español. Los valores originales del modelo se devuelven sin alterar; las claves técnicas del JSON, como `answers` y `usage`, pertenecen al contrato de Laya. La pestaña **Probar modelo** muestra una vista localizada de la respuesta.

Si ya existe una base SQLite creada por la versión inglesa, el inicio añade las columnas de instrucciones y asigna las preguntas españolas iniciales. También traduce solamente los otros valores que todavía coincidan exactamente con los valores predeterminados originales. Las políticas editadas por el usuario se conservan.

## Solicitud REST

Envía `Authorization: Bearer <MODEL_API_KEY>` al servicio del modelo:

```bash
curl http://localhost:8000/v1/decide \
  -H "Authorization: Bearer $MODEL_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"company":"default","history":"Pagó 12 cuotas a tiempo; tiene un retraso reciente.","output":"both"}'
```

Los campos del contrato son `company`, `state`, `rules`, `history`, `instruction_decision`, `instruction_rank`, `output`, `options` y `rank_limits`. `output` acepta `decision`, `rank` o `both`; por defecto usa `both`. `options` y `rank_limits` son arreglos de texto. Los niveles de rango se ordenan de menor a mayor. Las reglas, opciones, rangos e instrucciones omitidos se consultan en Webui en cada solicitud. Cada instrucción predeterminada debe contener entre 1 y 250 caracteres; una instrucción enviada en la solicitud la sustituye solo para esa llamada.

Si se envía `state`, se entrega directamente a Laya. En caso contrario, `rules` y `history` se escapan como XML en `<estado_crediticio><reglas>…</reglas><historial>…</historial></estado_crediticio>`. Se requiere historial si no hay estado. Los límites son `state`: 20.000 caracteres; `rules`: 5.000; `history`: 15.000; cada instrucción: 250. El estado XML final también tiene un límite de 20.000 caracteres. Una infracción devuelve HTTP 422 con un mensaje en español.

Laya recibe `max_len=8192` y `head_max_len=512`. Estos límites de tokens son independientes de los límites de caracteres. Consulta la [documentación de Laya sobre el contexto](https://github.com/NandhaKishorM/laya#honest-limits).

## gRPC

El esquema está en [Model/proto/decision.proto](Model/proto/decision.proto). El RPC `DecisionService.Decide` usa los mismos campos. Incluye el metadato `authorization: Bearer <MODEL_API_KEY>`. `model_output_json` contiene el resultado de Laya serializado como JSON. Los límites inválidos devuelven `INVALID_ARGUMENT` y los servicios no disponibles devuelven `UNAVAILABLE`.

## Datos y acceso

SQLite se guarda en `/data/webui.db`. La tabla `traffic` registra hora, empresa, modo, estado HTTP, latencia y tokens de entrada. El interruptor de **Configuración** controla si se guardan el historial y la respuesta del modelo de las solicitudes **nuevas**. Un proceso toma una muestra de salud del modelo cada minuto. Las sesiones del navegador usan cookies firmadas y HTTP only; el administrador debe cambiar la contraseña inicial. Los endpoints internos exigen `INTERNAL_API_TOKEN`.

Las salidas son recomendaciones. La [ficha del modelo Laya](https://huggingface.co/convaiinnovations/laya) indica que sus checkpoints generales requieren evaluación y calibración para cada tarea antes de utilizar sus resultados en decisiones crediticias reales.

## Verificación

Con las dependencias disponibles, ejecuta `PYTHONPATH=Model python -m unittest discover -s Model/tests`, `npm run build` dentro de `Webui` y `docker compose up --build` para una prueba integral.
# layaprototype
