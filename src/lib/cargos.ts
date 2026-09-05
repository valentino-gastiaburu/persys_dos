// Tipos compartidos para el módulo de Cargos (documentos impresos del pedido del día).

export type CargoConfig = {
  cargo_duenia_nombre?: string;
  cargo_duenia_dni?: string;
  cargo_duenia_celular?: string;
  cargo_duenia_direccion?: string;
  cargo_encargado_despacho?: string;
};

export type CargoDetalle = {
  imei: string;
  producto_nombre: string;
  talla_stock: string | null;
  talla_vendida: string | null;
  cantidad: number;
  precio_unitario: number;
  genero: string;
  entalle: boolean;
};

export type CargoPedido = {
  pedido_id: string;
  viaje_id: string;
  codigo: string;
  codigo_viaje: string;
  codigo_pedido: string | null;
  nro_viaje: number;
  tipo_pedido: string | null;
  metodo_entrega: string | null;
  fecha_entrega: string | null;
  fecha_viaje: string | null;
  fecha_pago: string | null;
  metodo_pago: string | null;
  empresa_envio: string | null;
  direccion_entrega: string | null;
  ciudad: string | null;
  observaciones: string | null;
  monto_total: number;
  regalo: string | null;
  cliente: {
    nombre: string;
    dni: string | null;
    telefono: string;
    direccion: string | null;
  } | null;
  vendedora: { nombre: string } | null;
  viaje: {
    codigo: string;
    fecha: string;
    estado: string;
    retrasado: boolean;
  } | null;
  detalles: CargoDetalle[];
};

export const METODO_PAGO_LABEL: Record<string, string> = {
  yape: "YAPE",
  bcp: "BCP",
  interbank: "INTERBANK",
  bbva: "BBVA",
  scotiabank: "SCOTIABANK",
  plin: "PLIN",
  banco_nacion: "BANCO DE LA NACIÓN",
  tarjeta_link: "TARJETA LINK",
  efectivo: "EFECTIVO",
};

export const EMPRESA_ENVIO_LABEL: Record<string, string> = {
  motorizado: "MOTORIZADO",
  olva: "OLVA",
  shalom: "SHALOM",
  otros: "OTROS",
};
