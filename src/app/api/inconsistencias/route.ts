import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await requireRoles(["almacen", "controller", "admin"]);
    if (error) return error;
    void user;

    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get("tipo") ?? undefined;
    const resuelto = searchParams.get("resuelto") ?? undefined;
    const limit = Number(searchParams.get("limit") ?? "50");
    const offset = Number(searchParams.get("offset") ?? "0");

    const supabase = getSupabase();

    let query = supabase.from("inconsistencias").select(`*, usuario:usuarios!inconsistencias_usuario_id_fkey(nombre, rol)`, { count: "exact" });

    if (tipo) {
      query = query.eq("tipo", tipo);
    }
    if (resuelto !== undefined) {
      query = query.eq("resuelto", resuelto === "true");
    }

    query = query.order("fecha_detectada", { ascending: false }).range(offset, offset + limit - 1);

    const { data, error: dbError, count } = await query;

    if (dbError) {
      return Response.json({ error: dbError.message }, { status: 500 });
    }

    return Response.json({
      inconsistencias: data ?? [],
      total: count ?? 0,
      hasMore: (offset ?? 0) + (data ?? []).length < (count ?? 0),
    });
  } catch (e: any) {
    return Response.json({ error: e.message ?? "Error inesperado" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requireRoles(["controller", "admin"]);
    if (error) return error;

    const body = await request.json();
    const { tipo, entidad_id, descripcion, metadata } = body ?? {};

    if (!tipo || !entidad_id || !descripcion) {
      return Response.json({ error: "Faltan campos obligatorios: tipo, entidad_id, descripcion" }, { status: 400 });
    }

    const supabase = getSupabase();

    const { data, error: dbError } = await supabase
      .from("inconsistencias")
      .insert({
        tipo,
        entidad_id,
        descripcion,
        metadata,
        usuario_id: user?.id,
      })
      .select()
      .single();

    if (dbError) {
      return Response.json({ error: dbError.message }, { status: 500 });
    }

    return Response.json({ inconsistencia: data }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message ?? "Error inesperado" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user, error } = await requireRoles(["controller", "admin"]);
    if (error) return error;

    const body = await request.json();
    const { id, resuelto } = body ?? {};

    if (!id || resuelto === undefined) {
      return Response.json({ error: "Faltan campos obligatorios: id, resuelto" }, { status: 400 });
    }

    const supabase = getSupabase();

    const { data, error: dbError } = await supabase
      .from("inconsistencias")
      .update({ resuelto })
      .eq("id", id)
      .select()
      .single();

    if (dbError) {
      return Response.json({ error: dbError.message }, { status: 500 });
    }

    return Response.json({ inconsistencia: data });
  } catch (e: any) {
    return Response.json({ error: e.message ?? "Error inesperado" }, { status: 500 });
  }
}
