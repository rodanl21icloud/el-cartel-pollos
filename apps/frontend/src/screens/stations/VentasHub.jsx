import Station from '../../components/ui/Station.jsx';
import Pos from '../Pos.jsx';
import Ventas from '../Ventas.jsx';
import CentroOperaciones from '../CentroOperaciones.jsx';
import VentaRetroactiva from '../VentaRetroactiva.jsx';
import Clientes from '../Clientes.jsx';

// Estación de Ventas: POS · Pedidos · Centro de Operaciones · Venta pasada · Clientes.
export default function VentasHub({ onGo, user, perms }) {
  const tabs = [
    { key: 'pos', label: 'Punto de venta', perm: 'pos.sell', render: () => <Pos onNavigate={onGo} /> },
    { key: 'ventas', label: 'Pedidos', perm: 'pos.sell', render: () => <Ventas canVoid={!!perms['sales.void']} /> },
    { key: 'operaciones', label: 'Centro de Operaciones', perm: 'cash.operate', render: () => <CentroOperaciones /> },
    { key: 'retroactiva', label: 'Venta pasada', perm: 'sales.backdate', render: () => <VentaRetroactiva user={user} /> },
    { key: 'clientes', label: 'Clientes', perm: 'pos.sell', render: () => <Clientes /> },
  ];
  return <Station tabs={tabs} perms={perms} />;
}
