# API Pública de Catálogo — Persys

Endpoint de solo lectura con el catálogo de productos y su stock. Se usa para la
web de la empresa (catálogo para clientes). No requiere instalar nada ni enviar
ninguna clave: es una URL HTTP que devuelve JSON.

## URL

```
GET https://persys-dos.vercel.app/api/public/catalogo
```

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
productos activos. La respuesta se cachea 15 s (`Cache-Control`). Hay un límite
anti-abuso de 60 peticiones por minuto por IP (`429` si se supera).

## Filtro opcional por IMEI

```
GET https://persys-dos.vercel.app/api/public/catalogo?imei=P001
```

Devuelve el mismo formato pero con un solo producto (o `total: 0` si no existe).

## Ejemplo (Node/fetch)

```js
const res = await fetch("https://persys-dos.vercel.app/api/public/catalogo");
if (!res.ok) throw new Error(await res.text());
const { productos } = await res.json();
```

## Ejemplo (curl)

```bash
curl https://persys-dos.vercel.app/api/public/catalogo
```