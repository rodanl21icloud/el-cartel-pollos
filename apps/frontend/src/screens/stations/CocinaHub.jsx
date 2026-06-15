import Station from '../../components/ui/Station.jsx';
import Kds from '../Kds.jsx';
import Despacho from '../Despacho.jsx';
import Prediccion from '../Prediccion.jsx';
import Merma from '../Merma.jsx';
import Produccion from '../Produccion.jsx';

// Estación de Cocina y producción: Tablero · Despacho · Producción · Plan de horno · Mermas.
export default function CocinaHub({ perms }) {
  const tabs = [
    { key: 'kds', label: 'Tablero', perm: 'dispatch.manage', render: () => <Kds /> },
    { key: 'despacho', label: 'Despacho', perm: 'dispatch.manage', render: () => <Despacho /> },
    { key: 'produccion', label: 'Producción', perm: 'dispatch.manage', render: () => <Produccion /> },
    { key: 'prediccion', label: 'Plan de horno', perm: 'forecast.view', render: () => <Prediccion /> },
    { key: 'merma', label: 'Mermas', perm: 'inventory.merma', render: () => <Merma /> },
  ];
  return <Station tabs={tabs} perms={perms} />;
}
