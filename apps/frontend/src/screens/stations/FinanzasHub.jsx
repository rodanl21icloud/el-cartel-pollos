import Station from '../../components/ui/Station.jsx';
import CashClose from '../CashClose.jsx';
import Cuadre from '../Cuadre.jsx';
import Finanzas from '../Finanzas.jsx';
import Movimientos from '../Movimientos.jsx';

// Estación de Finanzas: Caja · Cuadre de turno · Finanzas · Movimientos.
// Flujo secuencial de caja: abrir -> mover -> arquear/cerrar -> resumen.
export default function FinanzasHub({ onGo, user, role, perms }) {
  const tabs = [
    { key: 'cash', label: 'Caja', perm: 'cash.operate', render: () => <CashClose userName={user.name} /> },
    { key: 'cuadre', label: 'Cuadre de turno', perm: 'reports.view', render: () => <Cuadre /> },
    { key: 'finanzas', label: 'Finanzas', perm: 'reports.view', render: () => <Finanzas role={role} /> },
    { key: 'movimientos', label: 'Movimientos', perm: 'reports.view', render: () => <Movimientos onGo={onGo} canVoid={!!perms['sales.void']} /> },
  ];
  return <Station tabs={tabs} perms={perms} />;
}
