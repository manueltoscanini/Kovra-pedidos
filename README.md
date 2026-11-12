# KOVRA

Carta web para pedidos en la barra de una discoteca. La compra como invitado está disponible en todo momento. Una cuenta iniciada recibe 5 % de descuento, calculado en el servidor.

Usá un solo repositorio para React y Express. Vite compila la carta y Express sirve el frontend y la API desde el mismo dominio.

## Demo local

Requiere Node.js 22.13 o superior. SQLite crea el archivo local de datos al iniciar.

```powershell
npm install
npm run build
npm start
```

- Abrí [la carta](http://localhost:3000) y agregá un producto. En el pedido, elegí un resultado de pago simulado.
- Abrí [el panel de barra](http://localhost:3000/barra) en otra pestaña. Usá `barra-demo-2026` si conservaste la configuración inicial. Tomá el pedido, marcá listo y registrá la entrega con el código que aparece en el celular. Confirmá la recepción en la pantalla del cliente.
- Abrí el [cierre de noche](http://localhost:3000/dueno) con `dueno-demo-2026`. La noche se agrupa de 06:00 a 06:00 en horario de Montevideo. Los cobros y tiempos se contabilizan desde que se empiezan a registrar estas marcas de tiempo.
- En **QR por sector** del panel de barra podés descargar los QR de Entrada general, Pista, VIP y Terraza. Todos indican retiro en la barra principal y guardan el sector en el pedido.
- La carta actualiza disponibilidad y precios cada tres segundos. El combo de fernet y lager se agota si falta uno de los dos y admite el mismo 5 % de las cuentas.
- El [QR de la carta](http://localhost:3000/api/qr) apunta a `PUBLIC_URL`. Para probar desde otro dispositivo en la misma red, configurá `HOST=0.0.0.0`, `PUBLIC_URL=http://IP-LOCAL:3000` y una clave de barra propia en `.env`. Para los webhooks necesitás una URL HTTPS pública.
- Ejecutá `npm test` para verificar el recorrido de API con servicios externos simulados.

## Demo pública en Railway

1. Subí el código a un repositorio de GitHub y conectalo a un servicio de Railway. El catálogo inicial se crea automáticamente al arrancar. El archivo de SQLite y las variables con credenciales quedan fuera de Git.
2. En el servicio de Railway, agregá un volumen montado en `/data`. Usá una sola instancia del servicio.
3. Generá un dominio público desde **Networking**. En **Variables**, configurá:

   ```dotenv
   HOST=0.0.0.0
   DB_PATH=/data/entrepista.sqlite
   PUBLIC_URL=https://tu-dominio.up.railway.app
   DEMO=1
   STAFF_PASSWORD=reemplazar-por-una-clave-propia
   OWNER_PASSWORD=reemplazar-por-otra-clave-propia
   ```

   Reemplazá el dominio por el que asignó Railway. Usá dos claves propias, distintas y de al menos 12 caracteres. Railway asigna `PORT`.
4. En **Settings**, usá `npm run build` como **Build Command** y `npm start` como **Start Command**. Desplegá y probá la carta y `/barra`. El QR de la carta se genera con el dominio configurado en `PUBLIC_URL`.
5. Hacé un pedido simulado y verificá que siga disponible después de un redespliegue. Eso comprueba que la aplicación está usando el volumen.

[Guía de Express en Railway](https://railway.com/guides/express) · [Volúmenes de Railway](https://docs.railway.com/volumes)

## MongoDB Atlas

SQLite se usa cuando `MONGODB_URI` está vacía. Para probar con Atlas, configurá `MONGODB_URI` y `MONGODB_DB` en el servidor, habilitá su acceso de red en Atlas y reiniciá. Express selecciona MongoDB con esas variables. Una base nueva arranca con el catálogo de ejemplo.

Para llevar datos de una demo SQLite existente a Atlas, pausá la operación de origen, elegí un nombre de base vacío y corré:

```powershell
npm run import:sqlite -- data/entrepista.sqlite
```

El importador copia productos, cuentas, pedidos y configuración. Los clientes y el personal vuelven a iniciar sesión en el destino. Probá un pedido nuevo y compará el cierre antes de cambiar de base en el despliegue. [Conexión a MongoDB Atlas](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/)

## Telegram

1. Copiá `.env.example` a `.env`. Completá `PUBLIC_URL` con la URL pública HTTPS y `STAFF_PASSWORD` con una clave propia de al menos 12 caracteres.
2. Creá un bot con [BotFather](https://t.me/BotFather). Guardá su usuario sin `@` en `TELEGRAM_BOT` y su token en `TELEGRAM_TOKEN`. Generá un secreto de webhook (por ejemplo con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`) y guardalo en `TELEGRAM_WEBHOOK_SECRET`.
3. Reiniciá la app y registrá el webhook desde el directorio del proyecto. El comando lee las claves desde `.env` y muestra el resultado sin imprimirlas.

```powershell
node --env-file=.env --input-type=module -e "const e=process.env; const r=await fetch('https://api.telegram.org/bot'+e.TELEGRAM_TOKEN+'/setWebhook',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:new URL('/api/hooks/telegram',e.PUBLIC_URL).href,secret_token:e.TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message']})}); const j=await r.json(); console.log(j.ok ? 'Webhook registrado' : 'Error de Telegram '+j.error_code)"
```

En el seguimiento, el cliente abre Telegram y toca «Iniciar». Al quedar listo, el bot envía «Tu pedido está listo. Tu código es 5 7 4 1. Mostralo en la barra.». El código es distinto para cada pedido y el enlace de vinculación vence en 20 minutos. [Telegram Bot API](https://core.telegram.org/bots/api#setwebhook)

## WhatsApp

Completá `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_GRAPH_VERSION`, `WHATSAPP_TEMPLATE` y `WHATSAPP_LANGUAGE` con los valores de Meta. Usá una plantilla aprobada de utilidad con **un parámetro posicional de texto en el cuerpo**, por ejemplo «Tu pedido está listo. Mostrá el código {{1}} en la barra para retirarlo.». Configurá en Meta el idioma exacto de la plantilla. Reiniciá la app. WhatsApp aparece como opción cuando la configuración está completa y pide el número y el consentimiento para ese pedido. [Solicitud de plantilla de Cloud API](https://www.postman.com/meta/whatsapp-business-platform/request/o65u5m5/send-message-template-text)

La indicación «Aviso enviado» significa que la API aceptó la solicitud. Si la llamada falla, el seguimiento conserva el código de retiro. La app borra el destinatario del pedido después del intento de envío o de la entrega.

## Mercado Pago

Completá `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` con las credenciales de prueba de Checkout Pro vía Orders. Configurá el tópico **Order (Mercado Pago)** con `https://TU-DOMINIO/api/hooks/mercadopago`. Probá la compra con la cuenta y tarjeta de prueba que correspondan a la integración uruguaya. La app verifica la firma del webhook y consulta la orden por API antes de marcar el pedido pagado. El modo demo sigue disponible con `DEMO=1`.

Usá datos de prueba para validar todos los servicios antes de un piloto con cobros. El panel indica cuándo revisar un pago tardío o aprobado mientras la barra estaba en pausa. El personal lo resuelve con el cliente y el panel de la pasarela. La verificación de edad en el local forma parte de la operación de entrega. [Checkout Pro vía Orders](https://www.mercadopago.com.uy/developers/es/docs/checkout-pro-orders/overview)
