/**
 * Base de conocimiento del chat de ayuda.
 *
 * Cada entrada tiene un conjunto de palabras clave (en minúsculas, sin tildes)
 * y una respuesta en español pensada para empleados no técnicos. La búsqueda
 * es por matching de palabras clave: la entrada con más coincidencias gana.
 *
 * Para añadir respuestas nuevas: añade un objeto al array. Para conectar
 * a OpenAI/Claude más adelante, basta con sustituir la función findAnswer
 * por una llamada a la API y dejar el FAQ como fallback.
 */

export interface FAQEntry {
  id: string
  pregunta: string
  keywords: string[]
  respuesta: string
}

export const FAQ: FAQEntry[] = [
  {
    id: 'bi',
    pregunta: '¿Cómo veo el BI?',
    keywords: ['bi', 'analitica', 'analítica', 'dashboard', 'historial', 'ventas', 'graficos', 'gráficos', 'panel'],
    respuesta:
`Al entrar a la aplicación ya estás en la pantalla del BI / Dashboard.
Si has navegado a otro sitio, vuelve haciendo clic en el menú lateral en "Historial / BI".

Pasos rápidos:
1. Elige el rango de fechas arriba (Hoy, 7 días, Este mes, etc.).
2. Filtra por local o categoría si quieres ver algo concreto.
3. Mira los gráficos: ventas por día, productos más vendidos, comparación con el año anterior.

Si no aparecen datos: revisa el rango de fechas y que haya ventas cargadas para ese periodo.`,
  },
  {
    id: 'cargar-ventas',
    pregunta: '¿Cómo cargo ventas?',
    keywords: ['cargar', 'cargo', 'subir', 'csv', 'ventas', 'importar', 'importacion', 'importación', 'archivo'],
    respuesta:
`Para subir un CSV de ventas:
1. En el menú lateral abre "Subir CSV Ventas".
2. Pulsa el botón "Seleccionar archivo" y elige tu CSV.
3. Comprueba que el archivo tiene las columnas correctas (fecha, ticket, producto, cantidad, importe).
4. Pulsa "Subir / Importar".
5. Si el sistema avisa de duplicados, revisa antes de continuar.

Consejos:
- Usa siempre el formato del TPV (fecha en formato europeo).
- No subas dos veces el mismo archivo: la app detecta duplicados pero es más limpio evitarlo.
- Si te da error, copia el mensaje y consulta "errores frecuentes" en este chat.`,
  },
  {
    id: 'crear-empleado',
    pregunta: '¿Cómo creo un empleado?',
    keywords: ['empleado', 'empleados', 'crear', 'nuevo', 'usuario', 'alta', 'añadir', 'anadir'],
    respuesta:
`Para crear un empleado:
1. En el menú lateral abre "Empleados".
2. Pulsa el botón "Nuevo empleado" (arriba a la derecha).
3. Rellena nombre, email, teléfono y rol.
4. Asigna las pantallas a las que tendrá acceso (o usa un rol predefinido).
5. Pulsa "Guardar".

Importante:
- El email debe ser único.
- El empleado tendrá que cambiar su contraseña la primera vez que entre.
- Si dudas con los permisos, asigna un rol que ya exista en lugar de marcar pantallas a mano.`,
  },
  {
    id: 'subir-csv',
    pregunta: '¿Cómo subo un CSV?',
    keywords: ['csv', 'subir', 'archivo', 'fichero', 'upload', 'importar'],
    respuesta:
`La app permite subir CSVs en dos sitios:
- "Subir CSV Ventas": para ventas del TPV.
- "Subir CSV Productos": para catálogo de productos.

Pasos:
1. Abre la pantalla correspondiente desde el menú lateral.
2. Pulsa "Seleccionar archivo".
3. Comprueba la previsualización.
4. Confirma la importación.

Recomendaciones:
- Guarda el CSV en UTF-8 para no tener problemas con tildes y eñes.
- Las fechas deben ir en formato día/mes/año o año-mes-día.
- Si el TPV exporta en Excel, ábrelo y "Guardar como CSV (UTF-8)" antes de subir.`,
  },
  {
    id: 'prediccion',
    pregunta: '¿Cómo interpreto la predicción?',
    keywords: ['prediccion', 'predicción', 'forecast', 'ia', 'recomendacion', 'recomendación', 'demanda'],
    respuesta:
`La pantalla "Forecast" muestra una previsión de demanda basada en las ventas históricas.

Cómo leerla:
- La línea principal es la previsión de unidades para los próximos días.
- Junto a cada producto verás un número recomendado para producir o pedir.
- Las recomendaciones tienen en cuenta el día de la semana y el mismo día del año anterior.

Cómo usarla en tienda:
- Úsala como guía, no como verdad absoluta.
- Si el clima o un evento van a cambiar la demanda, ajusta a mano.
- Cuanto más histórico tenga la app, más fiable será la predicción.`,
  },
  {
    id: 'error',
    pregunta: '¿Qué hago si me da error?',
    keywords: ['error', 'falla', 'falló', 'fallo', 'no funciona', 'roto', 'rota', 'problema'],
    respuesta:
`Si te aparece un error, prueba en este orden:
1. Recarga la página (F5 o Ctrl+R).
2. Cierra sesión y vuelve a entrar.
3. Si el error tiene un texto, anótalo o haz una captura.
4. Mira en este chat la sección "Errores frecuentes" más abajo o pregunta por el error concreto.

Errores típicos:
- "No carga la página" → comprueba conexión a internet y recarga.
- "No aparecen datos" → revisa filtros (fechas, locales) y que haya datos cargados.
- "Error al subir CSV" → revisa formato, codificación UTF-8 y columnas.
- "Archivo duplicado" → ya estaba subido; salta ese paso.
- "Sesión caducada" → vuelve a iniciar sesión.

Si nada funciona, avisa al administrador con la captura del error.`,
  },
  {
    id: 'control-diario',
    pregunta: '¿Cómo uso el control diario?',
    keywords: ['control', 'diario', 'operativa', 'produccion', 'producción', 'turno', 'cierre'],
    respuesta:
`"Control Diario" (en el menú lateral) sirve para registrar lo que pasa en tienda cada día:
- Cantidades producidas.
- Mermas y pruebas.
- Notas del turno.

Pasos:
1. Abre "Control Diario".
2. Selecciona el día (por defecto, hoy).
3. Rellena las cantidades en cada producto.
4. Añade notas si hay incidencias.
5. Pulsa "Guardar".

Por qué importa: estos datos alimentan el BI y el Forecast. Si no se rellenan, las previsiones son menos fiables.`,
  },
  {
    id: 'productos',
    pregunta: '¿Cómo veo o edito productos?',
    keywords: ['producto', 'productos', 'catalogo', 'catálogo', 'editar', 'precio'],
    respuesta:
`Para gestionar productos:
1. En el menú lateral pulsa "Productos".
2. Verás la lista con buscador y filtros.
3. Haz clic en un producto para editarlo.
4. Cambia los datos (nombre, precio, categoría) y pulsa "Guardar".

Campos importantes:
- Nombre y categoría: para que aparezcan bien en el BI.
- Precio de venta: se usa para los importes.
- Activo/Inactivo: si lo desactivas, ya no se podrá vender.`,
  },
  {
    id: 'duplicados',
    pregunta: '¿Qué pasa con los duplicados?',
    keywords: ['duplicado', 'duplicados', 'repetido', 'mismo', 'archivo', 'ya existe'],
    respuesta:
`Si subes el mismo archivo dos veces, la app intenta detectarlo y avisa:
- Te muestra un aviso de "ya existe" o "duplicado".
- Puedes saltarte el archivo o forzar la importación.

Buenas prácticas:
- No subas dos veces el mismo CSV.
- Si dudas, mira en "Auditoría" qué se subió antes.
- Si subiste por error datos repetidos, avisa al administrador para limpiarlos.`,
  },
  {
    id: 'fechas',
    pregunta: 'Las fechas se ven mal',
    keywords: ['fecha', 'fechas', 'dia', 'día', 'mes', 'año', 'incorrecta', 'mal'],
    respuesta:
`Las fechas en la app son siempre formato día/mes/año.

Si ves fechas raras:
- Comprueba el rango de fechas de los filtros (arriba en el BI).
- Si subiste un CSV con fechas en formato anglosajón (mm/dd/yyyy), puede que se hayan importado mal: avisa al administrador.
- Recuerda que el mismo día del año anterior se calcula respetando el día de la semana.`,
  },
  {
    id: 'predicción-precio',
    pregunta: 'Sobre precios de venta',
    keywords: ['precio', 'precios', 'venta', 'tarifa', 'subir precio'],
    respuesta:
`En "Precios de Venta" (menú lateral) puedes ver y modificar los precios de cada producto.

Pasos:
1. Abre "Precios de Venta".
2. Busca el producto.
3. Edita el precio en la columna correspondiente.
4. Guarda los cambios.

Aviso: cambiar precios afecta directamente al cálculo del BI (importes futuros). Los importes ya cargados no cambian.`,
  },
  {
    id: 'compras-pedidos',
    pregunta: 'Sobre pedidos de compras',
    keywords: ['pedido', 'pedidos', 'compra', 'compras', 'proveedor', 'proveedores'],
    respuesta:
`Módulo de compras:
- "Proveedores": alta y edición de proveedores.
- "Pedidos": crear y consultar pedidos a proveedor.
- "Recepciones": registrar lo que llega a tienda.
- "Incidencias": registrar problemas (faltas, rotos, retrasos).
- "Facturas Compra": registrar facturas recibidas.

Flujo típico:
1. Creas un pedido.
2. Cuando llega la mercancía, registras la recepción.
3. Si algo falla, abres una incidencia.
4. Cuando llega la factura, la registras y la asocias.`,
  },
  {
    id: 'sin-datos',
    pregunta: 'No aparecen datos',
    keywords: ['no aparecen', 'sin datos', 'vacio', 'vacío', 'no hay', 'nada'],
    respuesta:
`Si una pantalla aparece vacía:
1. Revisa el rango de fechas (puede estar fuera del periodo con datos).
2. Quita los filtros activos (local, categoría, etc.).
3. Comprueba que tienes permisos para esa pantalla.
4. Si nadie ha cargado ventas todavía, lógicamente no hay datos: ve a "Subir CSV Ventas".`,
  },
]

/**
 * Normaliza un texto: minúsculas, sin tildes, sin signos.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Encuentra la mejor respuesta del FAQ para una pregunta del usuario.
 * Devuelve null si no hay coincidencias mínimas.
 */
export function findAnswer(question: string): FAQEntry | null {
  const q = normalize(question)
  if (!q) return null

  let best: FAQEntry | null = null
  let bestScore = 0

  for (const entry of FAQ) {
    let score = 0
    for (const kw of entry.keywords) {
      const k = normalize(kw)
      if (k && q.includes(k)) score += k.length // palabras largas pesan más
    }
    if (score > bestScore) {
      bestScore = score
      best = entry
    }
  }

  // Umbral mínimo: al menos un keyword de 3+ chars debe haber coincidido
  return bestScore >= 3 ? best : null
}

/**
 * Sugerencias mostradas como chips de ejemplo al iniciar el chat.
 */
export const EJEMPLOS = [
  '¿Cómo veo el BI?',
  '¿Cómo cargo ventas?',
  '¿Cómo creo un empleado?',
  '¿Cómo subo un CSV?',
  '¿Cómo interpreto la predicción?',
  '¿Qué hago si me da error?',
]
