import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const ALL_SCREENS = [
  'Productos',
  'Empleados',
  'Roles',
  'Operativa',
  'BI',
  'Forecast',
  'Pendientes',
  'CargaVentas',
  'Auditoria',
  'Proveedores',
  'ProductosCompra',
  'Locales',
  'Stock',
];

const SCREEN_LABELS: Record<string, string> = {
  Productos: 'Productos',
  Empleados: 'Empleados',
  Roles: 'Roles',
  Operativa: 'Control Diario',
  BI: 'Historial / BI',
  Forecast: 'Forecast',
  Pendientes: 'Pendientes',
  CargaVentas: 'Subir CSV Ventas',
  Auditoria: 'Auditoría',
  Proveedores: 'Proveedores',
  ProductosCompra: 'Productos Compra',
  Locales: 'Locales',
  Stock: 'Gestión de Stock',
};

interface RolePerms {
  rol: string;
  permisos: string[];
  isNew?: boolean;
}

export default function Roles() {
  const [roles, setRoles] = useState<RolePerms[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [showNewRol, setShowNewRol] = useState(false);

  useEffect(() => {
    fetchRoles();
  }, []);

  async function fetchRoles() {
    setLoading(true);
    // Get all distinct roles with their permisos
    const { data, error } = await supabase
      .from('empleados_v2')
      .select('rol, permisos');

    if (error) {
      console.error('Error fetching roles:', error);
      setLoading(false);
      return;
    }

    // Group by rol, take the first permisos found for each rol
    const rolMap = new Map<string, string[]>();
    (data || []).forEach((emp: any) => {
      if (emp.rol && !rolMap.has(emp.rol)) {
        rolMap.set(emp.rol, emp.permisos || []);
      }
    });

    const rolesArr: RolePerms[] = [];
    rolMap.forEach((permisos, rol) => {
      rolesArr.push({ rol, permisos: [...permisos] });
    });

    // Sort: superadmin first
    rolesArr.sort((a, b) => {
      if (a.rol === 'superadmin') return -1;
      if (b.rol === 'superadmin') return 1;
      return a.rol.localeCompare(b.rol);
    });

    setRoles(rolesArr);
    setLoading(false);
  }

  function togglePermiso(rolIdx: number, screen: string) {
    setRoles((prev) => {
      const updated = [...prev];
      const role = { ...updated[rolIdx] };
      const perms = [...role.permisos];
      const idx = perms.indexOf(screen);
      if (idx >= 0) {
        perms.splice(idx, 1);
      } else {
        perms.push(screen);
      }
      role.permisos = perms;
      updated[rolIdx] = role;
      return updated;
    });
  }

  function toggleAll(rolIdx: number) {
    setRoles((prev) => {
      const updated = [...prev];
      const role = { ...updated[rolIdx] };
      if (role.permisos.length === ALL_SCREENS.length) {
        role.permisos = [];
      } else {
        role.permisos = [...ALL_SCREENS];
      }
      updated[rolIdx] = role;
      return updated;
    });
  }

  function addNewRol() {
    const name = newRoleName.trim().toLowerCase();
    if (!name) return;
    if (roles.some((r) => r.rol === name)) {
      setMsg('Ya existe un rol con ese nombre');
      setTimeout(() => setMsg(''), 3000);
      return;
    }
    setRoles((prev) => [...prev, { rol: name, permisos: [], isNew: true }]);
    setNewRoleName('');
    setShowNewRol(false);
  }

  function removeNewRol(rolIdx: number) {
    setRoles((prev) => prev.filter((_, i) => i !== rolIdx));
  }

  async function saveAll() {
    setSaving(true);
    setMsg('');
    try {
      for (const role of roles) {
        // Update permisos for all employees with this rol
        const { error } = await supabase
          .from('empleados_v2')
          .update({ permisos: role.permisos })
          .eq('rol', role.rol);

        if (error) {
          // If it's a new role with no employees yet, that's fine
          if (!role.isNew) {
            throw error;
          }
        }
      }
      setMsg('Permisos guardados correctamente');
      // Clear isNew flags
      setRoles((prev) => prev.map((r) => ({ ...r, isNew: false })));
    } catch (err: any) {
      setMsg('Error al guardar: ' + (err.message || err));
    }
    setSaving(false);
    setTimeout(() => setMsg(''), 4000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Roles y Permisos</h1>
        <div className="flex gap-2">
          {!showNewRol && (
            <button
              onClick={() => setShowNewRol(true)}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
            >
              + Nuevo rol
            </button>
          )}
          <button
            onClick={saveAll}
            disabled={saving}
            className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`p-3 rounded-lg text-sm ${
            msg.includes('Error') || msg.includes('existe')
              ? 'bg-red-50 text-red-700'
              : 'bg-green-50 text-green-700'
          }`}
        >
          {msg}
        </div>
      )}

      {showNewRol && (
        <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
          <input
            type="text"
            placeholder="Nombre del nuevo rol"
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addNewRol()}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm flex-1"
            autoFocus
          />
          <button
            onClick={addNewRol}
            className="px-3 py-1.5 bg-black text-white rounded text-sm hover:bg-gray-800"
          >
            Añadir
          </button>
          <button
            onClick={() => {
              setShowNewRol(false);
              setNewRoleName('');
            }}
            className="px-3 py-1.5 bg-gray-200 text-gray-600 rounded text-sm hover:bg-gray-300"
          >
            Cancelar
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-600 sticky left-0 bg-gray-50 min-w-[140px]">
                Rol
              </th>
              {ALL_SCREENS.map((screen) => (
                <th
                  key={screen}
                  className="px-3 py-3 font-medium text-gray-600 text-center min-w-[90px]"
                >
                  <span className="text-xs leading-tight block">
                    {SCREEN_LABELS[screen] || screen}
                  </span>
                </th>
              ))}
              <th className="px-3 py-3 font-medium text-gray-600 text-center min-w-[70px]">
                <span className="text-xs">Todos</span>
              </th>
              <th className="px-3 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {roles.map((role, ridx) => (
              <tr
                key={role.rol}
                className="border-b border-gray-100 hover:bg-gray-50"
              >
                <td className="px-4 py-3 font-medium text-gray-900 sticky left-0 bg-white">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        role.rol === 'superadmin'
                          ? 'bg-amber-500'
                          : 'bg-blue-500'
                      }`}
                    />
                    {role.rol}
                  </div>
                </td>
                {ALL_SCREENS.map((screen) => (
                  <td key={screen} className="px-3 py-3 text-center">
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={role.permisos.includes(screen)}
                        onChange={() => togglePermiso(ridx, screen)}
                        className="sr-only peer"
                      />
                      <div
                        className={`w-9 h-5 rounded-full transition-colors ${
                          role.permisos.includes(screen)
                            ? 'bg-black'
                            : 'bg-gray-200'
                        } relative`}
                      >
                        <div
                          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                            role.permisos.includes(screen)
                              ? 'translate-x-4'
                              : 'translate-x-0.5'
                          }`}
                        />
                      </div>
                    </label>
                  </td>
                ))}
                <td className="px-3 py-3 text-center">
                  <button
                    onClick={() => toggleAll(ridx)}
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      role.permisos.length === ALL_SCREENS.length
                        ? 'bg-black text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {role.permisos.length === ALL_SCREENS.length
                      ? 'Quitar'
                      : 'Todos'}
                  </button>
                </td>
                <td className="px-3 py-3 text-center">
                  {role.isNew && (
                    <button
                      onClick={() => removeNewRol(ridx)}
                      className="text-red-400 hover:text-red-600 text-lg"
                      title="Eliminar rol"
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Los cambios en permisos se aplican a todos los empleados con el rol
        seleccionado. Los empleados nuevos heredarán los permisos del rol
        asignado.
      </p>
    </div>
  );
}
