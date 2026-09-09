# API Pública de Catálogo — Persys

Endpoint de solo lectura con el catálogo de productos y su stock. Se usa para la
web de la empresa (catálogo para clientes). No requiere instalar nada: es una URL
HTTP que devuelve JSON.

## URL

```
GET https://persys-dos.vercel.app/api/public/catalogo
```

## Autenticación

Obligatoria, por **header** (no va en la URL). La clave se entrega por separado:

```
x-api-key: <CATALOGO_API_KEY>
```

- Sin header o con clave incorrecta → `401 {"error":"Clave no válida"}`.
- Más de 30 peticiones por minuto por IP → `429 {"error":"Demasiadas peticiones"}`.

## Respuesta

```json
{
  "actualizado_en": "2026-09-09T21:00:00.000Z",
  "total": 123,
  "productos": [
    {
      "imei": "P001",
      "nombre": "Chompa cuello redondo",
      "tipo_talla": "A",
      "precio_referencial": 79.9,
      "stock_almacen": { "M": 5, "L": 2 },
      "stock_ventas": { "M": 3, "L": 0 }
    }
  ]
}
```

Campos:

| Campo               | Descripción                                            |
| ------------------- | ------------------------------------------------------ |
| `imei`              | Código único del producto                              |
| `nombre`            | Nombre del producto                                    |
| `tipo_talla`        | Escala de tallas (`A`, `B`, `C`, `AB`, `sin_talla`...) |
| `precio_referencial`| Precio de venta referencial                            |
| `stock_almacen`     | Unidades físicas en almacén, por talla                 |
| `stock_ventas`      | Unidades disponibles para vender, por talla            |

`stock_ventas` = unidades en almacén **menos** las ya comprometidas en pedidos
activos. Es la regla de disponibilidad que usa el sistema. Solo aparecen
productos activos. La respuesta se cachea 15 s (`Cache-Control`).

## Filtro opcional por IMEI

```
GET https://persys-dos.vercel.app/api/public/catalogo?imei=P001
```

Devuelve el mismo formato pero con un solo producto (o `total: 0` si no existe).

## Ejemplo (Node/fetch)

```js
const res = await fetch("https://persys-dos.vercel.app/api/public/catalogo", {
  headers: { "x-api-key": "<CATALOGO_API_KEY>" },
});
if (!res.ok) throw new Error(await res.text());
const { productos } = await res.json();
```

## Ejemplo (curl)

```bash
curl -H "x-api-key: <CATALOGO_API_KEY>" \
  https://persys-dos.vercel.app/api/public/catalogo
```