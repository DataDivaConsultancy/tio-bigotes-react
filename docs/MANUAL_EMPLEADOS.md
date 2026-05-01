# Manual de uso de la plataforma Tío Bigotes / Sebbro Foods

> Manual práctico para empleados — pensado para que puedas usar la aplicación desde el primer día sin necesidad de conocimientos técnicos.

---

## 1. Introducción

La plataforma **Tío Bigotes / Sebbro Foods** (`app.sebbrofoods.com`) es la herramienta interna que usamos para:

- Consultar **ventas** y rendimiento de cada local en tiempo casi real.
- Llevar el **control diario** de producción, mermas y notas del turno.
- Gestionar el **catálogo de productos** y los **precios de venta**.
- Subir las **ventas del TPV** mediante archivos CSV.
- Llevar el **módulo de compras**: proveedores, pedidos, recepciones, incidencias y facturas.
- Gestionar **empleados, roles y permisos**.
- Consultar el **Forecast / Predicción de demanda** para producir lo justo.

Como empleado, según tu rol verás unas pantallas u otras. Si echas en falta alguna sección, pídele al administrador que te dé acceso.

---

## 2. Cómo entrar a la aplicación

1. Abre el navegador (Chrome o Edge recomendados) y entra en **https://app.sebbrofoods.com**.
2. Introduce tu **email** y **contraseña**.
3. La primera vez que entres, la app te pedirá que **cambies la contraseña**. Pon una segura y memorízala.
4. Al entrar, aterrizarás directamente en el **Dashboard / BI**: gráficos de ventas, productos y locales.

> **Nota:** la pantalla de inicio es ahora el BI. Antes había una pantalla de menús, pero ese menú ya está en el sidebar (la barra lateral izquierda), así que se ha eliminado para no duplicar.

---

## 3. Cómo usar el menú lateral

El **sidebar** (barra lateral) es tu navegador principal. Está agrupado en bloques:

- **Inicio (BI)** → vuelve a la pantalla principal de analítica.
- **Gestión** → Productos, Escandallos, Simulador, Dashboard márgenes, Precios de Venta, Empleados, Roles.
- **Operaciones** → Control Diario, Historial / BI, Forecast, Pendientes.
- **Datos** → Subir CSV Ventas, Mapeo TPV → Productos, Subir CSV Productos, Auditoría.
- **Compras** → Dashboard Compras, Proveedores, Locales, Gestión de Stock, Pedidos, Recepciones, Incidencias, Facturas Compra.
- **Sistema** → Configuración.

Puedes plegar el sidebar pulsando la flechita que aparece en su borde derecho. En móvil aparece como un icono de menú (≡) en la parte superior.

---

## 4. Pantalla BI / Dashboard

Es la pantalla principal y la primera que ves al entrar.

**Qué muestra:**

- Total de **ventas** del periodo seleccionado.
- **Tickets** (cuántas ventas distintas).
- **Productos más vendidos**.
- Comparación con el **mismo periodo del año anterior** (mismo día de la semana).
- Desglose por **local** y por **categoría**.

**Cómo leerla:**

- **Filtros de fecha** arriba: Hoy, Ayer, 7 días, 30 días, Este mes, Mes anterior, Este año.
- También puedes elegir un rango personalizado.
- Filtra por **local** o **categoría** si quieres ver algo más concreto.

**Qué hacer si no aparecen datos:**

1. Revisa el rango de fechas (a lo mejor estás en un periodo sin ventas).
2. Quita los filtros de local y categoría para ver todo.
3. Comprueba que se han cargado las ventas más recientes (mira la sección "Subir CSV Ventas").

---

## 5. Carga de ventas / CSV

**Pantalla:** Datos → Subir CSV Ventas.

**Paso a paso:**

1. Pulsa **"Seleccionar archivo"** o arrastra el CSV a la zona indicada.
2. La app te muestra una **previsualización** y el **mapeo de columnas** (qué columna del CSV corresponde a qué campo del sistema).
3. Si es la primera vez con un TPV nuevo, ajusta el mapeo. La app guarda esa configuración y la próxima vez la aplica sola.
4. Pulsa **"Importar"**.
5. Espera al mensaje de confirmación: "X filas importadas, Y errores".

**Formato del archivo:**

- Debe ser un **CSV** (texto separado por comas o punto y coma).
- Codificación recomendada: **UTF-8**. Si tu Excel guarda en otra codificación, ábrelo y elige "Guardar como > CSV UTF-8".
- Las **fechas** deben ir en formato día/mes/año o año-mes-día.

**Antes de subir, revisa:**

- Que el archivo es del periodo correcto.
- Que no estás subiendo dos veces el mismo CSV (la app detecta duplicados, pero es más limpio evitarlo).

**Si hay error:**

- Lee el mensaje de error: suele indicar la fila o columna con problema.
- Errores típicos: columna sin mapear, fecha mal formateada, números con texto.

**Si hay duplicados:**

- La app avisa y permite **saltar** o **forzar** la importación.
- Si dudas, salta y consulta a tu administrador.

---

## 6. Control diario

**Pantalla:** Operaciones → Control Diario.

Sirve para registrar lo que pasa cada día en tienda.

**Cómo registrar:**

1. Selecciona el día (por defecto, hoy).
2. Selecciona el local.
3. Rellena las cantidades en cada producto (producción, mermas, pruebas).
4. Añade **notas** si hay algo a destacar (incidencias, eventos, clima).
5. Pulsa **"Guardar"**.

**Por qué es importante:**

- Estos datos alimentan el BI y el Forecast.
- Si no se rellena, las predicciones son menos fiables y luego no se sabe qué pasó ese día.
- Es la fuente de verdad para revisar el día siguiente o más adelante.

---

## 7. Productos

**Pantalla:** Gestión → Productos.

**Cómo ver:**

- Lista con buscador, filtros por categoría y por local.
- Indicador de productos activos / inactivos.

**Cómo editar:**

1. Haz clic en el producto.
2. Modifica los campos (nombre, categoría, precio, descripción, foto).
3. Pulsa **"Guardar"**.

**Campos importantes:**

- **Nombre y categoría**: para que aparezca bien en el BI.
- **Precio de venta**: se usa para los importes futuros.
- **Activo / Inactivo**: si lo desactivas, ya no se vende.

> Para cambios masivos de precios, usa la pantalla **"Precios de Venta"**.

---

## 8. Empleados

**Pantalla:** Gestión → Empleados.

**Cómo crear:**

1. Pulsa **"Nuevo empleado"** (arriba a la derecha).
2. Rellena: nombre, email, teléfono, rol.
3. Selecciona las pantallas a las que tendrá acceso, o usa un rol predefinido (recomendado).
4. Pulsa **"Guardar"**.

**Datos obligatorios:**

- Nombre
- Email (único, sirve como usuario de login)
- Rol

**Antes de guardar, revisa:**

- Que el email no está repetido.
- Que el rol asignado es el correcto (un cajero no debería tener acceso a Configuración, por ejemplo).
- El empleado deberá cambiar su contraseña la primera vez que entre.

**Roles:** se gestionan en **Gestión → Roles**. Cada rol agrupa pantallas. Es más fácil dar un rol que marcar pantallas a mano.

---

## 9. Predicción / IA (Forecast)

**Pantalla:** Operaciones → Forecast.

**Para qué sirve:**

- Estima la **demanda futura** (próximos días) en base al histórico.
- Recomienda cantidades para **producir** o **pedir**.

**Cómo interpretarla:**

- **Línea principal:** previsión de unidades para los próximos días.
- Por producto: número recomendado, con indicador de confianza.
- Tiene en cuenta el día de la semana y el mismo día del año anterior.

**Límites:**

- No predice eventos extraordinarios (huelgas, fiestas locales, mal tiempo extremo).
- Necesita histórico: cuanto más datos, más fiable.

**Cómo usarla en tienda:**

- Úsala como **guía**, no como verdad absoluta.
- Si hay un evento que vaya a cambiar la demanda, ajusta a mano.
- Revisa al final del día si las cantidades fueron correctas.

---

## 10. Chat de ayuda

En la esquina inferior derecha verás un **botón naranja** con un símbolo de interrogación (?). Es el **asistente de ayuda**.

**Cómo usarlo:**

1. Pulsa el botón → se abre un panel de chat.
2. Escribe tu pregunta o pulsa uno de los ejemplos.
3. El asistente responde con instrucciones paso a paso.

**Ejemplos de preguntas:**

- ¿Cómo cargo ventas?
- ¿Cómo veo el BI?
- ¿Cómo creo un empleado?
- ¿Cómo subo un CSV?
- ¿Cómo interpreto la predicción?
- ¿Qué hago si me da error?

**Si la respuesta no resuelve tu problema:**

- Reformula la pregunta con otras palabras.
- Pulsa el icono de **papelera** para limpiar la conversación y empezar de nuevo.
- Si sigue sin ayudarte, avisa al administrador con captura de pantalla del problema.

---

## 11. Errores frecuentes

| Error                       | Qué hacer |
|-----------------------------|-----------|
| **No carga la página**      | Recarga (F5). Comprueba conexión a internet. Cierra sesión y vuelve a entrar. |
| **No aparecen datos**       | Revisa el rango de fechas y los filtros. Comprueba permisos. Verifica que haya ventas cargadas. |
| **Error al subir CSV**      | Comprueba codificación UTF-8, formato de fechas y mapeo de columnas. |
| **Archivo duplicado**       | Probable que ya esté subido. Mira en Auditoría. Salta la importación. |
| **Fechas incorrectas**      | El CSV puede estar en formato anglosajón. Avisa al administrador para corregir. |
| **Sesión caducada**         | Vuelve a iniciar sesión. |
| **Pantalla blanca**         | Espera 8 segundos: la app intenta repararse sola. Si no, recarga. |
| **"No tienes acceso"**      | Tu rol no incluye esa pantalla. Pide al administrador que te dé permiso. |
| **Sin conexión**            | Verás un banner amarillo. Los cambios se guardan en el dispositivo y se sincronizan al recuperar la red. |
| **Cambios pendientes**      | Banner azul con número de cambios. Pulsa "Sincronizar ahora" si no se sincroniza solo. |

---

## 12. Buenas prácticas

- **Revisa los datos antes de guardar.** Mejor 30 segundos extra que un dato mal cargado.
- **No subas archivos duplicados.** Antes de subir, mira en Auditoría qué se subió hoy.
- **Usa siempre fechas correctas** (día/mes/año). Si dudas, abre el archivo antes de subir.
- **Consulta el BI al inicio y al final del día.** Te da contexto de cómo va la tienda.
- **Rellena el Control Diario todos los días.** Sin esto, el Forecast pierde precisión.
- **Cierra sesión** cuando termines en un dispositivo compartido.
- **Pide ayuda** al chat de ayuda o al administrador antes de tocar algo que no entiendes.

---

## Soporte

- **Chat de ayuda en la app:** botón naranja abajo a la derecha.
- **Administrador interno:** Horacio (Tío Bigotes / Sebbro Foods).
- **Reporte de errores:** anota qué pasó, en qué pantalla, qué pulsaste, y haz captura. Envíala al administrador.

---

*Última actualización: 2026-05-01 — versión integrada con BI como pantalla de inicio y asistente de ayuda flotante.*
